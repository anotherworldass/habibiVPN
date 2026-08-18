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
  getSubscriptionPublicOrigins,
} from "../system-settings.js";
import {
  applySubCopyVars,
  buildShadowrocketStatus,
  buildSubCopyVars,
  buildSubscriptionUserinfo,
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
  placeholderNode,
  type ProxyNode,
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

export function defaultSubscriptionPublicOrigin(): string {
  return env.API_PUBLIC_ORIGIN.replace(/\/$/, "");
}

/** Stable pick so the same slot keeps the same public host. */
export function pickSubscriptionPublicOrigin(
  origins: string[],
  slotId: string,
): string {
  const list = origins
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (list.length === 0) return defaultSubscriptionPublicOrigin();
  if (list.length === 1) return list[0]!;
  let hash = 0;
  for (let i = 0; i < slotId.length; i++) {
    hash = (hash * 31 + slotId.charCodeAt(i)) >>> 0;
  }
  return list[hash % list.length]!;
}

export async function resolveSubscriptionPublicOrigin(
  projectId: string,
  slotId: string,
): Promise<string> {
  const origins = await getSubscriptionPublicOrigins(projectId);
  return pickSubscriptionPublicOrigin(origins, slotId);
}

export function buildClientSubscriptionUrls(
  slotId: string,
  opts?: { profileTitle?: string; origin?: string | null },
): ClientSubscriptionUrls {
  const token = signSubToken(slotId);
  const origin = (opts?.origin || defaultSubscriptionPublicOrigin()).replace(
    /\/$/,
    "",
  );
  const base = `${origin}${USER_API_PREFIX}/sub/${encodeURIComponent(token)}`;
  const out = {} as ClientSubscriptionUrls;
  for (const item of SUB_CLIENT_URL_KEYS) {
    let url = `${base}/${item.format}`;
    // Path title is Shadowrocket's import-time name (last segment).
    // Do not add #hash — that locks the name and blocks REMARKS= updates.
    if (item.key === "shadowrocket" && opts?.profileTitle?.trim()) {
      url += `/${encodeURIComponent(opts.profileTitle.trim())}`;
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
  const announce = sanitizeHeaderValue(project.remark);
  const usedBytes = bytesToNumber(slot.usedTrafficBytes);
  const limitBytes = bytesToNumber(slot.dataLimitBytes);

  if (slot.status === "disabled" || slot.user.status !== "active") {
    return buildUnavailableSubscription({
      kind,
      format,
      profileName,
      message: "订阅已停用",
      expiresAt: slot.expiresAt,
      usedBytes,
      limitBytes,
      announce,
    });
  }

  if (slot.expiresAt && slot.expiresAt.getTime() < Date.now()) {
    return buildUnavailableSubscription({
      kind,
      format,
      profileName,
      message: copyVars.expire_date
        ? `订阅已过期 ${copyVars.expire_date}`
        : "订阅已过期",
      expiresAt: slot.expiresAt,
      usedBytes,
      limitBytes,
      announce,
    });
  }

  let upstreamBody: string;
  try {
    upstreamBody = await getUpstreamSubscriptionBody({
      cacheKey: slot.id,
      upstreamId: slot.upstreamId,
      subscriptionUrl: slot.subscriptionUrl,
      userAgent: input.userAgent,
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    const message = err instanceof Error ? err.message : "";
    if (status === 410 || message === "sub.expired" || message === "sub.revoked") {
      return buildUnavailableSubscription({
        kind,
        format,
        profileName,
        message:
          message === "sub.revoked" ? "订阅已失效，请重新获取" : "订阅已过期",
        expiresAt: slot.expiresAt,
        usedBytes,
        limitBytes,
        announce,
      });
    }
    throw err;
  }
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

  return finishSubscription({
    kind,
    format,
    profileName,
    nodes,
    expiresAt: slot.expiresAt,
    usedBytes,
    limitBytes,
    announce,
  });
}

function buildUnavailableSubscription(input: {
  kind: ReturnType<typeof renderKindFor>;
  format: SubClientFormat;
  profileName: string;
  message: string;
  expiresAt: Date | null;
  usedBytes: number;
  limitBytes: number;
  announce: string | null;
}): SubConvertResult {
  return finishSubscription({
    kind: input.kind,
    format: input.format,
    profileName: input.profileName,
    nodes: [placeholderNode(input.message)],
    expiresAt: input.expiresAt ?? new Date(Date.now() - 1000),
    usedBytes: input.usedBytes,
    limitBytes: input.limitBytes,
    announce: input.announce,
  });
}

function finishSubscription(input: {
  kind: ReturnType<typeof renderKindFor>;
  format: SubClientFormat;
  profileName: string;
  nodes: ProxyNode[];
  expiresAt: Date | null;
  usedBytes: number;
  limitBytes: number;
  announce: string | null;
}): SubConvertResult {
  const expireSec = input.expiresAt
    ? Math.floor(input.expiresAt.getTime() / 1000)
    : 0;
  const userinfo = buildSubscriptionUserinfo({
    uploadBytes: 0,
    downloadBytes: input.usedBytes,
    limitBytes: input.limitBytes,
    expireSec,
  });
  const statusLine =
    input.format === "shadowrocket"
      ? buildShadowrocketStatus({
          uploadBytes: 0,
          downloadBytes: input.usedBytes,
          limitBytes: input.limitBytes,
          expiresAt: input.expiresAt,
        })
      : undefined;
  const rendered = renderSubscription(input.kind, input.nodes, input.profileName, {
    userinfo,
    announce: input.announce,
    statusLine,
  });
  const profileTitleB64 = Buffer.from(input.profileName, "utf8").toString("base64");
  const headers: Record<string, string> = {
    "profile-title": `base64:${profileTitleB64}`,
    "profile-update-interval": "24",
    "content-disposition": buildContentDisposition(
      input.profileName,
      fileExtFor(input.kind),
    ),
  };
  if (input.format !== "shadowrocket") {
    headers["subscription-userinfo"] = userinfo;
  }
  if (input.announce) {
    headers["announce"] = `base64:${Buffer.from(input.announce, "utf8").toString("base64")}`;
  }
  return {
    body: rendered.body,
    contentType: rendered.contentType,
    filename: rendered.filename,
    headers,
    profileName: input.profileName,
    format: input.format,
    nodeCount: input.nodes.length,
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

function resolveUpstreamUserAgent(userAgent?: string | null): string {
  const ua = userAgent?.trim() || "";
  // Hiddify / browsers: some edges reject these UAs or return Clash YAML
  // instead of share links, which we then mis-classify as expired/empty.
  if (!ua || /mozilla|chrome|safari|curl|hiddify/i.test(ua)) {
    return "v2rayN/6.45";
  }
  return ua;
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
  if (code.includes("user_expired") || code.includes("subscription.expired")) {
    return "expired";
  }
  if (code.includes("revoked") || code.includes("subscription.not_found")) {
    return "revoked";
  }
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
      "User-Agent": resolveUpstreamUserAgent(userAgent),
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
      return ".yaml";
    case "hiddify":
      return ".txt";
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
  // filename* is the subscription title some clients read — no file extension.
  const ascii = sanitizeFilenameHeader(`${base}${ext}`);
  const encoded = encodeURIComponent(base).replace(/['()]/g, (c) =>
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
