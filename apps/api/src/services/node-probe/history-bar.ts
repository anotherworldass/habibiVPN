export const STATUS_HISTORY_DAYS = 90;

/** g = up, y = partial, r = down, - = no data */
export type HistoryCell = "g" | "y" | "r" | "-";

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function classifyDay(ok: number, fail: number): HistoryCell {
  if (ok <= 0 && fail <= 0) return "-";
  if (fail <= 0) return "g";
  if (ok <= 0) return "r";
  const rate = ok / (ok + fail);
  if (rate >= 0.95) return "g";
  if (rate < 0.5) return "r";
  return "y";
}

export function buildHistoryString(
  days: number,
  hourlies: Array<{ hour: Date; okCount: number; failCount: number }>,
  now = new Date(),
): string {
  const byDay = new Map<string, { ok: number; fail: number }>();
  for (const h of hourlies) {
    const key = utcDayKey(h.hour);
    const cur = byDay.get(key) || { ok: 0, fail: 0 };
    cur.ok += h.okCount;
    cur.fail += h.failCount;
    byDay.set(key, cur);
  }
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let out = "";
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86400_000);
    const stats = byDay.get(utcDayKey(day)) || { ok: 0, fail: 0 };
    out += classifyDay(stats.ok, stats.fail);
  }
  return out;
}
