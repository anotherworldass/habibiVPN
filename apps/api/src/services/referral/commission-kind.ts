import type { CommissionKind } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const PAID_LIKE = ["paid", "provisioning", "provisioned", "refunded"] as const;

/**
 * first = user has no prior paid-like order with amountCents > 0;
 * renew = already charged before.
 * $0 App Store free-trial orders do not count — first real charge after trial is first.
 * Pending/failed/cancelled do not count.
 */
export async function resolveCommissionKind(
  userId: string,
  opts?: { force?: CommissionKind },
): Promise<CommissionKind> {
  if (opts?.force) return opts.force;

  const prior = await prisma.order.count({
    where: {
      userId,
      amountCents: { gt: 0 },
      status: { in: [...PAID_LIKE] },
    },
  });
  return prior > 0 ? "renew" : "first";
}
