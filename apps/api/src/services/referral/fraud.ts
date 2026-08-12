import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { invalidateCommissionsForOrder } from "./commission.js";
import { applyWalletDelta } from "./wallet.js";

export async function setPromoEnabled(
  userId: string,
  enabled: boolean,
  adminId: string,
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { promoEnabled: enabled },
  });
  await writeAudit({
    actorType: "admin",
    actorId: adminId,
    action: enabled ? "promo.enable" : "promo.disable",
    targetType: "user",
    targetId: userId,
  });
  return user;
}

export async function freezeWallet(
  userId: string,
  frozenCents: number,
  adminId: string,
) {
  if (frozenCents < 0) {
    throw Object.assign(new Error("wallet.invalid_freeze"), { statusCode: 400 });
  }
  const wallet = await prisma.$transaction(async (tx) => {
    return applyWalletDelta(tx, {
      userId,
      entryType: "freeze_set",
      delta: {},
      setFrozenCents: frozenCents,
      refType: "admin",
      refId: adminId,
      actorType: "admin",
      actorId: adminId,
      remark: `set frozen=${frozenCents}`,
    });
  });
  await writeAudit({
    actorType: "admin",
    actorId: adminId,
    action: "wallet.freeze",
    targetType: "user",
    targetId: userId,
    meta: { frozenCents },
  });
  return wallet;
}

export async function invalidateOrderCommissionsByAdmin(
  orderId: string,
  reason: string,
  adminId: string,
) {
  const result = await invalidateCommissionsForOrder(orderId, reason);
  await writeAudit({
    actorType: "admin",
    actorId: adminId,
    action: "commission.admin_invalidate",
    targetType: "order",
    targetId: orderId,
    meta: { reason, ...result },
  });
  return result;
}

export async function invalidateLedgerByAdmin(
  ledgerId: string,
  reason: string,
  adminId: string,
) {
  const row = await prisma.commissionLedger.findUnique({ where: { id: ledgerId } });
  if (!row) {
    throw Object.assign(new Error("commission.not_found"), { statusCode: 404 });
  }
  if (row.status === "invalid") {
    return row;
  }

  await prisma.$transaction(async (tx) => {
    if (row.status === "pending") {
      await applyWalletDelta(tx, {
        userId: row.beneficiaryId,
        entryType: "commission_invalidate_pending",
        delta: { pendingCents: -row.amountCents },
        refType: "commission_ledger",
        refId: row.id,
        actorType: "admin",
        actorId: adminId,
        remark: reason,
      });
    } else if (row.status === "settled") {
      const wallet = await tx.promoWallet.findUnique({
        where: { userId: row.beneficiaryId },
      });
      if (wallet) {
        const fromAvailable = Math.min(wallet.availableCents, row.amountCents);
        const remainder = row.amountCents - fromAvailable;
        await applyWalletDelta(tx, {
          userId: row.beneficiaryId,
          entryType: "commission_clawback",
          delta: {
            availableCents: -fromAvailable,
            ...(remainder > 0 ? { frozenCents: remainder } : {}),
          },
          refType: "commission_ledger",
          refId: row.id,
          actorType: "admin",
          actorId: adminId,
          remark: reason,
        });
      }
    }
    await tx.commissionLedger.update({
      where: { id: ledgerId },
      data: { status: "invalid", invalidReason: reason },
    });
  });

  await writeAudit({
    actorType: "admin",
    actorId: adminId,
    action: "commission.admin_invalidate_ledger",
    targetType: "commission",
    targetId: ledgerId,
    meta: { reason },
  });

  return prisma.commissionLedger.findUniqueOrThrow({ where: { id: ledgerId } });
}
