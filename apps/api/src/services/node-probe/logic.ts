export type OverallStatus = "operational" | "degraded" | "outage";
export type RegionHealth = "active" | "partial" | "offline";

export function consecutiveFailCount(samplesNewestFirst: Array<{ ok: boolean }>): number {
  let n = 0;
  for (const s of samplesNewestFirst) {
    if (s.ok) break;
    n += 1;
  }
  return n;
}

export function consecutiveOkCount(samplesNewestFirst: Array<{ ok: boolean }>): number {
  let n = 0;
  for (const s of samplesNewestFirst) {
    if (!s.ok) break;
    n += 1;
  }
  return n;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
}

export function classifyOverall(up: number, down: number): OverallStatus {
  const total = up + down;
  if (total <= 0) return "operational";
  if (down / total >= 0.5) return "outage";
  if (down > 0) return "degraded";
  return "operational";
}

export function classifyRegion(up: number, down: number): RegionHealth {
  const total = up + down;
  if (total <= 0 || up === 0) return "offline";
  if (down === 0) return "active";
  return "partial";
}

export function successRate(ok: number, fail: number): number | null {
  const n = ok + fail;
  if (n <= 0) return null;
  return ok / n;
}

export const DOWN_RECOVER_OKS = 2;
export const UNSTABLE_MIN_SAMPLES = 6;
export const UNSTABLE_MIN_FAILS = 3;
export const SPEED_SKIP_FAIL_RATIO = 0.35;

/** Down closes only after two consecutive successes, not the first blip. */
export function shouldRecoverDown(consecutiveOks: number): boolean {
  return consecutiveOks >= DOWN_RECOVER_OKS;
}

/** Unstable needs a real cluster of failures, not 1–2 URL-test timeouts. */
export function isUnstableWindow(
  ok: number,
  fail: number,
  rateThreshold: number,
): boolean {
  const n = ok + fail;
  if (n < UNSTABLE_MIN_SAMPLES || fail < UNSTABLE_MIN_FAILS) return false;
  return ok / n < rateThreshold;
}

/** Skip the serial speed pass when this delay round already looks contested. */
export function shouldSkipSpeedRound(delayOk: number, delayFail: number): boolean {
  const n = delayOk + delayFail;
  if (n <= 0) return true;
  return delayFail / n >= SPEED_SKIP_FAIL_RATIO;
}

export function foldDuplicateIncidents<T extends {
  kind: string;
  summary: string;
  opened_at: string;
  closed_at: string | null;
}>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = `${r.kind}|${r.summary}|${r.opened_at.slice(0, 19)}|${r.closed_at?.slice(0, 19) ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function hoursAgo(date: Date, hours: number): boolean {
  return Date.now() - date.getTime() >= hours * 3600_000;
}
