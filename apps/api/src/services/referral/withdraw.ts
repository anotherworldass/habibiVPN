import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { ensurePromoWallet } from "./bind.js";
import { getReferralConfig } from "./config.js";

function feeFor(amountCents: number, feeBps: number): number {
  return Math.floor((amountCents * feeBps) / 10000);
}

export async function createWithdrawRequest(input: {
  userId: string;
  amountCents: number;
  method: string;
  accountPayload: Prisma.InputJsonValue;
}) {
  const config = await getReferralConfig();
  if (!config.enabled) {
    throw Object.assign(new Error("referral.disabled"), { statusCode: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (user.status !== "active" || !user.promoEnabled) {
    throw Object.assign(new Error("promo.disabled"), { statusCode: 403 });
  }

  if (!config.withdrawMethods.includes(input.method)) {
    throw Object.assign(new Error("withdraw.method_not_allowed"), { statusCode: 400 });
  }
  if (input.amountCents < config.minWithdrawCents) {
    throw Object.assign(new Error("withdraw.below_minimum"), { statusCode: 400 });
  }

  const feeCents = feeFor(input.amountCents, config.withdrawFeeBps);
  const netCents = input.amountCents - feeCents;
  if (netCents <= 0) {
    throw Object.assign(new Error("withdraw.fee_too_high"), { statusCode: 400 });
  }

  await ensurePromoWallet(input.userId);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.promoWallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const spendable = Math.max(0, wallet.availableCents - wallet.frozenCents);
    if (spendable < input.amountCents) {
      throw Object.assign(new Error("withdraw.insufficient_balance"), { statusCode: 400 });
    }

    await tx.promoWallet.update({
      where: { userId: input.userId },
      data: { availableCents: { decrement: input.amountCents } },
    });

    return tx.withdrawRequest.create({
      data: {
        userId: input.userId,
        amountCents: input.amountCents,
        feeCents,
        netCents,
        method: input.method,
        accountPayload: input.accountPayload,
        status: "pending",
      },
    });
  });
}

export async function listUserWithdrawals(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const [total, items] = await Promise.all([
    prisma.withdrawRequest.count({ where: { userId } }),
    prisma.withdrawRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return { total, items };
}

export async function reviewWithdrawRequest(input: {
  id: string;
  action: "approve" | "reject" | "paid";
  adminId: string;
  adminNote?: string;
}) {
  const row = await prisma.withdrawRequest.findUnique({ where: { id: input.id } });
  if (!row) {
    throw Object.assign(new Error("withdraw.not_found"), { statusCode: 404 });
  }

  if (input.action === "approve") {
    if (row.status !== "pending") {
      throw Object.assign(new Error("withdraw.invalid_status"), { statusCode: 400 });
    }
    const updated = await prisma.withdrawRequest.update({
      where: { id: row.id },
      data: {
        status: "approved",
        reviewedBy: input.adminId,
        reviewedAt: new Date(),
        adminNote: input.adminNote,
      },
    });
    await writeAudit({
      actorType: "admin",
      actorId: input.adminId,
      action: "withdraw.approve",
      targetType: "withdraw",
      targetId: row.id,
    });
    return updated;
  }

  if (input.action === "reject") {
    if (row.status !== "pending" && row.status !== "approved") {
      throw Object.assign(new Error("withdraw.invalid_status"), { statusCode: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.promoWallet.update({
        where: { userId: row.userId },
        data: { availableCents: { increment: row.amountCents } },
      });
      return tx.withdrawRequest.update({
        where: { id: row.id },
        data: {
          status: "rejected",
          reviewedBy: input.adminId,
          reviewedAt: new Date(),
          adminNote: input.adminNote,
        },
      });
    });
    await writeAudit({
      actorType: "admin",
      actorId: input.adminId,
      action: "withdraw.reject",
      targetType: "withdraw",
      targetId: row.id,
    });
    return updated;
  }

  // paid
  if (row.status !== "approved" && row.status !== "pending") {
    throw Object.assign(new Error("withdraw.invalid_status"), { statusCode: 400 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.promoWallet.update({
      where: { userId: row.userId },
      data: { withdrawnCents: { increment: row.amountCents } },
    });
    return tx.withdrawRequest.update({
      where: { id: row.id },
      data: {
        status: "paid",
        reviewedBy: input.adminId,
        reviewedAt: new Date(),
        adminNote: input.adminNote,
      },
    });
  });
  await writeAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "withdraw.paid",
    targetType: "withdraw",
    targetId: row.id,
  });
  return updated;
}
