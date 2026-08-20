export type PlanLike = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  validity_seconds?: number | null;
  data_limit_bytes?: number | null;
  reset_policy?: string | null;
  custom_reset_interval?: string | null;
  is_free_claimable?: boolean;
  already_claimed?: boolean;
  group_id?: string | null;
};

export type PlanGroupLike = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
};

export function formatBytes(n?: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "不限流量";
  return formatBytesAmount(n);
}

/** Format a byte count for usage stats (never "不限流量"). */
export function formatBytesAmount(n: number): string {
  return formatUsageBytes(n);
}

/** Match web TrafficUsage: `45.9 MB`, `1.00 GB`. */
export function formatUsageBytes(n?: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "-";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

/** Catalog `data_limit_bytes`: 0 = unlimited, >0 = metered quota. */
export function trafficKindLabel(n?: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "无限流量";
  return "流量计费";
}

/** Human label for plan/subscription traffic reset policy. */
export function resetPolicyLabel(
  policy?: string | null,
  customInterval?: string | null,
): string | null {
  const p = (policy || "no_reset").trim();
  if (!p || p === "no_reset") return null;
  if (p === "day") return "每日重置";
  if (p === "week") return "每周重置";
  if (p === "month") return "每月重置";
  if (p === "year") return "每年重置";
  if (p === "custom") {
    const raw = (customInterval || "").trim();
    if (!raw) return "定期重置";
    const m = raw.match(/^(\d+(?:\.\d+)?)h$/i);
    if (m) {
      const hours = Number(m[1]);
      if (Number.isFinite(hours) && hours > 0) {
        if (hours % 24 === 0) {
          const days = hours / 24;
          return `每 ${days % 1 === 0 ? days.toFixed(0) : days} 天重置`;
        }
        return `每 ${hours % 1 === 0 ? hours.toFixed(0) : hours} 小时重置`;
      }
    }
    return `每 ${raw} 重置`;
  }
  return "定期重置";
}

/** e.g. `8月31日 21:22` (omit year when same as now). */
export function formatResetAt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (d.getFullYear() === new Date().getFullYear()) {
    return `${md} ${time}`;
  }
  return `${d.getFullYear()}年${md} ${time}`;
}

export function formatDays(sec?: number | null): string | null {
  if (sec == null) return null;
  if (sec === 0) return "永久";
  if (sec % 86400 === 0) return `${sec / 86400} 天`;
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  return null;
}

export function formatPrice(cents: number, currency: string) {
  return `${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} ${currency}`;
}

export function formatCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}
