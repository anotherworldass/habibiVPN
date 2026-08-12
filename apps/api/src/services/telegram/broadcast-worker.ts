import {
  claimNextBroadcastWork,
  processBroadcastBatch,
  processBroadcastRecallBatch,
  purgeExpiredBroadcastDeliveries,
} from "./broadcast.js";

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let purgeTicks = 0;

type LogLike = {
  info: (o: unknown, msg?: string) => void;
  error?: (o: unknown, msg?: string) => void;
};

/**
 * In-process broadcast worker.
 * Every ~2s claims a send or recall job and processes one cursor batch (~40 msgs).
 */
export function startTelegramBroadcastWorker(log?: LogLike) {
  if (timer) return;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const work = await claimNextBroadcastWork();
      if (!work) {
        // Occasional housekeeping when idle
        purgeTicks += 1;
        if (purgeTicks >= 150) {
          purgeTicks = 0;
          const n = await purgeExpiredBroadcastDeliveries();
          if (n > 0) log?.info({ purged: n }, "telegram broadcast deliveries purged");
        }
        return;
      }
      purgeTicks = 0;
      const more =
        work.kind === "recall"
          ? await processBroadcastRecallBatch(work.id)
          : await processBroadcastBatch(work.id);
      if (more) {
        log?.info({ jobId: work.id, kind: work.kind }, "telegram broadcast batch ok");
      }
    } catch (err) {
      console.error("[telegram] broadcast worker error", err);
      log?.error?.({ err }, "telegram broadcast worker error");
    } finally {
      busy = false;
    }
  };

  void tick();
  timer = setInterval(tick, 2_000);
  timer.unref?.();
}

export function stopTelegramBroadcastWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
