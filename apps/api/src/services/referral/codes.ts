import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";

export const INVITE_CODE_MIN_LEN = 3;
export const INVITE_CODE_MAX_LEN = 8;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_RE = /^[A-Z2-9]{3,8}$/;

/** Generate a short invite code (8 chars, no ambiguous 0/O/1/I). */
export function generateInviteCode(length = INVITE_CODE_MAX_LEN): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Normalize user input: trim + uppercase; strip invalid chars is NOT done — reject instead. */
export function normalizeInviteCodeInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateInviteCodeFormat(code: string): void {
  if (code.length < INVITE_CODE_MIN_LEN || code.length > INVITE_CODE_MAX_LEN) {
    throw Object.assign(new Error("invite.code_length_invalid"), { statusCode: 400 });
  }
  if (!INVITE_CODE_RE.test(code)) {
    throw Object.assign(new Error("invite.code_format_invalid"), { statusCode: 400 });
  }
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) {
      throw Object.assign(new Error("invite.code_format_invalid"), { statusCode: 400 });
    }
  }
}

/** Allocate a unique invite code with collision retries. */
export async function allocateInviteCode(maxAttempts = 12): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateInviteCode();
    const exists = await prisma.user.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error("invite.code_alloc_failed");
}

export async function updateUserInviteCode(input: {
  userId: string;
  inviteCodeRaw: string;
  actorType: "user" | "admin";
  actorId?: string;
}) {
  const code = normalizeInviteCodeInput(input.inviteCodeRaw);
  validateInviteCodeFormat(code);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, inviteCode: true, status: true },
  });
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  if (input.actorType === "user" && user.status !== "active") {
    throw Object.assign(new Error("user.disabled"), { statusCode: 403 });
  }
  if (user.inviteCode === code) {
    return { id: user.id, invite_code: code, unchanged: true as const };
  }

  const taken = await prisma.user.findUnique({
    where: { inviteCode: code },
    select: { id: true },
  });
  if (taken && taken.id !== input.userId) {
    throw Object.assign(new Error("invite.code_taken"), { statusCode: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { inviteCode: code },
    select: { id: true, inviteCode: true },
  });

  await writeAudit({
    actorType: input.actorType,
    actorId: input.actorId ?? input.userId,
    action: "invite.code_update",
    targetType: "user",
    targetId: input.userId,
    meta: { from: user.inviteCode, to: code },
  });

  return { id: updated.id, invite_code: updated.inviteCode, unchanged: false as const };
}
