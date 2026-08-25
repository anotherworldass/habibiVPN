import { Redis } from "ioredis";
import { env } from "../config.js";

let client: Redis | null = null;

const REDIS_OP_MS = 2500;

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

function redisTimeout(code: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(code)), REDIS_OP_MS);
  });
}

/** Lazy singleton. Callers should tolerate connection errors. */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis({
      ...parseRedisUrl(env.REDIS_URL),
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: REDIS_OP_MS,
      // v6 defaults to HELLO 3. Redis with requirepass rejects HELLO before AUTH.
      protocol: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 150, 800);
      },
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

async function ensureConnected(r: Redis) {
  if (r.status === "ready") return;
  const start = async () => {
    if (r.status === "wait" || r.status === "end" || r.status === "close") {
      await r.connect();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      if (r.status === "ready") {
        resolve();
        return;
      }
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onFail = () => {
        cleanup();
        reject(new Error("redis.disconnected"));
      };
      const cleanup = () => {
        r.off("ready", onReady);
        r.off("end", onFail);
        r.off("close", onFail);
      };
      r.once("ready", onReady);
      r.once("end", onFail);
      r.once("close", onFail);
    });
  };
  await Promise.race([start(), redisTimeout("redis.connect_timeout")]);
}

async function withRedis<T>(fn: (r: Redis) => Promise<T>): Promise<T> {
  const r = getRedis();
  await ensureConnected(r);
  return Promise.race([fn(r), redisTimeout("redis.command_timeout")]);
}

const INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`;

/** Atomic INCR with TTL set only on first hit. */
export async function redisIncrWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const n = await withRedis((r) => r.eval(INCR_EXPIRE_LUA, 1, key, String(ttlSeconds)));
  return Number(n);
}

/** SET key NX EX — returns true if acquired. */
export async function redisSetNxEx(
  key: string,
  ttlSeconds: number,
  value = "1",
): Promise<boolean> {
  const res = await withRedis((r) => r.set(key, value, "EX", ttlSeconds, "NX"));
  return res === "OK";
}

export async function redisTtl(key: string): Promise<number> {
  return withRedis((r) => r.ttl(key));
}

export async function redisGet(key: string): Promise<string | null> {
  return withRedis((r) => r.get(key));
}

export async function redisSetEx(
  key: string,
  ttlSeconds: number,
  value: string,
): Promise<void> {
  await withRedis((r) => r.set(key, value, "EX", ttlSeconds));
}

export async function redisDel(key: string): Promise<void> {
  await withRedis((r) => r.del(key));
}
