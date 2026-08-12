import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config.js";

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64url")
    .replace(/=+$/, "");
}

function hmac(slotId: string): Buffer {
  return createHmac("sha256", env.JWT_USER_SECRET)
    .update(`habibi-sub:${slotId}`)
    .digest()
    .subarray(0, 16);
}

/** Stable opaque token for a UserUpstream slot (no DB column). */
export function signSubToken(slotId: string): string {
  return `${b64url(slotId)}.${b64url(hmac(slotId))}`;
}

export function verifySubToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [idPart, sigPart] = parts;
  if (!idPart || !sigPart) return null;
  let slotId: string;
  try {
    slotId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!slotId || slotId.length > 64) return null;
  const expected = b64url(hmac(slotId));
  const a = Buffer.from(expected);
  const b = Buffer.from(sigPart);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return slotId;
}
