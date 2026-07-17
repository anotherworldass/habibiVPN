import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a short invite code (8 chars, no ambiguous 0/O/1/I). */
export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
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
