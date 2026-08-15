import { ProxyAgent, fetch as undiciFetch } from "undici";
import {
  DEFAULT_GROWTH_SLOT_NAME_I18N,
  normalizeAppCopyI18n,
  pickAppCopy,
  USER_API_PREFIX,
} from "@habibi/shared";
import { env } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { WireRawError, wireraw } from "../../wireraw/client.js";
import { localizePlanCopy } from "../plan-i18n.js";
import { getNodeRegionByHost } from "../nodes.js";
import {
  getSubscriptionClientCopy,
  getSubscriptionNodeNameMode,
} from "../system-settings.js";
import {
  applySubCopyVars,
  buildShadowrocketStatus,
  buildSubCopyVars,
  bytesToNumber,
  resolveProfileTitle,
} from "./copy-vars.js";
import { applyNodeNameStyle } from "./node-names.js";
import {
  type ClientSubscriptionUrls,
  SUB_CLIENT_URL_KEYS,
  normalizeSubFormat,
  renderKindFor,
  type SubClientFormat,
} from "./formats.js";
import {
  cloneNodeWithName,
  extractShareUris,
  parseShareUri,
  uniqueNames,
} from "./parse.js";
import { renderSubscription } from "./render.js";
import { signSubToken, verifySubToken } from "./token.js";

const proxyDispatcher = env.WIRERAW_HTTP_PROXY
  ? new ProxyAgent(env.WIRERAW_HTTP_PROXY)
  : undefined;

/** Fresh cache window for upstream subscription bodies. */
const UPSTREAM_CACHE_TTL_MS = 90_000;
/** Serve stale body up to this age when upstream is rate-limited. */
const UPSTREAM_STALE_TTL_MS = 15 * 60_000;

type UpstreamCacheEntry = {
  body: string;
  fetchedAt: number;
};

const upstreamCache = new Map<string, UpstreamCacheEntry>();
const upstreamInflight = new Map<string, Promise<string>>();

export {
  SUB_CLIENT_FORMATS,
  SUB_CLIENT_URL_KEYS,
  normalizeSubFormat,
  type ClientSubscriptionUrls,
  type SubClientFormat,
} from "./formats.js";
export { signSubToken, verifySubToken } from "./token.js";

export function buildProfileTitle(
  siteName: string | null | undefined,
  planName: string | null | undefined,
  template?: string | null,
): string {
  return resolveProfileTitle(
    template,
    buildSubCopyVars({ siteName, planName }),
  );
}

export function buildClientSubscriptionUrls(
  slotId: string,
  opts?: { profileTitle?: string },
): ClientSubscriptionUrls {
  const token = signSubToken(slotId);
  const origin = env.API_PUBLIC_ORIGIN.replace(/\/$/, "");
  const base = `${origin}${USER_API_PREFIX}/sub/${encodeURIComponent(token)}`;
  const out = {} as ClientSubscriptionUrls;
  for (const item of SUB_CLIENT_URL_KEYS) {
    let url = `${base}/${item.format}`;
    if (opts?.profileTitle?.trim()) {
      const title = opts.profileTitle.trim();
      // Path segment → Shadowrocket "URL default name" fallback (last path part).
      // Hash → import-time remark for sub:// / some SR versions.
      if (item.key === "shadowrocket") {
        url += `/${encodeURIComponent(title)}#${encodeURIComponent(title)}`;
      }
    }
    out[item.key] = url;
  }
  return out;
}

export type SubConvertResult = {
  body: string;
  contentType: string;
  filename: string;
  headers: Record<string, string>;
  profileName: string;
  format: SubClientFormat;
  nodeCount: number;
};

export async function convertSubscriptionByToken(input: {
  token: string;
  formatRaw?: string | null;
  userAgent?: string | null;
}): Promise<SubConvertResult> {
  const slotId = verifySubToken(input.token);
  if (!slotId) {
    const err = new Error("sub.token_invalid");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const slot = await prisma.userUpstream.findUnique({
    where: { id: slotId },
    include: {
      user: { include: { project: true } },
      plan: true,
    },
  });
  if (!slot || !slot.subscriptionUrl) {
    const err = new Error("sub.not_found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }
  if (slot.status === "disabled" || slot.user.status !== "active") {
    const err = new Error("sub.disabled");
    (err as { statusCode?: number }).statusCode = 403;
    throw err;
  }

  const project = slot.user.project;
  const siteName = (project.name || project.code || "VPN").trim();
  const planName = resolveSlotPlanName(slot);
  const format = normalizeSubFormat(input.formatRaw);
  const kind = renderKindFor(format);
  const clientCopy = await getSubscriptionClientCopy(project.id, format);
  const copyVars = buildSubCopyVars({
    siteName,
    planName,
    expiresAt: slot.expiresAt,
  });
  const profileName = resolveProfileTitle(clientCopy.profileTitle, copyVars);

  if (slot.expiresAt && slot.expiresAt.getTime() < Date.now()) {
    const err = new Error("sub.expired");
    (err as { statusCode?: number }).statusCode = 410;
    throw err;
  }

  const upstreamBody = await getUpstreamSubscriptionBody({
    cacheKey: slot.id,
    upstreamId: slot.upstreamId,
    subscriptionUrl: slot.subscriptionUrl,
    userAgent: input.userAgent,
  });
  const uris = extractShareUris(upstreamBody);
  // Node remarks keep upstream names — do not prefix site/project name.
  let nodes = uris
    .map(parseShareUri)
    .filter((n): n is NonNullable<typeof n> => !!n);
  nodes = uniqueNames(nodes);

  if (!nodes.length) {
    const err = new Error("sub.empty");
    (err as { statusCode?: number }).statusCode = 502;
    throw err;
  }

  const nameMode = await getSubscriptionNodeNameMode(project.id);
  if (nameMode !== "original") {
    const hostRegions = await getNodeRegionByHost();
    nodes = applyNodeNameStyle(nodes, nameMode, hostRegions);
  }

  if (clientCopy.items.length) {
    const source = nodes[0]!;
    nodes = [
      ...clientCopy.items.map((text) =>
        cloneNodeWithName(source, applySubCopyVars(text, copyVars)),
      ),
      ...nodes,
    ];
  }

  const expireSec = slot.expiresAt
    ? Math.floor(slot.expiresAt.getTime() / 1000)
    : 0;
  const usedBytes = bytesToNumber(slot.usedTrafficBytes);
  const limitBytes = bytesToNumber(slot.dataLimitBytes);
  const userinfo = [
    `upload=0`,
    `download=${Math.round(usedBytes)}`,
    `total=${Math.round(limitBytes)}`,
    `expire=${expireSec}`,
  ].join("; ");
  const announce = sanitizeHeaderValue(project.remark);
  const statusLine =
    format === "shadowrocket"
      ? buildShadowrocketStatus({
          uploadBytes: 0,
          downloadBytes: usedBytes,
          limitBytes,
          expiresAt: slot.expiresAt,
        })
      : undefined;
  const rendered = renderSubscription(kind, nodes, profileName, {
    userinfo,
    announce,
    statusLine,
  });

  const profileTitleB64 = Buffer.from(profileName, "utf8").toString("base64");
  const headers: Record<string, string> = {
    // Clash Meta / Stash: base64: form.
    "profile-title": `base64:${profileTitleB64}`,
    "profile-update-interval": "24",
    "subscription-userinfo": userinfo,
    // Secondary for Clash-family / browsers; not Shadowrocket's sub-name source.
    "content-disposition": buildContentDisposition(profileName, fileExtFor(kind)),
  };
  if (announce) {
    // Non-ASCII / newlines are illegal in Node HTTP headers; use base64 form.
    headers["announce"] = `base64:${Buffer.from(announce, "utf8").toString("base64")}`;
  }

  return {
    body: rendered.body,
    contentType: rendered.contentType,
    filename: rendered.filename,
    headers,
    profileName,
    format,
    nodeCount: nodes.length,
  };
}

async function getUpstreamSubscriptionBody(input: {
  cacheKey: string;
  upstreamId: string | null;
  subscriptionUrl: string;
  userAgent?: string | null;
}): Promise<string> {
  const cached = upstreamCache.get(input.cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < UPSTREAM_CACHE_TTL_MS) {
    return cached.body;
  }

  const inflight = upstreamInflight.get(input.cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    try {
      const body = await fetchUpstreamSubscription(input);
      upstreamCache.set(input.cacheKey, { body, fetchedAt: Date.now() });
      return body;
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const isRateLimited =
        code.includes("rate_limited") ||
        (err as { statusCode?: number }).statusCode === 429;
      if (isRateLimited && cached && now - cached.fetchedAt < UPSTREAM_STALE_TTL_MS) {
        return cached.body;
      }
      throw err;
    } finally {
      upstreamInflight.delete(input.cacheKey);
    }
  })();

  upstreamInflight.set(input.cacheKey, task);
  return task;
}

async function fetchUpstreamSubscription(input: {
  upstreamId: string | null;
  subscriptionUrl: string;
  userAgent?: string | null;
}): Promise<string> {
  let rateLimited = false;

  // Prefer merchant API — usually not subject to public softsub edge limits.
  if (input.upstreamId) {
    try {
      const rendered = await wireraw.getSubscription(input.upstreamId, "base64");
      const b64 = rendered.payload?.Body;
      if (typeof b64 === "string" && b64.trim()) {
        // Merchant payload.Body is base64 of the public softsub response bytes
        // (usually another base64 blob of share links). Decode one layer so
        // extractShareUris sees the same shape as a direct softsub fetch.
        try {
          return Buffer.from(b64.trim(), "base64").toString("utf8");
        } catch {
          return b64.trim();
        }
      }
    } catch (err) {
      const kind = classifyUpstreamError(err);
      if (kind === "expired") {
        const e = new Error("sub.expired");
        (e as { statusCode?: number }).statusCode = 410;
        throw e;
      }
      if (kind === "revoked") {
        const e = new Error("sub.revoked");
        (e as { statusCode?: number }).statusCode = 410;
        throw e;
      }
      if (kind === "rate_limited") rateLimited = true;
      // other / rate-limited → try public softsub URL once
    }
  }

  try {
    return await fetchPublicSubscriptionUrl(input.subscriptionUrl, input.userAgent);
  } catch (err) {
    if (rateLimited) {
      const e = new Error("sub.rate_limited");
      (e as { statusCode?: number }).statusCode = 429;
      throw e;
    }
    throw err;
  }
}

function classifyUpstreamError(
  err: unknown,
): "expired" | "revoked" | "rate_limited" | "other" {
  if (!(err instanceof WireRawError)) return "other";
  const code = String(
    (typeof err.body === "object" &&
    err.body &&
    "code" in err.body &&
    typeof (err.body as { code?: unknown }).code === "string"
      ? (err.body as { code: string }).code
      : err.code) || "",
  );
  if (code.includes("user_expired") || code.includes(".expired")) return "expired";
  if (code.includes("revoked") || code.includes("not_found")) return "revoked";
  if (code.includes("rate_limited") || err.status === 429) return "rate_limited";
  return "other";
}

async function fetchPublicSubscriptionUrl(
  url: string,
  userAgent?: string | null,
): Promise<string> {
  const res = await undiciFetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      // Prefer a known client UA — some sub edges reject unknown agents.
      "User-Agent":
        userAgent?.trim() && !/mozilla|chrome|safari|curl/i.test(userAgent)
          ? userAgent.trim()
          : "ClashMeta/1.19.0",
    },
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    const code = extractUpstreamErrorCode(text);
    throwUpstreamCode(code, res.status);
  }
  return text;
}

function throwUpstreamCode(code: string | null, status: number): never {
  if (
    code === "proxy.subscription.user_expired" ||
    code === "proxy.subscription.expired"
  ) {
    const err = new Error("sub.expired");
    (err as { statusCode?: number }).statusCode = 410;
    throw err;
  }
  if (
    code === "proxy.subscription.revoked" ||
    code === "proxy.subscription.not_found"
  ) {
    const err = new Error("sub.revoked");
    (err as { statusCode?: number }).statusCode = 410;
    throw err;
  }
  if (code?.includes("rate_limited") || status === 429) {
    const err = new Error("sub.rate_limited");
    (err as { statusCode?: number }).statusCode = 429;
    throw err;
  }
  const err = new Error(
    code ? `sub.upstream_${code}` : `sub.upstream_http_${status}`,
  );
  (err as { statusCode?: number }).statusCode = 502;
  throw err;
}

function resolveSlotPlanName(slot: {
  plan?: { name: string; nameI18n?: unknown } | null;
  displayNameI18n?: unknown;
  planId?: string | null;
}): string {
  if (slot.plan) {
    const copy = localizePlanCopy(slot.plan as Parameters<typeof localizePlanCopy>[0], "zh");
    return (copy.name || slot.plan.name || "").trim();
  }
  const i18n = normalizeAppCopyI18n(slot.displayNameI18n, 120);
  const growth = pickAppCopy(
    Object.keys(i18n).length ? i18n : DEFAULT_GROWTH_SLOT_NAME_I18N,
    "zh",
  );
  return (growth.text || "").trim();
}

/** Strip CR/LF and collapse whitespace; empty → null. */
function sanitizeHeaderValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 200) : null;
}

/** ASCII-safe fallback for Content-Disposition filename="...". */
function sanitizeFilenameHeader(name: string): string {
  const ascii = name.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
  return ascii || "subscription";
}

function fileExtFor(kind: ReturnType<typeof renderKindFor>): string {
  switch (kind) {
    case "clash":
    case "hiddify":
      return ".yaml";
    case "surge":
      return ".conf";
    default:
      return ".txt";
  }
}

/**
 * Shadowrocket / browsers read the subscription title from Content-Disposition.
 * filename* carries the real UTF-8 name; filename= is ASCII-only fallback.
 */
function buildContentDisposition(displayName: string, ext: string): string {
  const base = displayName.trim() || "subscription";
  const withExt = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
  const ascii = sanitizeFilenameHeader(withExt);
  const encoded = encodeURIComponent(withExt).replace(/['()]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function extractUpstreamErrorCode(body: string): string | null {
  try {
    const data = JSON.parse(body) as {
      code?: string;
      error?: { code?: string } | string;
      error_string?: string;
    };
    if (typeof data.code === "string" && data.code) return data.code;
    if (typeof data.error_string === "string" && data.error_string)
      return data.error_string;
    if (typeof data.error === "string" && data.error) return data.error;
    if (
      data.error &&
      typeof data.error === "object" &&
      typeof data.error.code === "string"
    ) {
      return data.error.code;
    }
  } catch {
    /* plain text body */
  }
  return null;
}
