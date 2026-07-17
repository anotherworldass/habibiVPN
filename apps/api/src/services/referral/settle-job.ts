import { settleDueCommissions } from "./commission.js";

let timer: ReturnType<typeof setInterval> | null = null;

/** Start in-process settlement poller (every 5 minutes). */
export function startCommissionSettleJob(log?: { info: (o: unknown, msg?: string) => void }) {
  if (timer) return;

  const tick = async () => {
    try {
      const n = await settleDueCommissions(500);
      if (n > 0) {
        log?.info({ settled: n }, "referral commissions settled");
      }
    } catch (err) {
      console.error("[referral] settle job error", err);
    }
  };

  // Initial delay then every 5 minutes
  void tick();
  timer = setInterval(tick, 5 * 60_000);
  timer.unref?.();
}

export function stopCommissionSettleJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
