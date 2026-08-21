import { prisma } from "../lib/prisma.js";
import { redisIncrWithTtl, redisSetNxEx, redisTtl } from "../lib/redis.js";

/** Concurrent unpaid gateway orders per account. */
export const MAX_PENDING_ORDERS = 3;
/** Minimum seconds between two create-order calls per user. */
export const CREATE_COOLDOWN_SECONDS = 10;
export const CREATE_USER_PER_10MIN = 8;
export const CREATE_IP_PER_10MIN = 30;
/** Skip remote queryPayment more often than this. */
export const REFRESH_MIN_INTERVAL_SECONDS = 3;
const PENDING_REUSE_MS = 30 * 60 * 1000;

function rateErr(code: string, retryAfterSeconds: number) {
  return Object.assign(new Error(code), {
    statusCode: 429,
    retryAfterSeconds,
  });
}

async function incrOrAllow(key: string, limit: number, ttlSeconds: number) {
  try {
    const n = await redisIncrWithTtl(key, ttlSeconds);
    if (n <= limit) return;
    const ttl = await redisTtl(key);
    throw rateErr("payment.rate_limited", ttl > 0 ? ttl : ttlSeconds);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) throw error;
    // Redis down: DB pending cap still applies.
  }
}

export async function assertCreateOrderAllowed(input: {
  userId: string;
  ip?: string | null;
}) {
  const pending = await prisma.order.count({
    where: { userId: input.userId, status: "pending" },
  });
  if (pending >= MAX_PENDING_ORDERS) {
    throw Object.assign(new Error("payment.too_many_pending"), { statusCode: 429 });
  }

  try {
    const acquired = await redisSetNxEx(
      `pay:order:cd:${input.userId}`,
      CREATE_COOLDOWN_SECONDS,
    );
    if (!acquired) {
      const ttl = await redisTtl(`pay:order:cd:${input.userId}`);
      throw rateErr(
        "payment.rate_limited",
        ttl > 0 ? ttl : CREATE_COOLDOWN_SECONDS,
      );
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) throw error;
  }

  await incrOrAllow(
    `pay:order:user:${input.userId}:10m`,
    CREATE_USER_PER_10MIN,
    600,
  );
  const ip = input.ip?.trim();
  if (ip) {
    await incrOrAllow(`pay:order:ip:${ip}:10m`, CREATE_IP_PER_10MIN, 600);
  }
}

export async function findReusablePendingOrder(input: {
  userId: string;
  planId: string;
  paymentChannelId: string;
  amountCents: number;
  couponCode: string | null;
}) {
  return prisma.order.findFirst({
    where: {
      userId: input.userId,
      planId: input.planId,
      paymentChannelId: input.paymentChannelId,
      amountCents: input.amountCents,
      couponCode: input.couponCode,
      status: "pending",
      paymentUrl: { not: null },
      createdAt: { gte: new Date(Date.now() - PENDING_REUSE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Returns true when the caller should hit the payment gateway. */
export async function shouldRefreshRemotePayment(orderId: string) {
  try {
    return await redisSetNxEx(
      `pay:refresh:${orderId}`,
      REFRESH_MIN_INTERVAL_SECONDS,
    );
  } catch {
    return true;
  }
}
