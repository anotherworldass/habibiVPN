import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

/**
 * Gmail treats dots in the local part as optional, plus-tags as aliases,
 * and googlemail.com as gmail.com. Used for optional register uniqueness.
 */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canonicalEmail(email: string): string {
  const raw = normalizeEmail(email);
  const at = raw.lastIndexOf("@");
  if (at <= 0) return raw;
  let local = raw.slice(0, at);
  let domain = raw.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (GMAIL_DOMAINS.has(domain)) {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

export function emailCredentialData(email: string | null): {
  email: string | null;
  emailCanonical: string | null;
} {
  if (!email) return { email: null, emailCanonical: null };
  const normalized = normalizeEmail(email);
  return { email: normalized, emailCanonical: canonicalEmail(normalized) };
}

export type EmailHolder = {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
};

type UserDb = Prisma.TransactionClient | typeof prisma;

export async function listEmailHolders(
  db: UserDb,
  email: string,
  blockGmailAliases: boolean,
): Promise<EmailHolder[]> {
  const cred = emailCredentialData(email);
  if (!cred.email) return [];
  if (!blockGmailAliases) {
    const row = await db.user.findUnique({
      where: { email: cred.email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    return row ? [row] : [];
  }
  if (!cred.emailCanonical) return [];
  return db.user.findMany({
    where: { emailCanonical: cred.emailCanonical },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
}
