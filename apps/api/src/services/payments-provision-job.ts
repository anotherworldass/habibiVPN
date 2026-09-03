import { prisma } from "../lib/prisma.js";
import { provisionPaidOrder } from "./payments.js";

const MIN_RETRY_GAP_MS = 60_000;

export async function retryFailedProvisions(limit = 20): Promise<number> {
  const staleBefore = new Date(Date.now() - MIN_RETRY_GAP_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: "paid",
      provisionError: { not: null },
      updatedAt: { lte: staleBefore },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let ok = 0;
  for (const order of orders) {
    try {
      const saved = await provisionPaidOrder(order.id);
      if (saved?.status === "provisioned") ok += 1;
    } catch (err) {
      console.error("[payments] provision retry failed", order.id, err);
    }
  }
  return ok;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startProvisionRetryJob(log?: {
  info: (o: unknown, msg?: string) => void;
}) {
  if (timer) return;
  const tick = async () => {
    try {
      const n = await retryFailedProvisions();
      if (n > 0) log?.info({ provisioned: n }, "paid order provision retried");
    } catch (err) {
      console.error("[payments] provision retry job error", err);
    }
  };
  void tick();
  timer = setInterval(tick, 30_000);
  timer.unref?.();
}

export function stopProvisionRetryJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
