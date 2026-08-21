import { prisma } from "../lib/prisma.js";
import { redisIncrWithTtl, redisTtl } from "../lib/redis.js";
import {
  extractAuthContext,
  type AuthRequestLike,
  type ClientMetaInput,
} from "./auth-events.js";
import { getAuthEmailPolicy } from "./system-settings.js";

function err(code: string, status = 429, retryAfterSeconds?: number) {
  return Object.assign(new Error(code), { statusCode: status, retryAfterSeconds });
}

async function incrOrThrow(key: string, limit: number, ttlSeconds: number, code: string) {
  try {
    const n = await redisIncrWithTtl(key, ttlSeconds);
    if (n <= limit) return;
    const ttl = await redisTtl(key);
    throw err(code, 429, ttl > 0 ? ttl : ttlSeconds);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) throw error;
  }
}

async function countNewRegisters(input: {
  ip?: string | null;
  deviceIdHash?: string | null;
}) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const where = {
    eventType: "register" as const,
    success: true,
    createdAt: { gte: since },
    ...(input.ip ? { ip: input.ip } : {}),
    ...(input.deviceIdHash ? { deviceIdHash: input.deviceIdHash } : {}),
  };
  const rows = await prisma.userAuthEvent.findMany({
    where,
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

export function readRegisterContext(input: {
  req: AuthRequestLike;
  clientMeta?: ClientMetaInput | null;
}) {
  return extractAuthContext(input.req, input.clientMeta);
}

/** Burst limits for send-code / register attempts (IP + device). */
export async function assertRegisterAttemptAllowed(input: {
  projectId: string;
  req: AuthRequestLike;
  clientMeta?: ClientMetaInput | null;
}) {
  const policy = await getAuthEmailPolicy(input.projectId);
  if (!policy.limitRegisterAbuse) return;
  const ctx = readRegisterContext(input);
  const burst = policy.registerAttemptPer10Min;
  if (ctx.ip) {
    await incrOrThrow(
      `auth:reg:ip:${ctx.ip}:10m`,
      burst,
      600,
      "auth.register_rate_limited",
    );
  }
  if (ctx.deviceIdHash) {
    await incrOrThrow(
      `auth:reg:dev:${ctx.deviceIdHash}:10m`,
      burst,
      600,
      "auth.register_rate_limited",
    );
  }
}

/**
 * Cap brand-new email accounts per IP / device (same idea as App bootstrap).
 * Call only when creating a new user row, not when verifying an existing UID.
 */
export async function assertRegisterNewAccountAllowed(input: {
  projectId: string;
  req: AuthRequestLike;
  clientMeta?: ClientMetaInput | null;
}) {
  const policy = await getAuthEmailPolicy(input.projectId);
  if (!policy.limitRegisterAbuse) return;
  await assertRegisterAttemptAllowed(input);
  const ctx = readRegisterContext(input);

  if (ctx.deviceIdHash) {
    const created = await countNewRegisters({ deviceIdHash: ctx.deviceIdHash });
    if (created >= policy.registerDeviceNewPerDay) {
      throw err("auth.register_device_limited");
    }
  }

  if (ctx.ip) {
    const created = await countNewRegisters({ ip: ctx.ip });
    if (created >= policy.registerIpNewPerDay) {
      throw err("auth.register_ip_limited");
    }
  }
}
