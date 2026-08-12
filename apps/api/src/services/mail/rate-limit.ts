import {
  getMailRateLimitPolicy,
  type MailRateLimitValue,
} from "../system-settings.js";
import {
  redisIncrWithTtl,
  redisSetNxEx,
  redisTtl,
} from "../../lib/redis.js";

export type MailSendPurpose = "register" | "login" | "password_reset";

type Bucket = { count: number; resetAt: number };

/** Fallback when Redis is unavailable (single-process). */
const memBuckets = new Map<string, Bucket>();
const memCooldowns = new Map<string, number>();

function memHit(key: string, limit: number, windowMs: number): {
  ok: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let b = memBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    memBuckets.set(key, b);
  }
  b.count += 1;
  if (memBuckets.size > 50_000) {
    for (const [k, v] of memBuckets) {
      if (now >= v.resetAt) memBuckets.delete(k);
    }
  }
  if (b.count <= limit) return { ok: true, retryAfterSeconds: 0 };
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

function memCooldown(key: string, cooldownSeconds: number): {
  ok: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const until = memCooldowns.get(key) || 0;
  if (until > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
    };
  }
  memCooldowns.set(key, now + cooldownSeconds * 1000);
  if (memCooldowns.size > 50_000) {
    for (const [k, v] of memCooldowns) {
      if (v <= now) memCooldowns.delete(k);
    }
  }
  return { ok: true, retryAfterSeconds: 0 };
}

function rateErr(code: string, retryAfterSeconds: number) {
  return Object.assign(new Error(code), {
    statusCode: 429,
    retryAfterSeconds,
  });
}

function hourBucket(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}`;
}

function minuteBucket(d = new Date()): string {
  return `${hourBucket(d)}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

async function incrLimit(
  key: string,
  limit: number,
  ttlSeconds: number,
): Promise<{ ok: boolean; retryAfterSeconds: number; via: "redis" | "memory" }> {
  try {
    const n = await redisIncrWithTtl(key, ttlSeconds);
    if (n <= limit) return { ok: true, retryAfterSeconds: 0, via: "redis" };
    const ttl = await redisTtl(key);
    return {
      ok: false,
      retryAfterSeconds: ttl > 0 ? ttl : ttlSeconds,
      via: "redis",
    };
  } catch {
    const hit = memHit(key, limit, ttlSeconds * 1000);
    return { ...hit, via: "memory" };
  }
}

async function acquireCooldown(
  key: string,
  cooldownSeconds: number,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  if (cooldownSeconds <= 0) return { ok: true, retryAfterSeconds: 0 };
  try {
    const acquired = await redisSetNxEx(key, cooldownSeconds);
    if (acquired) return { ok: true, retryAfterSeconds: 0 };
    const ttl = await redisTtl(key);
    return {
      ok: false,
      retryAfterSeconds: ttl > 0 ? ttl : cooldownSeconds,
    };
  } catch {
    return memCooldown(key, cooldownSeconds);
  }
}

/**
 * Rate-limit a mail OTP / reset send attempt (IP + email).
 * Uses Redis; falls back to process memory if Redis is down.
 * Policy is read from in-process cache (invalidated on admin save).
 */
export async function assertMailSendAttemptAllowed(input: {
  projectId: string;
  email: string;
  purpose: MailSendPurpose;
  ip?: string | null;
  policy?: MailRateLimitValue;
}): Promise<MailRateLimitValue> {
  const policy =
    input.policy ?? (await getMailRateLimitPolicy(input.projectId));
  const email = input.email.trim().toLowerCase();
  const ip = input.ip?.trim() || "unknown";
  const prefix = `mailrl:${input.projectId}`;

  const ipMin = await incrLimit(
    `${prefix}:ipm:${ip}:${minuteBucket()}`,
    policy.ipPerMinute,
    60,
  );
  if (!ipMin.ok) {
    throw rateErr("auth.mail_rate_limited", ipMin.retryAfterSeconds);
  }

  const ipHour = await incrLimit(
    `${prefix}:iph:${ip}:${hourBucket()}`,
    policy.ipPerHour,
    3600,
  );
  if (!ipHour.ok) {
    throw rateErr("auth.mail_rate_limited", ipHour.retryAfterSeconds);
  }

  const cd = await acquireCooldown(
    `${prefix}:cd:${input.purpose}:${email}`,
    policy.emailCooldownSeconds,
  );
  if (!cd.ok) {
    throw rateErr("auth.code_cooldown", cd.retryAfterSeconds);
  }

  const emailHour = await incrLimit(
    `${prefix}:eh:${email}:${hourBucket()}`,
    policy.emailPerHour,
    3600,
  );
  if (!emailHour.ok) {
    throw rateErr("auth.mail_rate_limited", emailHour.retryAfterSeconds);
  }

  return policy;
}

/** Cap actual SES sends per project (call only when about to send mail). */
export async function assertMailProjectSendAllowed(input: {
  projectId: string;
  policy?: MailRateLimitValue;
}): Promise<void> {
  const policy =
    input.policy ?? (await getMailRateLimitPolicy(input.projectId));
  const key = `mailrl:${input.projectId}:pm:${minuteBucket()}`;
  const hit = await incrLimit(key, policy.projectPerMinute, 60);
  if (!hit.ok) {
    throw rateErr("auth.mail_rate_limited", hit.retryAfterSeconds);
  }
}
