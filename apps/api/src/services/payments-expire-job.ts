import { expirePendingOrders } from "./payments-expire.js";

let timer: ReturnType<typeof setInterval> | null = null;

/** Start in-process sweeper for stale pending orders (every 2 minutes). */
export function startPendingOrderExpireJob(log?: {
  info: (o: unknown, msg?: string) => void;
}) {
  if (timer) return;

  const tick = async () => {
    try {
      const n = await expirePendingOrders();
      if (n > 0) {
        log?.info({ cancelled: n }, "pending orders expired");
      }
    } catch (err) {
      console.error("[payments] pending expire job error", err);
    }
  };

  void tick();
  timer = setInterval(tick, 2 * 60_000);
  timer.unref?.();
}

export function stopPendingOrderExpireJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
