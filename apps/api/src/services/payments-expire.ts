import { prisma } from "../lib/prisma.js";
import { releaseCouponForOrder } from "./growth/coupons.js";
import { getPaymentOrderGuardPolicy } from "./system-settings.js";

/** Written to `failureReason` so admins can tell sweeper cancels apart. */
export const PENDING_EXPIRED_REASON = "payment.pending_expired";

/** Cap per project per tick so one backlog cannot stall the loop. */
const SWEEP_BATCH = 200;

/**
 * Cancel a pending order and free its coupon hold. Safe to call concurrently:
 * only the caller whose `updateMany` matched does the coupon release.
 */
export async function cancelPendingOrder(input: {
  orderId: string;
  reason: string;
}): Promise<boolean> {
  const updated = await prisma.order.updateMany({
    where: { id: input.orderId, status: "pending" },
    data: { status: "cancelled", failureReason: input.reason },
  });
  if (!updated.count) return false;
  await releaseCouponForOrder(input.orderId);
  return true;
}

/** Cancel pending orders older than the project's configured expiry. */
export async function expirePendingOrdersForProject(
  projectId: string,
): Promise<number> {
  const policy = await getPaymentOrderGuardPolicy(projectId);
  if (policy.pendingExpireMinutes <= 0) return 0;

  const cutoff = new Date(Date.now() - policy.pendingExpireMinutes * 60_000);
  const stale = await prisma.order.findMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
      user: { projectId },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH,
  });
  if (!stale.length) return 0;

  let cancelled = 0;
  for (const order of stale) {
    if (await cancelPendingOrder({ orderId: order.id, reason: PENDING_EXPIRED_REASON })) {
      cancelled += 1;
    }
  }
  return cancelled;
}

export async function expirePendingOrders(): Promise<number> {
  const projects = await prisma.project.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  let total = 0;
  for (const project of projects) {
    total += await expirePendingOrdersForProject(project.id);
  }
  return total;
}
