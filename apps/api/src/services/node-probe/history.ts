export const STATUS_HISTORY_DAYS = 90;

/** g = up, y = partial, r = down, - = no samples */
export type HistoryCell = "g" | "y" | "r" | "-";

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function classifyHistoryDay(ok: number, fail: number): HistoryCell {
  if (ok <= 0 && fail <= 0) return "-";
  if (fail <= 0) return "g";
  if (ok <= 0) return "r";
  const rate = ok / (ok + fail);
  if (rate >= 0.95) return "g";
  if (rate >= 0.5) return "y";
  return "r";
}

export function buildHistoryString(
  hourlies: Array<{ hour: Date; okCount: number; failCount: number }>,
  days = STATUS_HISTORY_DAYS,
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
  const cells: HistoryCell[] = [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today - i * 86400_000);
    const stats = byDay.get(utcDayKey(d)) || { ok: 0, fail: 0 };
    cells.push(classifyHistoryDay(stats.ok, stats.fail));
  }
  return cells.join("");
}

export function historyDayLabels(days = STATUS_HISTORY_DAYS, now = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(utcDayKey(new Date(today - i * 86400_000)));
  }
  return out;
}
