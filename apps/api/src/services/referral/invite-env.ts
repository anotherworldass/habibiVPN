import { prisma } from "../../lib/prisma.js";

export type AuthEnvRow = {
  ip: string | null;
  deviceIdHash: string | null;
  timezone: string | null;
  locale: string | null;
  osName: string | null;
  userAgent: string | null;
};

export type InviteEnvFlag = "same_device" | "same_ip" | "similar_env";

export type InviteEnvSimilar = {
  timezone: string;
  locale: string;
  os_name: string;
  ua_stem: string;
};

export type InviteEnvCompare = {
  flags: InviteEnvFlag[];
  shared_ips: string[];
  shared_device_count: number;
  similar: InviteEnvSimilar | null;
  event_count_a: number;
  event_count_b: number;
};

const AUTH_ENV_LIMIT = 200;
const AUTH_ENV_USER_CHUNK = 10;

function stripIpv4Mapped(ip: string): string {
  const t = ip.trim().toLowerCase();
  if (t.startsWith("::ffff:")) return t.slice(7);
  return t;
}

/** Loopback / RFC1918 / link-local — too noisy for invite risk. */
export function isIgnoredIp(ip: string | null | undefined): boolean {
  if (!ip?.trim()) return true;
  const t = stripIpv4Mapped(ip);
  if (t === "127.0.0.1" || t === "::1" || t === "localhost" || t === "0.0.0.0") {
    return true;
  }
  if (t.startsWith("10.")) return true;
  if (t.startsWith("192.168.")) return true;
  if (t.startsWith("169.254.")) return true;
  const m = /^172\.(\d+)\./.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  if (t.startsWith("fc") || t.startsWith("fd") || t.startsWith("fe80:")) return true;
  return false;
}

export function maskIp(ip: string): string {
  const t = stripIpv4Mapped(ip);
  const v4 = t.split(".");
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.*.*`;
  const v6 = t.split(":");
  if (v6.length >= 3) return `${v6[0]}:${v6[1]}:*`;
  return "***";
}

export function uaStem(ua: string | null | undefined): string | null {
  if (!ua?.trim()) return null;
  const t = ua.trim();
  const paren = t.indexOf("(");
  const cut = (paren > 0 ? t.slice(0, paren) : t.slice(0, 80)).trim();
  return cut.toLowerCase() || null;
}

function envKey(row: AuthEnvRow): string | null {
  const tz = row.timezone?.trim();
  const locale = row.locale?.trim();
  const os = row.osName?.trim();
  const stem = uaStem(row.userAgent);
  if (!tz || !locale || !os || !stem) return null;
  return `${tz}|${locale}|${os}|${stem}`;
}

function parseEnvKey(key: string): InviteEnvSimilar {
  const [timezone, locale, os_name, ua_stem] = key.split("|");
  return { timezone, locale, os_name, ua_stem };
}

export function compareInviteEnvironment(
  rowsA: AuthEnvRow[],
  rowsB: AuthEnvRow[],
): InviteEnvCompare {
  const ipsA = new Set<string>();
  const ipsB = new Set<string>();
  const devicesA = new Set<string>();
  const devicesB = new Set<string>();
  const envA = new Set<string>();
  const envB = new Set<string>();

  for (const row of rowsA) {
    if (row.ip && !isIgnoredIp(row.ip)) ipsA.add(stripIpv4Mapped(row.ip));
    if (row.deviceIdHash) devicesA.add(row.deviceIdHash);
    const key = envKey(row);
    if (key) envA.add(key);
  }
  for (const row of rowsB) {
    if (row.ip && !isIgnoredIp(row.ip)) ipsB.add(stripIpv4Mapped(row.ip));
    if (row.deviceIdHash) devicesB.add(row.deviceIdHash);
    const key = envKey(row);
    if (key) envB.add(key);
  }

  const sharedIps = [...ipsA].filter((ip) => ipsB.has(ip)).sort();
  const sharedDevices = [...devicesA].filter((d) => devicesB.has(d));
  const sharedEnv = [...envA].filter((k) => envB.has(k)).sort();

  const flags: InviteEnvFlag[] = [];
  if (sharedDevices.length) flags.push("same_device");
  if (sharedIps.length) flags.push("same_ip");
  const similar =
    !flags.length && sharedEnv.length ? parseEnvKey(sharedEnv[0]!) : null;
  if (similar) flags.push("similar_env");

  return {
    flags,
    shared_ips: sharedIps.map(maskIp),
    shared_device_count: sharedDevices.length,
    similar,
    event_count_a: rowsA.length,
    event_count_b: rowsB.length,
  };
}

export async function loadAuthEnvRows(
  userIds: string[],
): Promise<Map<string, AuthEnvRow[]>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, AuthEnvRow[]>();
  for (const id of unique) map.set(id, []);
  for (let i = 0; i < unique.length; i += AUTH_ENV_USER_CHUNK) {
    const slice = unique.slice(i, i + AUTH_ENV_USER_CHUNK);
    const batches = await Promise.all(
      slice.map((userId) =>
        prisma.userAuthEvent.findMany({
          where: { userId, success: true },
          orderBy: { createdAt: "desc" },
          take: AUTH_ENV_LIMIT,
          select: {
            ip: true,
            deviceIdHash: true,
            timezone: true,
            locale: true,
            osName: true,
            userAgent: true,
          },
        }),
      ),
    );
    slice.forEach((id, idx) => {
      map.set(id, batches[idx] || []);
    });
  }
  return map;
}
