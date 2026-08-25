import { Redis } from "ioredis";
import { env } from "../config.js";

let client: Redis | null = null;

/** Parse REDIS_URL; `redis://password@host` is treated as the password. */
function parseRedisUrl(raw: string) {
  const u = new URL(raw);
  let username = decodeURIComponent(u.username);
  let password = decodeURIComponent(u.password);
  if (username && !password) {
    password = username;
    username = "";
  }
  const pathDb = u.pathname.replace(/^\//, "");
  const db = pathDb ? Number.parseInt(pathDb, 10) : 0;
  return {
    host: u.hostname || "127.0.0.1",
    port: Number(u.port) || 6379,
    username: username || undefined,
    password: password || undefined,
    db: Number.isFinite(db) ? db : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
  };
}

/** Lazy singleton. Callers should tolerate connection errors. */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis({
      ...parseRedisUrl(env.REDIS_URL),
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      // v6 defaults to HELLO 3. Redis with requirepass rejects HELLO before AUTH.
      protocol: 2,
    });
    client.on("error", (err: Error) => {
      // Avoid unhandled error events crashing the process.
      if (/NOAUTH|HELLO/i.test(err.message)) {
        console.warn(
          "[redis] 认证失败。若 Redis 开了 requirepass，REDIS_URL 写成 redis://:密码@127.0.0.1:6379（冒号不能少）",
        );
      }
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
