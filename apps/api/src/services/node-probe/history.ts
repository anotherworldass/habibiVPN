export const STATUS_HISTORY_DAYS = 90;
export const STATUS_TODAY_HOURS = 24;
export const STATUS_HOUR_CELLS = 12;
export const STATUS_HOUR_STEP_MS = 5 * 60_000;

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

/** 24 cells for the current UTC day, oldest hour first. Hours after `now` stay empty. */
export function buildTodayHourString(
  hourlies: Array<{ hour: Date; okCount: number; failCount: number }>,
  now = new Date(),
): string {
  const day = utcDayKey(now);
  const currentHour = now.getUTCHours();
  const byHour = new Map<number, { ok: number; fail: number }>();
  for (const h of hourlies) {
    if (utcDayKey(h.hour) !== day) continue;
    const hr = h.hour.getUTCHours();
    const cur = byHour.get(hr) || { ok: 0, fail: 0 };
    cur.ok += h.okCount;
    cur.fail += h.failCount;
    byHour.set(hr, cur);
  }
  const cells: HistoryCell[] = [];
  for (let hr = 0; hr < STATUS_TODAY_HOURS; hr++) {
    if (hr > currentHour) {
      cells.push("-");
      continue;
    }
    const stats = byHour.get(hr) || { ok: 0, fail: 0 };
    cells.push(classifyHistoryDay(stats.ok, stats.fail));
  }
  return cells.join("");
}

export function lastHourWindow(now = new Date()): { start: Date; end: Date } {
  const end =
    Math.floor(now.getTime() / STATUS_HOUR_STEP_MS) * STATUS_HOUR_STEP_MS +
    STATUS_HOUR_STEP_MS;
  const start = end - STATUS_HOUR_CELLS * STATUS_HOUR_STEP_MS;
  return { start: new Date(start), end: new Date(end) };
}

/** 12 cells for the last hour, oldest first. Each cell is a 5-minute wall-clock bucket. */
export function buildLastHourString(
  samples: Array<{ probedAt: Date; ok: boolean }>,
  now = new Date(),
): string {
  const { start, end } = lastHourWindow(now);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const buckets = Array.from({ length: STATUS_HOUR_CELLS }, () => ({
    ok: 0,
    fail: 0,
  }));
  for (const s of samples) {
    const t = s.probedAt.getTime();
    if (t < startMs || t >= endMs) continue;
    const i = Math.floor((t - startMs) / STATUS_HOUR_STEP_MS);
    if (i < 0 || i >= STATUS_HOUR_CELLS) continue;
    const b = buckets[i]!;
    if (s.ok) b.ok += 1;
    else b.fail += 1;
  }
  return buckets.map((b) => classifyHistoryDay(b.ok, b.fail)).join("");
}
