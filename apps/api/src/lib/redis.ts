import { Redis } from "ioredis";
import { env } from "../config.js";

let client: Redis | null = null;

/** Lazy singleton. Callers should tolerate connection errors. */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => {
      // Avoid unhandled error events crashing the process.
      console.warn("[redis]", err.message);
    });
  }
  return client;
}

const INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`;

async function ensureConnected(r: Redis) {
  if (r.status === "wait") {
    await r.connect();
  }
}

/** Atomic INCR with TTL set only on first hit. */
export async function redisIncrWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const r = getRedis();
  await ensureConnected(r);
  const n = await r.eval(INCR_EXPIRE_LUA, 1, key, String(ttlSeconds));
  return Number(n);
}

/** SET key NX EX — returns true if acquired. */
export async function redisSetNxEx(
  key: string,
  ttlSeconds: number,
  value = "1",
): Promise<boolean> {
  const r = getRedis();
  await ensureConnected(r);
  const res = await r.set(key, value, "EX", ttlSeconds, "NX");
  return res === "OK";
}

export async function redisTtl(key: string): Promise<number> {
  const r = getRedis();
  await ensureConnected(r);
  return r.ttl(key);
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getRedis();
  await ensureConnected(r);
  return r.get(key);
}

export async function redisSetEx(
  key: string,
  ttlSeconds: number,
  value: string,
): Promise<void> {
  const r = getRedis();
  await ensureConnected(r);
  await r.set(key, value, "EX", ttlSeconds);
}

export async function redisDel(key: string): Promise<void> {
  const r = getRedis();
  await ensureConnected(r);
  await r.del(key);
}
