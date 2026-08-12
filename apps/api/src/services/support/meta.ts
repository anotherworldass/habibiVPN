import type { Prisma } from "@prisma/client";
import {
  extractAuthContext,
  type AuthRequestLike,
  type ClientMetaInput,
} from "../auth-events.js";

export type SupportClientSource = "h5" | "app";

export type SupportClientMeta = {
  ip: string | null;
  userAgent: string | null;
  timezone: string | null;
  locale: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  deviceIdHash: string | null;
  appVersion: string | null;
  platform: string | null;
  shell: string | null;
  /** h5 = site widget; app = in-app WebView (/chat?from=app) */
  clientSource: SupportClientSource;
};

function parseSupportClientSource(
  req: AuthRequestLike,
  ctx: {
    client: string | null;
    shell: string | null;
    platform: string | null;
  },
  clientMeta?: ClientMetaInput | null,
): SupportClientSource {
  const entry = (clientMeta?.entry || "").trim().toLowerCase();
  if (entry === "app") return "app";
  if (entry === "h5" || entry === "web") return "h5";

  const shell = (ctx.shell || clientMeta?.shell || "").trim().toLowerCase();
  if (
    shell === "app" ||
    shell === "desktop_app" ||
    shell === "app_webview" ||
    shell === "webview" ||
    shell.endsWith("_app")
  ) {
    return "app";
  }

  const headerEntry =
    (Array.isArray(req.headers["x-habibi-entry"])
      ? req.headers["x-habibi-entry"][0]
      : req.headers["x-habibi-entry"]) ||
    (Array.isArray(req.headers["x-habibi-support-entry"])
      ? req.headers["x-habibi-support-entry"][0]
      : req.headers["x-habibi-support-entry"]);
  if (typeof headerEntry === "string") {
    const v = headerEntry.trim().toLowerCase();
    if (v === "app") return "app";
    if (v === "h5" || v === "web") return "h5";
  }

  // Native app clients calling support APIs directly.
  if (
    ctx.client &&
    ctx.client !== "h5" &&
    (ctx.client.startsWith("ios_") ||
      ctx.client.startsWith("android_") ||
      ctx.client === "macos" ||
      ctx.client === "windows" ||
      ctx.client === "linux")
  ) {
    return "app";
  }

  const platform = (ctx.platform || clientMeta?.platform || "")
    .trim()
    .toLowerCase();
  if (
    platform === "macos" ||
    platform === "windows" ||
    platform === "linux" ||
    platform === "ios" ||
    platform === "android"
  ) {
    return "app";
  }

  return "h5";
}

export function parseBrowserName(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/MSIE |Trident\//i.test(ua)) return "IE";
  return null;
}

export function extractSupportClientMeta(
  req: AuthRequestLike,
  clientMeta?: ClientMetaInput | null,
): SupportClientMeta {
  const ctx = extractAuthContext(req, clientMeta, { fallbackClient: "h5" });
  const clientSource = parseSupportClientSource(
    req,
    {
      client: ctx.client,
      shell: ctx.shell,
      platform: ctx.platform,
    },
    clientMeta,
  );
  const appVersion = ctx.appVersion;
  const platform = ctx.platform;
  const shell = ctx.shell;
  // Prefer native app label over host browser UA when opened from App/desktop.
  let browserName = parseBrowserName(ctx.userAgent);
  if (clientSource === "app") {
    const desktop =
      shell === "desktop_app" ||
      platform === "macos" ||
      platform === "windows" ||
      platform === "linux";
    browserName = [
      desktop ? "TiTiVPN Desktop" : "TiTiVPN",
      appVersion,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    timezone: ctx.timezone,
    locale: ctx.locale,
    osName: ctx.osName,
    osVersion: ctx.osVersion,
    browserName,
    deviceIdHash: ctx.deviceIdHash,
    appVersion,
    platform,
    shell,
    clientSource,
  };
}

export function clientMetaToJson(
  meta: SupportClientMeta,
): Prisma.InputJsonValue {
  return {
    ip: meta.ip,
    user_agent: meta.userAgent,
    timezone: meta.timezone,
    locale: meta.locale,
    os_name: meta.osName,
    os_version: meta.osVersion,
    browser_name: meta.browserName,
    device_id_hash: meta.deviceIdHash,
    app_version: meta.appVersion,
    platform: meta.platform,
    shell: meta.shell,
    client_source: meta.clientSource,
  };
}

export function guestProfileView(g: {
  id: string;
  ip: string | null;
  userAgent: string | null;
  timezone: string | null;
  locale: string | null;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  deviceIdHash: string | null;
  clientSource?: string | null;
  userId: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}) {
  return {
    id: g.id,
    user_id: g.userId,
    ip: g.ip,
    user_agent: g.userAgent,
    timezone: g.timezone,
    locale: g.locale,
    os_name: g.osName,
    os_version: g.osVersion,
    browser_name: g.browserName,
    device_id_hash: g.deviceIdHash,
    client_source: g.clientSource === "app" ? "app" : g.clientSource || "h5",
    last_seen_at: g.lastSeenAt,
    created_at: g.createdAt,
  };
}
