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

export function hoursAgo(date: Date, hours: number): boolean {
  return Date.now() - date.getTime() >= hours * 3600_000;
}
