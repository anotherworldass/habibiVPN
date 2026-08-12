import type { Prisma, PromoWalletEntryType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ensurePromoWallet } from "./bind.js";

export type Tx = Prisma.TransactionClient;

export type WalletDelta = {
  availableCents?: number;
  pendingCents?: number;
  withdrawnCents?: number;
  frozenCents?: number;
  spentCents?: number;
};

/** Apply bucket deltas and append an immutable ledger row (same transaction). */
export async function applyWalletDelta(
  tx: Tx,
  input: {
    userId: string;
    entryType: PromoWalletEntryType;
    delta: WalletDelta;
    /** Absolute set for frozen (admin freeze); overrides delta.frozenCents */
    setFrozenCents?: number;
    refType?: string;
    refId?: string;
    actorType?: string;
    actorId?: string;
    remark?: string;
  },
) {
  await ensurePromoWallet(input.userId, tx);
  const before = await tx.promoWallet.findUniqueOrThrow({
    where: { userId: input.userId },
  });

  let availableDelta = input.delta.availableCents ?? 0;
  let pendingDelta = input.delta.pendingCents ?? 0;
  let withdrawnDelta = input.delta.withdrawnCents ?? 0;
  let frozenDelta = input.delta.frozenCents ?? 0;
  let spentDelta = input.delta.spentCents ?? 0;

  if (input.setFrozenCents != null) {
    frozenDelta = input.setFrozenCents - before.frozenCents;
  }

  if (
    availableDelta === 0 &&
    pendingDelta === 0 &&
    withdrawnDelta === 0 &&
    frozenDelta === 0 &&
    spentDelta === 0
  ) {
    return before;
  }

  const data: Prisma.PromoWalletUpdateInput = {};
  if (availableDelta !== 0) {
    data.availableCents =
      availableDelta > 0
        ? { increment: availableDelta }
        : { decrement: -availableDelta };
  }
  if (pendingDelta !== 0) {
    data.pendingCents =
      pendingDelta > 0 ? { increment: pendingDelta } : { decrement: -pendingDelta };
  }
  if (withdrawnDelta !== 0) {
    data.withdrawnCents =
      withdrawnDelta > 0
        ? { increment: withdrawnDelta }
        : { decrement: -withdrawnDelta };
  }
  if (input.setFrozenCents != null) {
    data.frozenCents = input.setFrozenCents;
  } else if (frozenDelta !== 0) {
    data.frozenCents =
      frozenDelta > 0 ? { increment: frozenDelta } : { decrement: -frozenDelta };
  }
  if (spentDelta !== 0) {
    data.spentCents =
      spentDelta > 0 ? { increment: spentDelta } : { decrement: -spentDelta };
  }

  const after = await tx.promoWallet.update({
    where: { userId: input.userId },
    data,
  });

  await tx.promoWalletLedger.create({
    data: {
      userId: input.userId,
      entryType: input.entryType,
      availableDelta,
      pendingDelta,
      withdrawnDelta,
      frozenDelta,
      spentDelta,
      availableAfter: after.availableCents,
      pendingAfter: after.pendingCents,
      withdrawnAfter: after.withdrawnCents,
      frozenAfter: after.frozenCents,
      spentAfter: after.spentCents,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      remark: input.remark ?? null,
    },
  });

  return after;
}

export async function listWalletLedger(
  userId: string,
  opts: { limit?: number; offset?: number; entryType?: PromoWalletEntryType } = {},
) {
  const limit = Math.min(opts.limit || 50, 200);
  const offset = opts.offset || 0;
  const where = {
    userId,
    ...(opts.entryType ? { entryType: opts.entryType } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.promoWalletLedger.count({ where }),
    prisma.promoWalletLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return { total, items };
}
