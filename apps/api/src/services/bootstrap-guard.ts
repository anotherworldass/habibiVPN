import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { extractAuthContext, type AuthRequestLike, type ClientMetaInput } from "./auth-events.js";
import { bindInviteForExistingUser } from "./referral/bind.js";

type Bucket = { count: number; resetAt: number };

/** Process-local sliding windows (multi-instance 需再接 Redis). */
const ipBuckets = new Map<string, Bucket>();
const deviceBuckets = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let b = map.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    map.set(key, b);
  }
  b.count += 1;
  // Opportunistic cleanup
  if (map.size > 20_000) {
    for (const [k, v] of map) {
      if (now >= v.resetAt) map.delete(k);
    }
  }
  return b.count <= limit;
}

function err(code: string, status = 429) {
  return Object.assign(new Error(code), { statusCode: status });
}

/**
 * Find latest active *anonymous* user previously bootstrapped on this device.
 * Skips accounts that later bound an email (still searchable via older events).
 * Registered accounts are never returned via bootstrap (must login).
 */
export async function findAnonymousUserByDevice(deviceIdHash: string) {
  const events = await prisma.userAuthEvent.findMany({
    where: {
      deviceIdHash,
      eventType: "anonymous_bootstrap",
      success: true,
      userId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
    take: 30,
  });

  const seen = new Set<string>();
  for (const event of events) {
    const userId = event.userId;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.status === "active" && !user.email) return user;
  }
  return null;
}

/** How many new anonymous accounts this device created in the last 24h. */
async function deviceNewAccountsLastDay(deviceIdHash: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  // Distinct users bootstrapped from this device recently
  const rows = await prisma.userAuthEvent.findMany({
    where: {
      deviceIdHash,
      eventType: "anonymous_bootstrap",
      success: true,
      userId: { not: null },
      createdAt: { gte: since },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

export function readBootstrapContext(input: {
  req: AuthRequestLike;
  clientMeta?: ClientMetaInput | null;
}) {
  return extractAuthContext(input.req, input.clientMeta);
}

/** IP / device burst limit (applies to reuse + create). */
export function assertBootstrapBurstLimit(input: {
  ip: string | null;
  deviceIdHash: string | null;
}) {
  const ipLimit = env.BOOTSTRAP_IP_LIMIT_PER_MIN;

  if (input.ip) {
    const ok = hit(ipBuckets, `ip:${input.ip}`, ipLimit, 60_000);
    if (!ok) throw err("auth.bootstrap_rate_limited");
  }

  if (input.deviceIdHash) {
    const ok = hit(
      deviceBuckets,
      `dev:${input.deviceIdHash}`,
      Math.max(ipLimit, 10),
      60_000,
    );
    if (!ok) throw err("auth.bootstrap_rate_limited");
  } else if (env.BOOTSTRAP_REQUIRE_DEVICE_ID) {
    throw err("auth.device_id_required", 400);
  }
}

/** Cap brand-new anonymous accounts per device / day (reuse path skips this). */
export async function assertBootstrapNewAccountAllowed(deviceIdHash: string | null) {
  if (!deviceIdHash) return;
  const created = await deviceNewAccountsLastDay(deviceIdHash);
  if (created >= env.BOOTSTRAP_DEVICE_NEW_PER_DAY) {
    throw err("auth.bootstrap_device_limited");
  }
}

/**
 * Reuse anonymous identity for device, optionally late-bind invite.
 */
export async function reuseAnonymousBootstrap(input: {
  userId: string;
  inviteCode?: string | null;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.status !== "active" || user.email) {
    throw err("auth.bootstrap_reuse_unavailable", 409);
  }

  if (!user.invitedById && input.inviteCode?.trim()) {
    try {
      await bindInviteForExistingUser({
        userId: user.id,
        inviteCode: input.inviteCode.trim(),
      });
    } catch {
      /* ignore invalid/already-bound invite on reuse */
    }
    return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  }
  return user;
}
