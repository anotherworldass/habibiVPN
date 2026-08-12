import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import type { SupportClientMeta } from "./meta.js";

export const SUPPORT_GUEST_COOKIE = "habibi_support_guest";
export const SUPPORT_GUEST_HEADER = "x-support-guest-token";

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newGuestToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function findGuestByToken(
  projectId: string,
  token: string | null | undefined,
) {
  if (!token?.trim()) return null;
  const hash = hashGuestToken(token.trim());
  return prisma.supportGuest.findFirst({
    where: { projectId, guestTokenHash: hash },
  });
}

export async function upsertWebGuest(input: {
  projectId: string;
  token?: string | null;
  userId?: string | null;
  meta: SupportClientMeta;
}) {
  const existing = await findGuestByToken(input.projectId, input.token);
  const now = new Date();
  // Once marked as App, keep it (same guest cookie may later hit site widget).
  const clientSource =
    input.meta.clientSource === "app" || existing?.clientSource === "app"
      ? "app"
      : input.meta.clientSource || existing?.clientSource || "h5";
  const metaPatch = {
    ip: input.meta.ip,
    userAgent: input.meta.userAgent,
    timezone: input.meta.timezone,
    locale: input.meta.locale,
    osName: input.meta.osName,
    osVersion: input.meta.osVersion,
    browserName: input.meta.browserName,
    deviceIdHash: input.meta.deviceIdHash,
    clientSource,
    lastSeenAt: now,
    ...(input.userId ? { userId: input.userId } : {}),
  };

  if (existing) {
    const guest = await prisma.supportGuest.update({
      where: { id: existing.id },
      data: metaPatch,
    });
    return { guest, token: input.token!.trim(), created: false as const };
  }

  const token = newGuestToken();
  const guest = await prisma.supportGuest.create({
    data: {
      projectId: input.projectId,
      guestTokenHash: hashGuestToken(token),
      userId: input.userId ?? null,
      ...metaPatch,
    },
  });
  return { guest, token, created: true as const };
}

export function parseGuestTokenFromRequest(headers: Record<string, string | string[] | undefined>): string | null {
  const h = headers[SUPPORT_GUEST_HEADER] ?? headers[SUPPORT_GUEST_HEADER.toLowerCase()];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (Array.isArray(h) && h[0]?.trim()) return h[0].trim();

  const cookie = headers.cookie;
  const raw = Array.isArray(cookie) ? cookie.join(";") : cookie;
  if (!raw) return null;
  const parts = raw.split(";");
  for (const p of parts) {
    const [k, ...rest] = p.trim().split("=");
    if (k === SUPPORT_GUEST_COOKIE) {
      const v = rest.join("=").trim();
      return v || null;
    }
  }
  return null;
}

export function guestSetCookieHeader(token: string, maxAgeSec = 180 * 24 * 3600): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SUPPORT_GUEST_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}
