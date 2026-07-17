import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { ensurePromoWallet } from "./bind.js";
import { getReferralConfig } from "./config.js";

function commissionAmount(orderAmountCents: number, rateBps: number): number {
  return Math.floor((orderAmountCents * rateBps) / 10000);
}

/**
 * Create pending commission ledgers for a paid order (idempotent).
 * Call when Order reaches paid with amountCents > 0.
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
  if (order.status !== "paid" && order.status !== "provisioned") {
    throw Object.assign(new Error("order.not_paid"), { statusCode: 400 });
  }
  if (order.amountCents <= 0) {
    return { created: 0, skipped: true };
  }

  const existing = await prisma.commissionLedger.count({ where: { orderId } });
  if (existing > 0) {
    return { created: 0, skipped: true };
  }

  const config = await getReferralConfig();
  if (!config.enabled) {
    return { created: 0, skipped: true };
  }

  const rateByLevel = new Map(config.levels.map((l) => [l.level, l.rateBps]));
  const ancestors = await prisma.inviteClosure.findMany({
    where: {
      descendantId: order.userId,
      depth: { lte: config.maxLevel },
    },
    include: {
      ancestor: { select: { id: true, status: true, promoEnabled: true } },
    },
    orderBy: { depth: "asc" },
  });

  const paidAt = order.paidAt || new Date();
  const settleAt = new Date(paidAt.getTime() + config.settleDays * 86400_000);

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const edge of ancestors) {
      const rateBps = rateByLevel.get(edge.depth);
      if (rateBps == null || rateBps <= 0) continue;

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

      // Self-buy / fraud: payer is in beneficiary's downline (they invited themselves indirectly)
      // Already prevented by not having self as ancestor. Extra: skip if beneficiary === payer.
      if (beneficiary.id === order.userId) continue;

      const amountCents = commissionAmount(order.amountCents, rateBps);
      if (amountCents <= 0) continue;

      await ensurePromoWallet(beneficiary.id, tx);

      await tx.commissionLedger.create({
        data: {
          orderId: order.id,
          beneficiaryId: beneficiary.id,
          payerId: order.userId,
          level: edge.depth,
          orderAmountCents: order.amountCents,
          rateBps,
          amountCents,
          status: "pending",
          settleAt,
        },
      });

      await tx.promoWallet.update({
        where: { userId: beneficiary.id },
        data: { pendingCents: { increment: amountCents } },
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
        await tx.promoWallet.update({
          where: { userId: row.beneficiaryId },
          data: { pendingCents: { decrement: row.amountCents } },
        });
      } else if (row.status === "settled") {
        const wallet = await tx.promoWallet.findUnique({
          where: { userId: row.beneficiaryId },
        });
        if (!wallet) continue;
        const fromAvailable = Math.min(wallet.availableCents, row.amountCents);
        const remainder = row.amountCents - fromAvailable;
        await tx.promoWallet.update({
          where: { userId: row.beneficiaryId },
          data: {
            availableCents: { decrement: fromAvailable },
            ...(remainder > 0 ? { frozenCents: { increment: remainder } } : {}),
          },
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
        await tx.promoWallet.update({
          where: { userId: row.beneficiaryId },
          data: {
            pendingCents: { decrement: row.amountCents },
            availableCents: { increment: row.amountCents },
          },
        });
      });
      settled += 1;
    } catch (err) {
      console.error("[referral] settle failed", row.id, err);
    }
  }
  return settled;
}
