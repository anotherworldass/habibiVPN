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

export function truncateError(err: unknown, max = 255): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "probe_error";
  const s = raw.replace(/\s+/g, " ").trim() || "probe_error";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
