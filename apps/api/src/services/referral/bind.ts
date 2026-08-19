import { randomBytes } from "node:crypto";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { allocateUid } from "../uid.js";
import type { ResolvedSource } from "../project.js";
import { DEFAULT_PROJECT_ID, userSourceCreateData } from "../project.js";
import { scheduleInviterJoinNotify } from "../telegram/invite-notify.js";
import { scheduleInviteMilestoneForInviter } from "../growth/invite-milestone.js";
import { allocateInviteCode } from "./codes.js";
import { getReferralConfig } from "./config.js";
import { DEFAULT_PROMO_GROUP_ID, getDefaultPromoGroupId } from "./groups.js";
import { getAuthEmailPolicy } from "../system-settings.js";
import {
  emailCredentialData,
  listEmailHolders,
} from "../email-canonical.js";

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
 * Inviter must belong to the same project as the new user.
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

  const existing = await tx.user.findUnique({
    where: { id: newUserId },
    select: { invitedById: true, projectId: true },
  });
  if (existing?.invitedById) {
    throw Object.assign(new Error("invite.already_bound"), { statusCode: 409 });
  }

  // Cross-project invites are forbidden
  if (existing && inviter.projectId !== existing.projectId) {
    throw Object.assign(new Error("invite.cross_project_forbidden"), { statusCode: 400 });
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

  const projectId = existing?.projectId || inviter.projectId;
  const config = await getReferralConfig(projectId);
  const maxLevel = config.maxLevel;

  const [existingAncestors, existingDescendants] = await Promise.all([
    tx.inviteClosure.findMany({
      where: { descendantId: inviter.id, depth: { lt: maxLevel } },
      orderBy: { depth: "asc" },
    }),
    tx.inviteClosure.findMany({
      where: { ancestorId: newUserId, depth: { lt: maxLevel } },
      orderBy: { depth: "asc" },
    }),
  ]);
  const ancestors = [
    { userId: inviter.id, depth: 0 },
    ...existingAncestors.map((row) => ({
      userId: row.ancestorId,
      depth: row.depth,
    })),
  ];
  const descendants = [
    { userId: newUserId, depth: 0 },
    ...existingDescendants.map((row) => ({
      userId: row.descendantId,
      depth: row.depth,
    })),
  ];
  const rows: { ancestorId: string; descendantId: string; depth: number }[] = [];
  for (const ancestor of ancestors) {
    for (const descendant of descendants) {
      const depth = ancestor.depth + 1 + descendant.depth;
      if (depth > maxLevel) continue;
      rows.push({
        ancestorId: ancestor.userId,
        descendantId: descendant.userId,
        depth,
      });
    }
  }

  if (rows.length) {
    await tx.inviteClosure.createMany({ data: rows, skipDuplicates: true });
  }

  return { invitedById: inviter.id };
}

/** Create registered user (web / direct register) with invite + wallet + numeric uid. */
export async function createUserWithInvite(input: {
  email: string;
  passwordHash: string;
  inviteCode?: string | null;
  source?: ResolvedSource;
  emailVerifiedAt?: Date | null;
  /** Strip unverified holder of the same email before create. */
  claimUnverified?: boolean;
}): Promise<User> {
  const source = input.source || {
    projectId: DEFAULT_PROJECT_ID,
    projectCode: "habibi",
    sourceSiteId: null,
    sourcePackageId: null,
    sourceClient: null,
  };
  const ownCode = await allocateInviteCode();
  const promoGroupId = await getDefaultPromoGroupId(source.projectId).catch(
    () => DEFAULT_PROMO_GROUP_ID,
  );
  const policy = await getAuthEmailPolicy(source.projectId);

  const user = await prisma.$transaction(async (tx) => {
    await claimEmailAddress(tx, {
      email: input.email,
      claimUnverified: !!input.claimUnverified,
      blockGmailAliases: policy.blockGmailAliasVariants,
    });

    const uid = await allocateUid(tx);
    const verifiedAt =
      input.emailVerifiedAt !== undefined ? input.emailVerifiedAt : new Date();
    const created = await tx.user.create({
      data: {
        uid,
        ...emailCredentialData(input.email),
        emailVerifiedAt: verifiedAt,
        passwordHash: input.passwordHash,
        inviteCode: ownCode,
        promoGroupId,
        ...userSourceCreateData(source),
      },
    });
    await ensurePromoWallet(created.id, tx);
    await bindInviter(tx, created.id, input.inviteCode);
    return tx.user.findUniqueOrThrow({ where: { id: created.id } });
  });
  scheduleInviterJoinNotify({ inviteeId: user.id, inviterId: user.invitedById });
  scheduleInviteMilestoneForInviter(user.invitedById, user.projectId);
  return user;
}

/**
 * First-open App identity: anonymous User with numeric uid.
 */
export async function createAnonymousUser(input?: {
  inviteCode?: string | null;
  source?: ResolvedSource;
}): Promise<User> {
  const source = input?.source || {
    projectId: DEFAULT_PROJECT_ID,
    projectCode: "habibi",
    sourceSiteId: null,
    sourcePackageId: null,
    sourceClient: null,
  };
  const ownCode = await allocateInviteCode();
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const promoGroupId = await getDefaultPromoGroupId(source.projectId).catch(
    () => DEFAULT_PROMO_GROUP_ID,
  );

  const user = await prisma.$transaction(async (tx) => {
    const uid = await allocateUid(tx);
    const created = await tx.user.create({
      data: {
        uid,
        email: null,
        passwordHash,
        inviteCode: ownCode,
        promoGroupId,
        ...userSourceCreateData(source),
      },
    });
    await ensurePromoWallet(created.id, tx);
    await bindInviter(tx, created.id, input?.inviteCode);
    return tx.user.findUniqueOrThrow({ where: { id: created.id } });
  });
  scheduleInviterJoinNotify({ inviteeId: user.id, inviterId: user.invitedById });
  scheduleInviteMilestoneForInviter(user.invitedById, user.projectId);
  return user;
}

/**
 * Late bind inviter for an existing user who has no invitedById yet.
 */
export async function bindInviteForExistingUser(input: {
  userId: string;
  inviteCode: string;
}): Promise<{ invited_by_id: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const bound = await bindInviter(tx, input.userId, input.inviteCode);
    if (!bound.invitedById) {
      throw Object.assign(new Error("invite.code_invalid"), { statusCode: 400 });
    }
    return { invited_by_id: bound.invitedById };
  });
  scheduleInviterJoinNotify({
    inviteeId: input.userId,
    inviterId: result.invited_by_id,
  });
  scheduleInviteMilestoneForInviter(result.invited_by_id);
  return result;
}

/**
 * Upgrade a soft-bound (unverified) email on the same user to verified.
 * Optionally rotates passwordHash from the OTP payload.
 */
export async function verifySoftBoundEmail(input: {
  userId: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
    });
    if (existing.email !== input.email || existing.emailVerifiedAt) {
      throw Object.assign(new Error("auth.already_registered"), {
        statusCode: 409,
      });
    }
    await tx.user.update({
      where: { id: input.userId },
      data: {
        emailVerifiedAt: new Date(),
        passwordHash: input.passwordHash,
        ...emailCredentialData(input.email),
      },
    });
    return tx.user.findUniqueOrThrow({ where: { id: input.userId } });
  });
}

/**
 * Clear email credentials from an unverified holder so another user can claim the address.
 * Verified holders are never stripped (caller must check).
 */
export async function clearUnverifiedEmailHolder(
  tx: Tx,
  email: string,
  exceptUserId?: string | null,
): Promise<{ clearedUserId: string | null }> {
  const holder = await tx.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!holder) return { clearedUserId: null };
  if (exceptUserId && holder.id === exceptUserId) {
    return { clearedUserId: null };
  }
  if (holder.emailVerifiedAt) {
    throw Object.assign(new Error("auth.email_taken"), { statusCode: 409 });
  }
  // Randomize password so the stripped account cannot keep using old credentials if email is re-attached later.
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  await tx.user.update({
    where: { id: holder.id },
    data: {
      ...emailCredentialData(null),
      emailVerifiedAt: null,
      passwordHash,
    },
  });
  return { clearedUserId: holder.id };
}

async function claimEmailAddress(
  tx: Tx,
  input: {
    email: string;
    exceptUserId?: string | null;
    claimUnverified: boolean;
    blockGmailAliases: boolean;
  },
) {
  const holders = await listEmailHolders(tx, input.email, input.blockGmailAliases);
  for (const holder of holders) {
    if (input.exceptUserId && holder.id === input.exceptUserId) continue;
    if (holder.emailVerifiedAt || !input.claimUnverified) {
      throw Object.assign(new Error("auth.email_taken"), { statusCode: 409 });
    }
    if (holder.email) {
      await clearUnverifiedEmailHolder(tx, holder.email, input.exceptUserId);
    }
  }
}

/**
 * Bind email/password onto an anonymous user (uid stays the same).
 * Pass `emailVerifiedAt: null` for soft-bind (unverified).
 * When `claimUnverified` is true, strip an unverified holder of the same email first.
 */
export async function bindCredentialsToUser(input: {
  userId: string;
  email: string;
  passwordHash: string;
  inviteCode?: string | null;
  emailVerifiedAt?: Date | null;
  claimUnverified?: boolean;
}): Promise<User> {
  let newlyBoundInviterId: string | null = null;
  const peek = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { projectId: true, email: true },
  });
  if (peek.email) {
    throw Object.assign(new Error("auth.already_registered"), { statusCode: 409 });
  }
  const policy = await getAuthEmailPolicy(peek.projectId);
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (existing.email) {
      throw Object.assign(new Error("auth.already_registered"), { statusCode: 409 });
    }

    await claimEmailAddress(tx, {
      email: input.email,
      exceptUserId: input.userId,
      claimUnverified: !!input.claimUnverified,
      blockGmailAliases: policy.blockGmailAliasVariants,
    });

    const verifiedAt =
      input.emailVerifiedAt !== undefined ? input.emailVerifiedAt : new Date();

    await tx.user.update({
      where: { id: input.userId },
      data: {
        ...emailCredentialData(input.email),
        emailVerifiedAt: verifiedAt,
        passwordHash: input.passwordHash,
      },
    });

    if (!existing.invitedById && input.inviteCode) {
      const bound = await bindInviter(tx, input.userId, input.inviteCode);
      newlyBoundInviterId = bound.invitedById;
    }

    return tx.user.findUniqueOrThrow({ where: { id: input.userId } });
  });
  scheduleInviterJoinNotify({
    inviteeId: user.id,
    inviterId: newlyBoundInviterId,
  });
  scheduleInviteMilestoneForInviter(newlyBoundInviterId, user.projectId);
  return user;
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
  if (!user.projectId) {
    user = await prisma.user.update({
      where: { id: userId },
      data: { projectId: DEFAULT_PROJECT_ID },
    });
  }
  if (!user.promoGroupId) {
    const promoGroupId = await getDefaultPromoGroupId(user.projectId).catch(
      () => DEFAULT_PROMO_GROUP_ID,
    );
    user = await prisma.user.update({
      where: { id: userId },
      data: { promoGroupId },
    });
  }
  await ensurePromoWallet(userId);
  return user;
}
