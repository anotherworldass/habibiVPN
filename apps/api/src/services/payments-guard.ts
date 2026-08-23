import { prisma } from "../lib/prisma.js";
import { redisIncrWithTtl, redisSetNxEx, redisTtl } from "../lib/redis.js";
import {
  getPaymentOrderGuardPolicy,
  type PaymentOrderGuardValue,
} from "./system-settings.js";

/** Skip remote queryPayment more often than this. */
export const REFRESH_MIN_INTERVAL_SECONDS = 3;

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
  projectId: string;
  userId: string;
  ip?: string | null;
  policy?: PaymentOrderGuardValue;
}) {
  const policy =
    input.policy ?? (await getPaymentOrderGuardPolicy(input.projectId));

  const pending = await prisma.order.count({
    where: { userId: input.userId, status: "pending" },
  });
  if (pending >= policy.maxPendingOrders) {
    throw Object.assign(new Error("payment.too_many_pending"), { statusCode: 429 });
  }

  if (policy.createCooldownSeconds > 0) {
    try {
      const acquired = await redisSetNxEx(
        `pay:order:cd:${input.userId}`,
        policy.createCooldownSeconds,
      );
      if (!acquired) {
        const ttl = await redisTtl(`pay:order:cd:${input.userId}`);
        throw rateErr(
          "payment.rate_limited",
          ttl > 0 ? ttl : policy.createCooldownSeconds,
        );
      }
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 429) throw error;
    }
  }

  await incrOrAllow(
    `pay:order:user:${input.userId}:10m`,
    policy.userPer10Min,
    600,
  );
  const ip = input.ip?.trim();
  if (ip) {
    // Scoped per project: the same IP may hit brands with different caps.
    await incrOrAllow(
      `pay:order:ip:${input.projectId}:${ip}:10m`,
      policy.ipPer10Min,
      600,
    );
  }
}

export async function findReusablePendingOrder(input: {
  projectId: string;
  userId: string;
  planId: string;
  paymentChannelId: string;
  amountCents: number;
  couponCode: string | null;
  policy?: PaymentOrderGuardValue;
}) {
  const policy =
    input.policy ?? (await getPaymentOrderGuardPolicy(input.projectId));
  if (policy.pendingReuseMinutes <= 0) return null;
  return prisma.order.findFirst({
    where: {
      userId: input.userId,
      planId: input.planId,
      paymentChannelId: input.paymentChannelId,
      amountCents: input.amountCents,
      couponCode: input.couponCode,
      status: "pending",
      paymentUrl: { not: null },
      createdAt: {
        gte: new Date(Date.now() - policy.pendingReuseMinutes * 60_000),
      },
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
