import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import {
  invalidateCommissionsForOrder,
  settleCommissionsForOrder,
} from "./referral/commission.js";
import { resolveCommissionKind } from "./referral/commission-kind.js";
import { allocateOrderNo } from "./order-no.js";
import {
  clawbackUpstreamForOrder,
  type EntitlementClawbackResult,
} from "./provision.js";

/**
 * Create a paid order and settle referral commissions.
 * Used by admin backfill today; payment webhooks can call the same path later.
 */
export async function createPaidOrderAndSettle(input: {
  userId: string;
  planId: string;
  amountCents?: number;
  currency?: string;
  provider?: string;
  providerRef?: string;
}) {
  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.plan.findUnique({ where: { id: input.planId } }),
  ]);
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  if (!plan) {
    throw Object.assign(new Error("plan.not_found"), { statusCode: 404 });
  }

  const amountCents = input.amountCents ?? plan.priceCents;
  if (amountCents <= 0) {
    throw Object.assign(new Error("order.amount_must_be_positive"), { statusCode: 400 });
  }

  const commissionKind = await resolveCommissionKind(input.userId);
  const orderNo = await allocateOrderNo(prisma);
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      planId: input.planId,
      orderNo,
      status: "paid",
      amountCents,
      currency: input.currency || plan.currency,
      provider: input.provider || "admin_manual",
      providerRef: input.providerRef,
      commissionKind,
      paidAt: new Date(),
    },
  });

  const commission = await settleCommissionsForOrder(order.id);
  return { order, commission };
}

export type RefundEntitlementResult =
  | EntitlementClawbackResult
  | { ok: true; skipped: "already_refunded" };

export async function refundOrderAndInvalidate(orderId: string, reason = "refund") {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw Object.assign(new Error("order.not_found"), { statusCode: 404 });
  }

  if (order.status === "refunded") {
    const commission = await invalidateCommissionsForOrder(orderId, reason);
    return {
      order,
      commission,
      entitlement: { ok: true as const, skipped: "already_refunded" as const },
    };
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: "refunded" },
  });
  const commission = await invalidateCommissionsForOrder(orderId, reason);

  let entitlement: RefundEntitlementResult;
  try {
    entitlement = await clawbackUpstreamForOrder(order);
    await writeAudit({
      actorType: "system",
      actorId: reason,
      action: "order.entitlement_clawback",
      targetType: "order",
      targetId: order.id,
      meta: { reason, entitlement },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "entitlement.clawback_failed";
    entitlement = { ok: false, error: message };
    await writeAudit({
      actorType: "system",
      actorId: reason,
      action: "order.entitlement_clawback_failed",
      targetType: "order",
      targetId: order.id,
      meta: { reason, error: message },
    });
  }

  return { order: updated, commission, entitlement };
}
