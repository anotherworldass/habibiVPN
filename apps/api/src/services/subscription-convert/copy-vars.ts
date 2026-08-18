export type SubCopyVars = {
  plan_name: string;
  site_name: string;
  expire_date: string;
};

const ALIAS: Record<string, keyof SubCopyVars> = {
  plan_name: "plan_name",
  plan: "plan_name",
  site_name: "site_name",
  site: "site_name",
  expire_date: "expire_date",
  expire: "expire_date",
};

export function buildSubCopyVars(input: {
  siteName?: string | null;
  planName?: string | null;
  expiresAt?: Date | string | null;
}): SubCopyVars {
  let expireDate = "";
  if (input.expiresAt) {
    const d =
      input.expiresAt instanceof Date
        ? input.expiresAt
        : new Date(input.expiresAt);
    if (!Number.isNaN(d.getTime())) {
      expireDate = d.toISOString().slice(0, 10);
    }
  }
  return {
    site_name: (input.siteName || "VPN").trim() || "VPN",
    plan_name: (input.planName || "").trim(),
    expire_date: expireDate,
  };
}

/** Replace `{plan_name}` / `{{plan_name}}` (and aliases) in admin-authored copy. */
export function applySubCopyVars(template: string, vars: SubCopyVars): string {
  return template.replace(
    /\{\{\s*([a-zA-Z_]+)\s*\}\}|\{\s*([a-zA-Z_]+)\s*\}/g,
    (match, a: string | undefined, b: string | undefined) => {
      const key = ALIAS[(a || b || "").toLowerCase()];
      if (!key) return match;
      return vars[key];
    },
  );
}

export function resolveProfileTitle(
  template: string | null | undefined,
  vars: SubCopyVars,
): string {
  const raw = template?.trim() || "{site_name}-{plan_name}";
  let out = applySubCopyVars(raw, vars).replace(/\s+/g, " ").trim();
  out = out.replace(/[-_|/:\s]+$/g, "").replace(/^[-_|/:\s]+/g, "").trim();
  return out || vars.site_name || "VPN";
}

/**
 * Clash Verge / Mihomo store `total` as u64 and render 0 as "0 B".
 * There is no official unlimited token; 1 PiB is a common stand-in.
 */
export const UNLIMITED_TRAFFIC_PLACEHOLDER_BYTES = 1024 ** 5;

/** `subscription-userinfo` for Clash / Hiddify / Mihomo. */
export function buildSubscriptionUserinfo(input: {
  uploadBytes?: number;
  downloadBytes: number;
  limitBytes: number;
  expireSec: number;
}): string {
  const total =
    input.limitBytes > 0
      ? Math.round(input.limitBytes)
      : UNLIMITED_TRAFFIC_PLACEHOLDER_BYTES;
  return [
    `upload=${Math.round(input.uploadBytes ?? 0)}`,
    `download=${Math.round(input.downloadBytes)}`,
    `total=${total}`,
    `expire=${Math.max(0, Math.round(input.expireSec))}`,
  ].join("; ");
}

export function bytesToNumber(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return Number.isFinite(v) ? v : 0;
}

/** Human size for Shadowrocket STATUS= (7GB / 1.2GB / 512MB). */
export function formatTrafficBytes(bytes: number): string {
  let n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  if (i === 0) return `${Math.round(n)}${units[i]}`;
  const digits = n >= 10 ? 0 : 1;
  return `${n.toFixed(digits).replace(/\.0$/, "")}${units[i]}`;
}

export function formatExpireDate(expiresAt?: Date | string | null): string {
  if (!expiresAt) return "不限";
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "不限";
  return d.toISOString().slice(0, 10);
}

/** First line of Shadowrocket base64 body — shown as used/remain/expire. */
export function buildShadowrocketStatus(input: {
  uploadBytes: number;
  downloadBytes: number;
  limitBytes: number;
  expiresAt?: Date | string | null;
}): string {
  const used = Math.max(0, (input.uploadBytes || 0) + (input.downloadBytes || 0));
  const remain =
    input.limitBytes > 0
      ? formatTrafficBytes(Math.max(0, input.limitBytes - used))
      : "不限";
  return [
    `STATUS=已用:${formatTrafficBytes(used)}`,
    `剩余:${remain}`,
    `过期:${formatExpireDate(input.expiresAt)}`,
  ].join(",");
}
