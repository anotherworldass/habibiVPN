import type { Prisma, WalletCatalogKind } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { ensurePromoWallet } from "./bind.js";
import { getReferralConfig } from "./config.js";
import { applyWalletDelta } from "./wallet.js";

function validateFulfillment(
  kind: WalletCatalogKind,
  payload: Record<string, unknown>,
): Prisma.InputJsonValue {
  if (kind === "phone_credit") {
    const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
    if (!phone || phone.length < 6 || phone.length > 32) {
      throw Object.assign(new Error("spend.phone_required"), { statusCode: 400 });
    }
    return { phone };
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email || !email.includes("@") || email.length > 200) {
    throw Object.assign(new Error("spend.email_required"), { statusCode: 400 });
  }
  return { email };
}

export async function listCatalogItems(
  projectId: string,
  opts: { forUser?: boolean } = {},
) {
  return prisma.walletCatalogItem.findMany({
    where: {
      projectId,
      ...(opts.forUser
        ? {
            enabled: true,
            OR: [{ stock: null }, { stock: { gt: 0 } }],
          }
        : {}),
    },
    orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
  });
}

export async function createCatalogItem(input: {
  projectId: string;
  kind: WalletCatalogKind;
  name: string;
  description?: string | null;
  faceValueCents: number;
  priceCents: number;
  enabled?: boolean;
  sort?: number;
  stock?: number | null;
  remark?: string | null;
}) {
  if (input.faceValueCents <= 0 || input.priceCents <= 0) {
    throw Object.assign(new Error("catalog.amount_invalid"), { statusCode: 400 });
  }
  if (input.stock != null && input.stock < 0) {
    throw Object.assign(new Error("catalog.stock_invalid"), { statusCode: 400 });
  }
  return prisma.walletCatalogItem.create({
    data: {
      projectId: input.projectId,
      kind: input.kind,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      faceValueCents: input.faceValueCents,
      priceCents: input.priceCents,
      enabled: input.enabled ?? true,
      sort: input.sort ?? 0,
      stock: input.stock ?? null,
      remark: input.remark?.trim() || null,
    },
  });
}

export async function updateCatalogItem(
  id: string,
  projectId: string,
  input: {
    kind?: WalletCatalogKind;
    name?: string;
    description?: string | null;
    faceValueCents?: number;
    priceCents?: number;
    enabled?: boolean;
    sort?: number;
    stock?: number | null;
    remark?: string | null;
  },
) {
  const existing = await prisma.walletCatalogItem.findFirst({
    where: { id, projectId },
  });
  if (!existing) {
    throw Object.assign(new Error("catalog.not_found"), { statusCode: 404 });
  }
  if (input.faceValueCents != null && input.faceValueCents <= 0) {
    throw Object.assign(new Error("catalog.amount_invalid"), { statusCode: 400 });
  }
  if (input.priceCents != null && input.priceCents <= 0) {
    throw Object.assign(new Error("catalog.amount_invalid"), { statusCode: 400 });
  }
  if (input.stock != null && input.stock < 0) {
    throw Object.assign(new Error("catalog.stock_invalid"), { statusCode: 400 });
  }
  return prisma.walletCatalogItem.update({
    where: { id },
    data: {
      ...(input.kind != null ? { kind: input.kind } : {}),
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.faceValueCents != null ? { faceValueCents: input.faceValueCents } : {}),
      ...(input.priceCents != null ? { priceCents: input.priceCents } : {}),
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.sort != null ? { sort: input.sort } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.remark !== undefined ? { remark: input.remark?.trim() || null } : {}),
    },
  });
}

async function decrementCatalogStock(tx: Prisma.TransactionClient, catalogItemId: string) {
  const item = await tx.walletCatalogItem.findUnique({ where: { id: catalogItemId } });
  if (!item || item.stock == null) return;
  const updated = await tx.walletCatalogItem.updateMany({
    where: { id: catalogItemId, stock: { gt: 0 } },
    data: { stock: { decrement: 1 } },
  });
  if (updated.count === 0) {
    throw Object.assign(new Error("catalog.out_of_stock"), { statusCode: 400 });
  }
}

async function restoreCatalogStock(tx: Prisma.TransactionClient, catalogItemId: string) {
  const item = await tx.walletCatalogItem.findUnique({ where: { id: catalogItemId } });
  if (!item || item.stock == null) return;
  await tx.walletCatalogItem.update({
    where: { id: catalogItemId },
    data: { stock: { increment: 1 } },
  });
}

export async function createSpendRequest(input: {
  userId: string;
  catalogItemId: string;
  fulfillmentPayload: Record<string, unknown>;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const config = await getReferralConfig(user.projectId);
  if (!config.enabled) {
    throw Object.assign(new Error("referral.disabled"), { statusCode: 400 });
  }
  if (!config.catalogSpendEnabled) {
    throw Object.assign(new Error("catalog.spend_disabled"), { statusCode: 403 });
  }
  if (user.status !== "active" || !user.promoEnabled) {
    throw Object.assign(new Error("promo.disabled"), { statusCode: 403 });
  }

  const item = await prisma.walletCatalogItem.findFirst({
    where: {
      id: input.catalogItemId,
      projectId: user.projectId,
      enabled: true,
      OR: [{ stock: null }, { stock: { gt: 0 } }],
    },
  });
  if (!item) {
    throw Object.assign(new Error("catalog.not_found"), { statusCode: 404 });
  }

  const fulfillmentPayload = validateFulfillment(item.kind, input.fulfillmentPayload);
  await ensurePromoWallet(input.userId);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.promoWallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const spendable = Math.max(0, wallet.availableCents - wallet.frozenCents);
    if (spendable < item.priceCents) {
      throw Object.assign(new Error("spend.insufficient_balance"), { statusCode: 400 });
    }

    const request = await tx.walletSpendRequest.create({
      data: {
        userId: input.userId,
        projectId: user.projectId,
        catalogItemId: item.id,
        itemName: item.name,
        kind: item.kind,
        faceValueCents: item.faceValueCents,
        priceCents: item.priceCents,
        fulfillmentPayload,
        status: "pending",
      },
    });

    await decrementCatalogStock(tx, item.id);

    await applyWalletDelta(tx, {
      userId: input.userId,
      entryType: "spend_hold",
      delta: { availableCents: -item.priceCents },
      refType: "wallet_spend",
      refId: request.id,
      actorType: "user",
      actorId: input.userId,
      remark: item.name,
    });

    return request;
  });
}

export async function listUserSpends(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const [total, items] = await Promise.all([
    prisma.walletSpendRequest.count({ where: { userId } }),
    prisma.walletSpendRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return {
    total,
    items: items.map((row) => ({
      id: row.id,
      catalog_item_id: row.catalogItemId,
      item_name: row.itemName,
      kind: row.kind,
      face_value_cents: row.faceValueCents,
      price_cents: row.priceCents,
      fulfillment: row.fulfillmentPayload,
      status: row.status,
      // Gift card codes exposed after fulfill; phone recharge note stays admin-only
      fulfillment_result:
        row.status === "fulfilled" && row.kind === "gift_card" ? row.fulfillmentNote : null,
      created_at: row.createdAt,
      reviewed_at: row.reviewedAt,
    })),
  };
}

export async function listAdminSpends(
  projectId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const where = {
    projectId,
    ...(opts.status
      ? { status: opts.status as "pending" | "fulfilled" | "rejected" }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.walletSpendRequest.count({ where }),
    prisma.walletSpendRequest.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, inviteCode: true, uid: true } },
        catalogItem: { select: { id: true, name: true, kind: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return { total, items, project_id: projectId };
}

export async function reviewSpendRequest(input: {
  id: string;
  action: "fulfill" | "reject";
  adminId: string;
  adminNote?: string;
  fulfillmentNote?: string;
}) {
  const row = await prisma.walletSpendRequest.findUnique({ where: { id: input.id } });
  if (!row) {
    throw Object.assign(new Error("spend.not_found"), { statusCode: 404 });
  }
  if (row.status !== "pending") {
    throw Object.assign(new Error("spend.invalid_status"), { statusCode: 400 });
  }

  if (input.action === "reject") {
    const updated = await prisma.$transaction(async (tx) => {
      await restoreCatalogStock(tx, row.catalogItemId);
      await applyWalletDelta(tx, {
        userId: row.userId,
        entryType: "spend_reject",
        delta: { availableCents: row.priceCents },
        refType: "wallet_spend",
        refId: row.id,
        actorType: "admin",
        actorId: input.adminId,
        remark: input.adminNote,
      });
      return tx.walletSpendRequest.update({
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
      action: "spend.reject",
      targetType: "wallet_spend",
      targetId: row.id,
    });
    return updated;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await applyWalletDelta(tx, {
      userId: row.userId,
      entryType: "spend_fulfill",
      delta: { spentCents: row.priceCents },
      refType: "wallet_spend",
      refId: row.id,
      actorType: "admin",
      actorId: input.adminId,
      remark: input.fulfillmentNote || input.adminNote,
    });
    return tx.walletSpendRequest.update({
      where: { id: row.id },
      data: {
        status: "fulfilled",
        reviewedBy: input.adminId,
        reviewedAt: new Date(),
        adminNote: input.adminNote,
        fulfillmentNote: input.fulfillmentNote,
      },
    });
  });
  await writeAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "spend.fulfill",
    targetType: "wallet_spend",
    targetId: row.id,
  });
  return updated;
}
