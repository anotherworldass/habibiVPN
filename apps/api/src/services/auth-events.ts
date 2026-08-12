import { createHash } from "node:crypto";
import type { ClientChannel, Prisma, UserAuthEventType } from "@prisma/client";
import { normalizeTimezone } from "../lib/normalize-timezone.js";
import { prisma } from "../lib/prisma.js";
import { CLIENT_CHANNELS } from "./catalog.js";

export type ClientMetaInput = {
  timezone?: string | null;
  locale?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  device_id?: string | null;
  /** Shell / surface, e.g. telegram_mini_app — not an OS */
  shell?: string | null;
  /** Host platform hint: ios / android / macos / tdesktop … */
  platform?: string | null;
  /** Support / ops entry: h5 | app */
  entry?: string | null;
};

/** Values wrongly put in os_name that should not block UA OS parsing. */
const NON_OS_LABELS = new Set([
  "telegram",
  "tg",
  "tg-mini",
  "telegram_mini_app",
  "webview",
  "web",
  "browser",
  "h5",
  "miniapp",
  "mini_app",
]);

export type AuthRequestLike = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

function headerOne(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim() || null;
  return v?.trim() || null;
}

function parseClient(raw: string | null): ClientChannel | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((CLIENT_CHANNELS as string[]).includes(v)) return v as ClientChannel;
  return null;
}

function clientIp(req: AuthRequestLike): string | null {
  const forwarded = headerOne(req.headers, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 45);
  }
  const realIp = headerOne(req.headers, "x-real-ip");
  if (realIp) return realIp.slice(0, 45);
  if (req.ip) return req.ip.slice(0, 45);
  return null;
}

function hashDeviceId(raw: string | null | undefined): string | null {
  const id = raw?.trim();
  if (!id) return null;
  return createHash("sha256").update(id).digest("hex").slice(0, 64);
}

function acceptLanguage(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headerOne(headers, "accept-language");
  if (!raw) return null;
  const primary = raw.split(",")[0]?.trim();
  return primary ? primary.slice(0, 32) : null;
}

const WINDOWS_NT_VERSION: Record<string, string> = {
  "10.0": "10/11",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
};

/** Best-effort OS name/version from User-Agent when client did not send os_* fields. */
export function parseOsFromUserAgent(ua: string | null | undefined): {
  osName: string | null;
  osVersion: string | null;
} {
  if (!ua) return { osName: null, osVersion: null };

  const ios =
    ua.match(/(?:iPhone|iPad|iPod).*OS (\d+[._]\d+(?:[._]\d+)?)/i) ||
    ua.match(/CPU (?:iPhone )?OS (\d+[._]\d+(?:[._]\d+)?)/i);
  if (ios) {
    return { osName: "iOS", osVersion: ios[1]!.replace(/_/g, ".").slice(0, 64) };
  }

  const android = ua.match(/Android (\d+(?:\.\d+)*)/i);
  if (android) {
    return { osName: "Android", osVersion: android[1]!.slice(0, 64) };
  }

  const mac = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/i);
  if (mac) {
    return { osName: "macOS", osVersion: mac[1]!.replace(/_/g, ".").slice(0, 64) };
  }

  const win = ua.match(/Windows NT (\d+\.\d+)/i);
  if (win) {
    const nt = win[1]!;
    return {
      osName: "Windows",
      osVersion: (WINDOWS_NT_VERSION[nt] || nt).slice(0, 64),
    };
  }

  if (/CrOS/i.test(ua)) return { osName: "Chrome OS", osVersion: null };
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return { osName: "Linux", osVersion: null };

  return { osName: null, osVersion: null };
}

/** Extract auth context from request headers + optional JSON body.client_meta. */
export function extractAuthContext(
  req: AuthRequestLike,
  clientMeta?: ClientMetaInput | null,
  opts?: { fallbackClient?: ClientChannel | null },
) {
  const body =
    req.body && typeof req.body === "object"
      ? (req.body as { client_meta?: ClientMetaInput }).client_meta
      : undefined;
  const meta = { ...body, ...clientMeta };

  const rawOsName =
    meta?.os_name?.trim().slice(0, 64) ||
    headerOne(req.headers, "x-habibi-os")?.slice(0, 64) ||
    null;
  const rawOsIsShell = !!(rawOsName && NON_OS_LABELS.has(rawOsName.toLowerCase()));
  let osName = rawOsName && !rawOsIsShell ? rawOsName : null;
  let osVersion =
    meta?.os_version?.trim().slice(0, 64) ||
    headerOne(req.headers, "x-habibi-os-version")?.slice(0, 64) ||
    null;
  if (rawOsIsShell) osVersion = null;

  const userAgent = headerOne(req.headers, "user-agent")?.slice(0, 2000) || null;
  if ((!osName || !osVersion) && userAgent) {
    const parsed = parseOsFromUserAgent(userAgent);
    if (!osName) {
      osName = parsed.osName;
      osVersion = osVersion || parsed.osVersion;
    } else if (!osVersion && parsed.osName?.toLowerCase() === osName.toLowerCase()) {
      osVersion = parsed.osVersion;
    }
  }

  const platform =
    meta?.platform?.trim().slice(0, 64) ||
    headerOne(req.headers, "x-habibi-platform")?.slice(0, 64) ||
    null;

  if (!osName && platform) {
    const p = platform.toLowerCase();
    if (p === "ios") osName = "iOS";
    else if (p === "android" || p === "android_x") osName = "Android";
    else if (p === "macos") osName = "macOS";
    else if (p === "windows") osName = "Windows";
    else if (p === "linux") osName = "Linux";
  }

  const headerClient = parseClient(headerOne(req.headers, "x-habibi-client"));
  const shell =
    meta?.shell?.trim().slice(0, 64) ||
    headerOne(req.headers, "x-habibi-shell")?.slice(0, 64) ||
    (rawOsIsShell ? rawOsName : null);

  return {
    ip: clientIp(req),
    userAgent,
    timezone: normalizeTimezone(
      meta?.timezone?.trim() ||
        headerOne(req.headers, "x-habibi-timezone") ||
        null,
    ),
    locale:
      meta?.locale?.trim().slice(0, 32) ||
      headerOne(req.headers, "x-habibi-locale")?.slice(0, 32) ||
      acceptLanguage(req.headers),
    client: headerClient ?? opts?.fallbackClient ?? null,
    appVersion:
      meta?.app_version?.trim().slice(0, 64) ||
      headerOne(req.headers, "x-habibi-app-version")?.slice(0, 64) ||
      null,
    osName,
    osVersion,
    shell,
    platform,
    deviceIdHash: hashDeviceId(
      meta?.device_id || headerOne(req.headers, "x-habibi-device-id"),
    ),
  };
}

export async function recordAuthEvent(input: {
  userId?: string | null;
  eventType: UserAuthEventType;
  success?: boolean;
  failureReason?: string | null;
  req: AuthRequestLike;
  clientMeta?: ClientMetaInput | null;
  meta?: Prisma.InputJsonValue;
  fallbackClient?: ClientChannel | null;
}) {
  const ctx = extractAuthContext(input.req, input.clientMeta, {
    fallbackClient: input.fallbackClient,
  });

  const metaBag: Record<string, unknown> = {
    ...(input.meta && typeof input.meta === "object" && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : {}),
  };
  if (ctx.shell) metaBag.shell = ctx.shell;
  if (ctx.platform) metaBag.platform = ctx.platform;

  try {
    await prisma.userAuthEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        success: input.success ?? true,
        failureReason: input.failureReason ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        timezone: ctx.timezone,
        locale: ctx.locale,
        client: ctx.client,
        appVersion: ctx.appVersion,
        osName: ctx.osName,
        osVersion: ctx.osVersion,
        deviceIdHash: ctx.deviceIdHash,
        meta: Object.keys(metaBag).length
          ? (metaBag as Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch (err) {
    console.error("[auth-event] write failed", err);
  }
}

export async function listUserAuthEvents(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit || 50, 100);
  const offset = opts.offset || 0;
  const where = { userId };
  const [total, items] = await Promise.all([
    prisma.userAuthEvent.count({ where }),
    prisma.userAuthEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return {
    total,
    items: items.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      success: e.success,
      failure_reason: e.failureReason,
      ip: e.ip,
      user_agent: e.userAgent,
      timezone: e.timezone,
      locale: e.locale,
      client: e.client,
      app_version: e.appVersion,
      os_name: e.osName,
      os_version: e.osVersion,
      device_id_hash: e.deviceIdHash,
      meta: e.meta,
      created_at: e.createdAt,
    })),
  };
}
