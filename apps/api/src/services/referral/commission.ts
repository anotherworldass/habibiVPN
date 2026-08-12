import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { ensurePromoWallet } from "./bind.js";
import { applyWalletDelta } from "./wallet.js";
import { getReferralConfig } from "./config.js";
import { DEFAULT_PROMO_GROUP_ID, seedPromoGroupsIfNeeded } from "./groups.js";

function commissionAmount(orderAmountCents: number, rateBps: number): number {
  return Math.floor((orderAmountCents * rateBps) / 10000);
}

/**
 * Create pending commission ledgers for a paid order (idempotent).
 * Rates come from each beneficiary's promo group (not global table).
 */
export async function settleCommissionsForOrder(orderId: string): Promise<{
  created: number;
  skipped: boolean;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (!order) {
    throw Object.assign(new Error("order.not_found"), { statusCode: 404 });
  }
  if (
    order.status !== "paid" &&
    order.status !== "provisioning" &&
    order.status !== "provisioned"
  ) {
    throw Object.assign(new Error("order.not_paid"), { statusCode: 400 });
  }
  if (order.amountCents <= 0) {
    return { created: 0, skipped: true };
  }

  const existing = await prisma.commissionLedger.count({ where: { orderId } });
  if (existing > 0) {
    return { created: 0, skipped: true };
  }

  const config = await getReferralConfig(order.user.projectId);
  if (!config.enabled) {
    return { created: 0, skipped: true };
  }

  // Base stack: amount → store factor (if any) → first/renew factor.
  let orderAmountCents = order.amountCents;
  if (order.provider === "app_store") {
    orderAmountCents = Math.floor(
      (orderAmountCents * config.iapCommissionBaseBps) / 10000,
    );
  } else if (order.provider === "google_play") {
    orderAmountCents = Math.floor(
      (orderAmountCents * config.playCommissionBaseBps) / 10000,
    );
  }
  const kindBps =
    order.commissionKind === "renew"
      ? config.renewCommissionBaseBps
      : config.firstCommissionBaseBps;
  orderAmountCents = Math.floor((orderAmountCents * kindBps) / 10000);
  if (orderAmountCents <= 0) {
    return { created: 0, skipped: true };
  }

  await seedPromoGroupsIfNeeded();

  const ancestors = await prisma.inviteClosure.findMany({
    where: {
      descendantId: order.userId,
      depth: { lte: config.maxLevel },
    },
    include: {
      ancestor: {
        select: {
          id: true,
          status: true,
          promoEnabled: true,
          promoGroupId: true,
          promoGroup: {
            select: {
              id: true,
              enabled: true,
              maxLevel: true,
              levels: { select: { level: true, rateBps: true } },
            },
          },
        },
      },
    },
    orderBy: { depth: "asc" },
  });

  const paidAt = order.paidAt || new Date();
  const settleAt = new Date(paidAt.getTime() + config.settleDays * 86400_000);

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const edge of ancestors) {
      const beneficiary = edge.ancestor;
      if (beneficiary.status !== "active" || !beneficiary.promoEnabled) {
        await writeAudit({
          actorType: "system",
          action: "commission.skip_disabled",
          targetType: "user",
          targetId: beneficiary.id,
          meta: { orderId, level: edge.depth },
        });
        continue;
      }

      // Self-buy / fraud: already prevented by closure; extra guard.
      if (beneficiary.id === order.userId) continue;

      const group = beneficiary.promoGroup;
      if (!group || !group.enabled) {
        await writeAudit({
          actorType: "system",
          action: "commission.skip_group_disabled",
          targetType: "user",
          targetId: beneficiary.id,
          meta: {
            orderId,
            level: edge.depth,
            promoGroupId: beneficiary.promoGroupId || DEFAULT_PROMO_GROUP_ID,
          },
        });
        continue;
      }

      const effectiveMax = group.maxLevel ?? config.maxLevel;
      if (edge.depth > effectiveMax) continue;

      const rateBps = group.levels.find((l) => l.level === edge.depth)?.rateBps;
      if (rateBps == null || rateBps <= 0) continue;

      const amountCents = commissionAmount(orderAmountCents, rateBps);
      if (amountCents <= 0) continue;

      await ensurePromoWallet(beneficiary.id, tx);

      const ledger = await tx.commissionLedger.create({
        data: {
          orderId: order.id,
          beneficiaryId: beneficiary.id,
          payerId: order.userId,
          promoGroupId: group.id,
          level: edge.depth,
          orderAmountCents,
          rateBps,
          amountCents,
          status: "pending",
          settleAt,
        },
      });

      await applyWalletDelta(tx, {
        userId: beneficiary.id,
        entryType: "commission_pending",
        delta: { pendingCents: amountCents },
        refType: "commission_ledger",
        refId: ledger.id,
        actorType: "system",
        remark: `order=${orderId} level=${edge.depth}`,
      });

      created += 1;
    }
  });

  return { created, skipped: false };
}

/** Invalidate commissions for refunded / fraudulent orders and claw back wallet balances. */
export async function invalidateCommissionsForOrder(
  orderId: string,
  reason: string,
): Promise<{ invalidated: number }> {
  const ledgers = await prisma.commissionLedger.findMany({
    where: { orderId, status: { in: ["pending", "settled"] } },
  });
  if (!ledgers.length) return { invalidated: 0 };

  await prisma.$transaction(async (tx) => {
    for (const row of ledgers) {
      if (row.status === "pending") {
        await applyWalletDelta(tx, {
          userId: row.beneficiaryId,
          entryType: "commission_invalidate_pending",
          delta: { pendingCents: -row.amountCents },
          refType: "commission_ledger",
          refId: row.id,
          actorType: "system",
          remark: reason,
        });
      } else if (row.status === "settled") {
        const wallet = await tx.promoWallet.findUnique({
          where: { userId: row.beneficiaryId },
        });
        if (!wallet) continue;
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
          actorType: "system",
          remark: reason,
        });
      }

      await tx.commissionLedger.update({
        where: { id: row.id },
        data: { status: "invalid", invalidReason: reason },
      });
    }
  });

  await writeAudit({
    actorType: "system",
    action: "commission.invalidate_order",
    targetType: "order",
    targetId: orderId,
    meta: { reason, count: ledgers.length },
  });

  return { invalidated: ledgers.length };
}

/** Move due pending commissions into available balance. */
export async function settleDueCommissions(limit = 200): Promise<number> {
  const due = await prisma.commissionLedger.findMany({
    where: {
      status: "pending",
      settleAt: { lte: new Date() },
    },
    take: limit,
    orderBy: { settleAt: "asc" },
  });
  if (!due.length) return 0;

  let settled = 0;
  for (const row of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.commissionLedger.findUnique({ where: { id: row.id } });
        if (!current || current.status !== "pending") return;

        await tx.commissionLedger.update({
          where: { id: row.id },
          data: { status: "settled", settledAt: new Date() },
        });
        await applyWalletDelta(tx, {
          userId: row.beneficiaryId,
          entryType: "commission_settle",
          delta: {
            pendingCents: -row.amountCents,
            availableCents: row.amountCents,
          },
          refType: "commission_ledger",
          refId: row.id,
          actorType: "system",
        });
      });
      settled += 1;
    } catch (err) {
      console.error("[referral] settle failed", row.id, err);
    }
  }
  return settled;
}
