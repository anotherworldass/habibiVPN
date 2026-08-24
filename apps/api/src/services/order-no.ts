import type { Prisma, PrismaClient } from "@prisma/client";

export const ORDER_NO_TZ = "Asia/Shanghai";
export const ORDER_NO_SEQ_DIGITS = 5;
export const ORDER_NO_SEQ_MAX = 10 ** ORDER_NO_SEQ_DIGITS - 1;

type Db = PrismaClient | Prisma.TransactionClient;

/** Calendar day key YYYYMMDD in Asia/Shanghai. */
export function shanghaiDayKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORDER_NO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}${pick("month")}${pick("day")}`;
}

export function formatOrderNo(dayKey: string, seq: number): string {
  if (!/^\d{8}$/.test(dayKey)) {
    throw new Error("order.no_day_invalid");
  }
  if (!Number.isInteger(seq) || seq < 1 || seq > ORDER_NO_SEQ_MAX) {
    throw Object.assign(new Error("order.no_exhausted"), { statusCode: 503 });
  }
  return `${dayKey}${String(seq).padStart(ORDER_NO_SEQ_DIGITS, "0")}`;
}

/**
 * Allocate the next 13-digit order number for the current Shanghai day.
 * Counter increment is atomic; skipped numbers on a later create failure are OK.
 */
export async function allocateOrderNo(db: Db, at: Date = new Date()): Promise<string> {
  const day = shanghaiDayKey(at);
  await db.orderNoCounter.upsert({
    where: { day },
    create: { day, nextSeq: 1 },
    update: {},
  });
  const updated = await db.orderNoCounter.update({
    where: { day },
    data: { nextSeq: { increment: 1 } },
  });
  return formatOrderNo(day, updated.nextSeq - 1);
}
