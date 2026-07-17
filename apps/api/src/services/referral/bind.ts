import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { allocateInviteCode } from "./codes.js";
import { getReferralConfig } from "./config.js";

type Tx = Prisma.TransactionClient;

/** Ensure promo wallet row exists. */
export async function ensurePromoWallet(userId: string, tx: Tx | typeof prisma = prisma) {
  return tx.promoWallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/**
 * Bind invite relationship permanently and write closure rows.
 * Must be called inside the same transaction that creates the user when possible.
 */
export async function bindInviter(
  tx: Tx,
  newUserId: string,
  inviteCodeRaw: string | null | undefined,
): Promise<{ invitedById: string | null }> {
  const code = inviteCodeRaw?.trim().toUpperCase() || null;
  if (!code) return { invitedById: null };

  const inviter = await tx.user.findUnique({ where: { inviteCode: code } });
  if (!inviter) {
    throw Object.assign(new Error("invite.code_invalid"), { statusCode: 400 });
  }
  if (inviter.id === newUserId) {
    throw Object.assign(new Error("invite.self_invite"), { statusCode: 400 });
  }
  if (!inviter.promoEnabled || inviter.status !== "active") {
    throw Object.assign(new Error("invite.inviter_disabled"), { statusCode: 400 });
  }

  // Prevent cycles: inviter must not already be a descendant of newUser (impossible for brand-new),
  // but also reject if somehow newUser already has binding.
  const existing = await tx.user.findUnique({
    where: { id: newUserId },
    select: { invitedById: true },
  });
  if (existing?.invitedById) {
    throw Object.assign(new Error("invite.already_bound"), { statusCode: 409 });
  }

  const cycle = await tx.inviteClosure.findUnique({
    where: {
      ancestorId_descendantId: {
        ancestorId: newUserId,
        descendantId: inviter.id,
      },
    },
  });
  if (cycle) {
    throw Object.assign(new Error("invite.cycle_forbidden"), { statusCode: 400 });
  }

  await tx.user.update({
    where: { id: newUserId },
    data: { invitedById: inviter.id },
  });

  const config = await getReferralConfig();
  const maxLevel = config.maxLevel;

  // Direct edge
  const rows: { ancestorId: string; descendantId: string; depth: number }[] = [
    { ancestorId: inviter.id, descendantId: newUserId, depth: 1 },
  ];

  // Inherit inviter's ancestors (depth+1), capped at maxLevel
  const ancestors = await tx.inviteClosure.findMany({
    where: { descendantId: inviter.id, depth: { lt: maxLevel } },
    orderBy: { depth: "asc" },
  });
  for (const a of ancestors) {
    const depth = a.depth + 1;
    if (depth > maxLevel) continue;
    rows.push({
      ancestorId: a.ancestorId,
      descendantId: newUserId,
      depth,
    });
  }

  if (rows.length) {
    await tx.inviteClosure.createMany({ data: rows, skipDuplicates: true });
  }

  return { invitedById: inviter.id };
}

/** Create user with invite code + optional inviter binding + wallet. */
export async function createUserWithInvite(input: {
  email: string;
  passwordHash: string;
  inviteCode?: string | null;
}): Promise<User> {
  const ownCode = await allocateInviteCode();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        inviteCode: ownCode,
      },
    });
    await ensurePromoWallet(user.id, tx);
    await bindInviter(tx, user.id, input.inviteCode);
    return tx.user.findUniqueOrThrow({ where: { id: user.id } });
  });
}

/** Backfill wallet + ensure invite code for legacy edge cases. */
export async function ensureUserPromoReady(userId: string): Promise<User> {
  let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.inviteCode) {
    const code = await allocateInviteCode();
    user = await prisma.user.update({
      where: { id: userId },
      data: { inviteCode: code },
    });
  }
  await ensurePromoWallet(userId);
  return user;
}
