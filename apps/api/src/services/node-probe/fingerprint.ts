import { createHash } from "node:crypto";

export function targetFingerprint(
  protocol: string,
  server: string,
  port: number,
): string {
  return createHash("sha1")
    .update(`${protocol}|${server.trim().toLowerCase()}|${port}`)
    .digest("hex")
    .slice(0, 20);
}

/** Clash proxy name: [a-z0-9-] only so delay API paths stay simple. */
export function clashNameFor(protocol: string, fingerprint: string): string {
  const proto = protocol.replace(/[^a-z0-9]/gi, "").toLowerCase() || "node";
  return `${proto}-${fingerprint}`;
}

function errorParts(err: unknown, depth = 0): string[] {
  if (depth > 4 || err == null) return [];
  if (typeof err === "string") return err.trim() ? [err.trim()] : [];
  if (!(err instanceof Error)) return [];
  const out: string[] = [];
  if (err.message.trim()) out.push(err.message.trim());
  const code = (err as NodeJS.ErrnoException).code;
  if (code && String(code) !== err.message) out.push(String(code));
  if (err.cause) out.push(...errorParts(err.cause, depth + 1));
  return out;
}

export function truncateError(err: unknown, max = 255): string {
  const s = [...new Set(errorParts(err))].join(" · ").replace(/\s+/g, " ").trim() || "probe_error";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function wrapProbeError(code: string, err: unknown, statusCode = 502): Error {
  const detail = truncateError(err, 160);
  const msg = detail && !detail.startsWith(code) ? `${code}: ${detail}` : code;
  return Object.assign(new Error(msg), { statusCode, cause: err });
}
