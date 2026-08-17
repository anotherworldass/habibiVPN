const TZ = "Asia/Shanghai";

/** Short build stamp: `v0817.1941` (MMDD.HHmm, Asia/Shanghai). Dev adds `-dev`. */
export function formatAppVersion(now = new Date(), isDev = false) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const g = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  const stamp = `${g("month")}${g("day")}.${g("hour")}${g("minute")}`;
  return isDev ? `v${stamp}-dev` : `v${stamp}`;
}
