import { Prisma } from "@prisma/client";
import type { Plan, User, UserUpstream } from "@prisma/client";
import {
  DEFAULT_GROWTH_SLOT_NAME_I18N,
  normalizeAppCopyI18n,
  pickAppCopy,
} from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { WireRawError, wireraw } from "../wireraw/client.js";
import {
  type EntitlementLedgerContext,
  recordEntitlementLedger,
  snapshotFromSlot,
} from "./entitlement-ledger.js";
import {
  buildFupView,
  fullSpeedBandwidthPlanRef,
  listFupHistoryBySlotIds,
  recordFupBandwidthChange,
  type FupHistoryItem,
  type FupView,
} from "./fup.js";
import { localizePlanCopy } from "./plan-i18n.js";
import {
  subscriptionCanRenewWithPaidPlans,
  plansCompatibleForRenew,
} from "./renew-compat.js";
import {
  buildClientSubscriptionUrls,
  buildProfileTitle,
  resolveSubscriptionPublicOrigin,
} from "./subscription-convert/index.js";
import type { ClientSubscriptionUrls } from "./subscription-convert/formats.js";

function asDisplayNameI18n(raw: unknown): Record<string, string> {
  return normalizeAppCopyI18n(raw, 120);
}

/** After slot create/sync, re-check invite-milestone auto-grant for the invitee's inviter. */
function scheduleInviteMilestoneForInvitee(userId: string) {
  setImmediate(() => {
    void import("./growth/invite-milestone.js")
      .then((m) => m.maybeAutoGrantForInvitee(userId))
      .catch((err) => {
        console.error("[invite-milestone] auto-grant failed", err);
      });
  });
}

type SourceIpHistoryItem = {
  ip: string;
  observed_at?: string | null;
};

type WireRawCustomerView = {
  end_user?: {
    id?: string;
    username?: string;
    expires_at?: string;
    service_expires_at?: string;
    status?: string;
    used_traffic_bytes?: number | string;
    data_limit_bytes?: number | string;
    online_ip_limit?: number | string;
    next_plan_ref?: string;
    current_bandwidth_plan_ref?: string | null;
    next_bandwidth_plan_ref?: string | null;
    online_at?: string | null;
    online_since?: string | null;
    /** Current continuous online seconds (if upstream provides). */
    online_seconds?: number | string | null;
    note?: string | null;
    reset_policy?: string | null;
    custom_reset_interval?: string | null;
    /** If upstream ever exposes an absolute next-reset timestamp */
    next_reset_at?: string | null;
    traffic_reset_at?: string | null;
    current_node?: {
      id?: string;
      name?: string;
      region?: string;
    } | null;
    /** Deduped connection source IPs (max ~8). */
    source_ips?: string[] | null;
    source_ip_history?: unknown;
    last_source_ip?: string | null;
    recent_source_ip?: string | null;
  };
  /** Some responses also expose traffic at top level */
  used_traffic_bytes?: number | string;
  data_limit_bytes?: number | string;
  online_device_count?: number | string;
  subscription_online_devices?: number | string;
  subscription_url?: string;
  subscription?: {
    subscription_url?: string;
    url?: string;
    revoked_at?: string | null;
    last_fetch_agent?: string | null;
    available_formats?: string[];
  };
  bandwidth_policy?: {
    source?: string;
    up_mbps?: number | string;
    down_mbps?: number | string;
    editable?: boolean;
  } | null;
  /** protocol -> inbound tags, e.g. hysteria2 / vless */
  inbounds?: Record<string, string[]>;
  credentials?: Array<{
    id?: string;
    protocol?: string;
    allowed_inbound_tags?: string[];
  }>;
  next_reset_at?: string | null;
  traffic_reset_at?: string | null;
};

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function normalizeCustomerView(raw: unknown): WireRawCustomerView {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  // unwrap common envelopes
  const nested =
    (o.customer && typeof o.customer === "object" ? o.customer : null) ||
    (o.data && typeof o.data === "object" ? o.data : null) ||
    o;
  return nested as WireRawCustomerView;
}

export type SubscriptionView = {
  id: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_name_i18n?: Record<string, string>;
  status: string;
  expires_at: string | null;
  service_expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  /** Traffic cycle reset from plan (or upstream); `no_reset` = never clears mid-term. */
  reset_policy: string;
  custom_reset_interval: string | null;
  /** Next traffic wipe time (upstream if present, else estimated from slot.createdAt). */
  next_reset_at: string | null;
  subscription_url: string | null;
  /** Public convert URLs under /api/v1/sub/:token/:format (project-branded). */
  client_urls: ClientSubscriptionUrls | null;
  online_ip_limit: number | null;
  online_device_count: number | null;
  subscription_online_devices: number | null;
  online_at: string | null;
  online_since: string | null;
  next_plan_ref: string | null;
  current_bandwidth_plan_ref: string | null;
  next_bandwidth_plan_ref: string | null;
  bandwidth_policy: {
    source?: string;
    up_mbps: number | null;
    down_mbps: number | null;
    editable?: boolean;
  } | null;
  current_node: {
    id?: string;
    name?: string;
    region?: string;
  } | null;
  /** Deduped source IPs from upstream (live only). */
  source_ips: string[];
  source_ip_history: SourceIpHistoryItem[];
  last_source_ip: string | null;
  /** Continuous online seconds from upstream, or derived from online_since. */
  online_seconds: number | null;
  /** protocol -> inbound tags (live only). */
  inbounds: Record<string, string[]> | null;
  /** Uppercased protocol list for admin display. */
  protocols: string[];
  revoked_at: string | null;
  last_fetch_agent: string | null;
  available_formats: string[];
  note: string | null;
  last_synced_at: string | null;
  upstream_id: string | null;
  upstream_username: string;
  fup: FupView | null;
  fup_history: FupHistoryItem[];
  /** True when at least one paid catalog SKU can extend this slot. */
  can_renew: boolean;
  /** Plan spec for checkout renew matching; null for campaign slots. */
  renew_spec: {
    data_limit_bytes: number | null;
    device_slots: number;
    reset_policy: string;
    custom_reset_interval: string | null;
    upstream_plan_ref: string | null;
    fup_tiers: unknown;
  } | null;
};

function upstreamUsernameFor(userId: string, slotKey: string, email?: string | null) {
  const base = (email || userId)
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 16);
  const suffix = slotKey.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase();
  return `hb_${base}_${suffix}`.toLowerCase().slice(0, 48);
}

function pickSubscriptionUrl(view: WireRawCustomerView, fallback?: string | null) {
  return (
    view.subscription_url ||
    view.subscription?.subscription_url ||
    view.subscription?.url ||
    fallback ||
    null
  );
}

function toBigIntOrNull(v: unknown): bigint | null {
  const n = toNum(v);
  if (n == null) return null;
  return BigInt(Math.trunc(n));
}

function parseCachedNode(
  raw: unknown,
): { id?: string; name?: string; region?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : undefined;
  const name = typeof o.name === "string" ? o.name : undefined;
  const region = typeof o.region === "string" ? o.region : undefined;
  if (!id && !name && !region) return null;
  return { id, name, region };
}

function pickStringField(
  o: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normalizeSourceIpHistory(raw: unknown): SourceIpHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceIpHistoryItem[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ ip: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ip = pickStringField(o, [
      "ip",
      "source_ip",
      "sourceIp",
      "来源 IP",
      "来源IP",
    ]);
    if (!ip) continue;
    out.push({
      ip,
      observed_at: pickStringField(o, [
        "observed_at",
        "observedAt",
        "OBSERVEDAT",
        "observed_at_utc",
      ]),
    });
  }
  return out;
}

function normalizeSourceIpFields(end?: WireRawCustomerView["end_user"]): {
  source_ips: string[];
  source_ip_history: SourceIpHistoryItem[];
  last_source_ip: string | null;
} {
  const history = normalizeSourceIpHistory(end?.source_ip_history);
  const fromList = Array.isArray(end?.source_ips)
    ? end.source_ips
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .map((x) => x.trim())
    : [];
  const source_ips = fromList.length ? fromList : history.map((h) => h.ip);
  const last_source_ip =
    (typeof end?.last_source_ip === "string" && end.last_source_ip.trim()) ||
    (typeof end?.recent_source_ip === "string" &&
      end.recent_source_ip.trim()) ||
    source_ips[0] ||
    null;
  return {
    source_ips,
    source_ip_history: history.length
      ? history
      : source_ips.map((ip) => ({ ip })),
    last_source_ip,
  };
}

function normalizeInbounds(
  view?: WireRawCustomerView | null,
): Record<string, string[]> | null {
  const raw = view?.inbounds;
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string[]> = {};
  for (const [proto, tags] of Object.entries(raw)) {
    if (!proto) continue;
    out[proto] = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === "string")
      : [];
  }
  return Object.keys(out).length ? out : null;
}

function normalizeProtocols(view?: WireRawCustomerView | null): string[] {
  const inbounds = normalizeInbounds(view);
  if (inbounds) {
    return Object.keys(inbounds).map((p) => p.toUpperCase());
  }
  const creds = view?.credentials;
  if (!Array.isArray(creds)) return [];
  const set = new Set<string>();
  for (const c of creds) {
    const p = typeof c?.protocol === "string" ? c.protocol.trim() : "";
    if (p) set.add(p.toUpperCase());
  }
  return [...set];
}

function resolveOnlineSeconds(
  end?: WireRawCustomerView["end_user"],
): number | null {
  const direct = toNum(end?.online_seconds);
  if (direct != null && direct >= 0) return Math.trunc(direct);
  if (!end?.online_since) return null;
  const t = Date.parse(end.online_since);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

type LiveSnapshotPrevious = {
  usedTrafficBytes?: bigint | null;
  dataLimitBytes?: bigint | null;
  onlineIpLimit?: number | null;
  onlineDeviceCount?: number | null;
  subscriptionOnlineDevices?: number | null;
  onlineAt?: Date | null;
  onlineSince?: Date | null;
  serviceExpiresAt?: Date | null;
  currentNode?: Prisma.JsonValue | null;
};

function previousLiveSnapshot(slot: {
  usedTrafficBytes?: bigint | null;
  dataLimitBytes?: bigint | null;
  onlineIpLimit?: number | null;
  onlineDeviceCount?: number | null;
  subscriptionOnlineDevices?: number | null;
  onlineAt?: Date | null;
  onlineSince?: Date | null;
  serviceExpiresAt?: Date | null;
  currentNode?: Prisma.JsonValue | null;
}): LiveSnapshotPrevious {
  return {
    usedTrafficBytes: slot.usedTrafficBytes ?? null,
    dataLimitBytes: slot.dataLimitBytes ?? null,
    onlineIpLimit: slot.onlineIpLimit ?? null,
    onlineDeviceCount: slot.onlineDeviceCount ?? null,
    subscriptionOnlineDevices: slot.subscriptionOnlineDevices ?? null,
    onlineAt: slot.onlineAt ?? null,
    onlineSince: slot.onlineSince ?? null,
    serviceExpiresAt: slot.serviceExpiresAt ?? null,
    currentNode: slot.currentNode ?? null,
  };
}

/** Persist WireRaw live fields onto UserUpstream for stale-while-revalidate lists. */
function liveSnapshotFields(
  view: WireRawCustomerView,
  opts?: {
    fallbackUrl?: string | null;
    fallbackExpiresAt?: Date | null;
    fallbackUpstreamId?: string | null;
    /** Keep prior cache when upstream response omits a field (e.g. upsert). */
    previous?: LiveSnapshotPrevious;
    /** When true, missing online/node fields clear the cache (getCustomer sync). */
    clearMissing?: boolean;
  },
) {
  const prev = opts?.previous;
  const clear = opts?.clearMissing === true;
  const used =
    toNum(view.end_user?.used_traffic_bytes) ?? toNum(view.used_traffic_bytes);
  const limit =
    toNum(view.end_user?.data_limit_bytes) ?? toNum(view.data_limit_bytes);
  const node = view.end_user?.current_node;
  const subscriptionUrl =
    pickSubscriptionUrl(view, opts?.fallbackUrl) || opts?.fallbackUrl || null;

  const onlineIp = toNum(view.end_user?.online_ip_limit);
  const onlineDevices = toNum(view.online_device_count);
  const subOnline = toNum(view.subscription_online_devices);

  return {
    upstreamId: view.end_user?.id || opts?.fallbackUpstreamId || null,
    subscriptionUrl,
    expiresAt: view.end_user?.expires_at
      ? new Date(view.end_user.expires_at)
      : (opts?.fallbackExpiresAt ?? null),
    usedTrafficBytes:
      toBigIntOrNull(used) ?? (clear ? null : (prev?.usedTrafficBytes ?? null)),
    dataLimitBytes:
      toBigIntOrNull(limit) ?? (clear ? null : (prev?.dataLimitBytes ?? null)),
    onlineIpLimit: onlineIp ?? (clear ? null : (prev?.onlineIpLimit ?? null)),
    onlineDeviceCount:
      onlineDevices ?? (clear ? null : (prev?.onlineDeviceCount ?? null)),
    subscriptionOnlineDevices:
      subOnline ?? (clear ? null : (prev?.subscriptionOnlineDevices ?? null)),
    onlineAt: view.end_user?.online_at
      ? new Date(view.end_user.online_at)
      : clear
        ? null
        : (prev?.onlineAt ?? null),
    onlineSince: view.end_user?.online_since
      ? new Date(view.end_user.online_since)
      : clear
        ? null
        : (prev?.onlineSince ?? null),
    serviceExpiresAt: view.end_user?.service_expires_at
      ? new Date(view.end_user.service_expires_at)
      : clear
        ? null
        : (prev?.serviceExpiresAt ?? null),
    currentNode: node
      ? ({
          id: node.id ?? null,
          name: node.name ?? null,
          region: node.region ?? null,
        } as Prisma.InputJsonValue)
      : clear
        ? Prisma.DbNull
        : prev?.currentNode != null
          ? (prev.currentNode as Prisma.InputJsonValue)
          : Prisma.DbNull,
    lastSyncedAt: new Date(),
  };
}

/** Add calendar months in UTC; clamps day for short months (Jan 31 + 1m → Feb 28/29). */
export function addCalendarMonths(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const day = from.getUTCDate();
  const h = from.getUTCHours();
  const min = from.getUTCMinutes();
  const sec = from.getUTCSeconds();
  const ms = from.getUTCMilliseconds();
  const lastDay = new Date(
    Date.UTC(y, m + months + 1, 0, 12, 0, 0, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(y, m + months, Math.min(day, lastDay), h, min, sec, ms),
  );
}

/** Parse Go-style duration (`720h`, `24h30m`) to milliseconds. */
export function parseGoDurationMs(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h)/gi;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    const u = m[2].toLowerCase();
    const mult =
      u === "h"
        ? 3_600_000
        : u === "m"
          ? 60_000
          : u === "s"
            ? 1_000
            : u === "ms"
              ? 1
              : u === "us" || u === "µs" || u === "μs"
                ? 0.001
                : u === "ns"
                  ? 0.000001
                  : 0;
    if (mult <= 0 && u !== "ms") return null;
    total += n * mult;
  }
  return matched && total > 0 ? Math.round(total) : null;
}

/**
 * Estimate the next traffic-reset instant from slot creation + plan policy.
 * Aligns with WireRaw: day/week rolling from anchor; month/year calendar from anchor;
 * custom uses Go duration intervals.
 */
export function estimateNextTrafficResetAt(input: {
  resetPolicy: string | null | undefined;
  customResetInterval?: string | null;
  anchor: Date;
  now?: Date;
}): Date | null {
  const policy = (input.resetPolicy || "no_reset").trim();
  if (!policy || policy === "no_reset") return null;
  const now = input.now ?? new Date();
  const anchor = input.anchor;
  if (!(anchor instanceof Date) || Number.isNaN(anchor.getTime())) return null;

  if (policy === "custom") {
    const ms = parseGoDurationMs(input.customResetInterval);
    if (!ms) return null;
    const t0 = anchor.getTime();
    if (t0 > now.getTime()) return new Date(t0);
    const cycles = Math.floor((now.getTime() - t0) / ms) + 1;
    return new Date(t0 + cycles * ms);
  }

  if (policy === "day" || policy === "week") {
    const step = policy === "week" ? 7 * 86_400_000 : 86_400_000;
    let t = anchor.getTime();
    if (t > now.getTime()) return new Date(t);
    const cycles = Math.floor((now.getTime() - t) / step) + 1;
    return new Date(t + cycles * step);
  }

  if (policy === "month" || policy === "year") {
    const stepMonths = policy === "year" ? 12 : 1;
    let i = 1;
    let d = addCalendarMonths(anchor, i * stepMonths);
    while (d.getTime() <= now.getTime() && i < 2400) {
      i += 1;
      d = addCalendarMonths(anchor, i * stepMonths);
    }
    return d.getTime() > now.getTime() ? d : null;
  }

  return null;
}

function pickIsoDate(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c || typeof c !== "string") continue;
    const t = Date.parse(c);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

function resolveProvisionBase(baseExpiresAt?: Date | null): Date {
  const now = new Date();
  if (baseExpiresAt && baseExpiresAt.getTime() > now.getTime()) {
    return baseExpiresAt;
  }
  return now;
}

/** Resolve absolute expire_at string that buildPlanBody / preview will apply. */
export function resolveExpireAtIso(
  plan: Plan | null,
  input: {
    upstreamPlanRef?: string;
    validitySeconds?: number;
    expireAt?: string;
    keepExpiresAt?: boolean;
  },
  opts?: { baseExpiresAt?: Date | null },
): string | null {
  if (input.keepExpiresAt) {
    if (input.expireAt) return new Date(input.expireAt).toISOString();
    if (opts?.baseExpiresAt) return opts.baseExpiresAt.toISOString();
    return null;
  }
  if (input.expireAt) return new Date(input.expireAt).toISOString();
  // 0 = lifetime (WireRaw validity_seconds unlimited); no absolute expire_at
  if (input.validitySeconds === 0) return null;
  if (input.validitySeconds) {
    const base = resolveProvisionBase(opts?.baseExpiresAt);
    return new Date(base.getTime() + input.validitySeconds * 1000).toISOString();
  }
  if (plan?.validityCalendarMonths != null && plan.validityCalendarMonths > 0) {
    return addCalendarMonths(
      resolveProvisionBase(opts?.baseExpiresAt),
      plan.validityCalendarMonths,
    ).toISOString();
  }
  if (plan?.validitySeconds === 0) return null;
  if (plan?.validitySeconds != null && plan.validitySeconds > 0) {
    const base = resolveProvisionBase(opts?.baseExpiresAt);
    return new Date(base.getTime() + plan.validitySeconds * 1000).toISOString();
  }
  // next_plan_ref path: expiry decided upstream — unknown locally
  if (plan?.upstreamPlanRef || input.upstreamPlanRef) return null;
  // fallback 1 day (same as buildPlanBody)
  return new Date(Date.now() + 86400 * 1000).toISOString();
}

function buildPlanBody(
  plan: Plan | null,
  input: {
    upstreamPlanRef?: string;
    validitySeconds?: number;
    expireAt?: string;
    dataLimitBytes?: number;
    resetPolicy?: string | null;
    customResetInterval?: string | null;
    keepExpiresAt?: boolean;
  },
  opts?: {
    /** For renew: extend from current expiry if still in the future */
    baseExpiresAt?: Date | null;
    /** Bind FUP full-speed bandwidth plan (create / plan-change only). */
    bindFullSpeedBandwidth?: boolean;
  },
) {
  const body: Record<string, unknown> = {};
  // Duration priority:
  // 1) keepExpiresAt / explicit expireAt / validitySeconds (>0 expire_at, 0 = lifetime)
  // 2) local plan calendar months / fixed seconds (both stack on renew via expire_at)
  // 3) upstream next_plan_ref
  // 4) fallback 1 day
  // Local validity always wins over upstreamPlanRef so Admin「开通时长」不会被映射套餐吞掉。
  const expireAt = resolveExpireAtIso(plan, input, opts);
  if (input.keepExpiresAt) {
    if (expireAt) body.expire_at = expireAt;
    else if (plan?.upstreamPlanRef) body.next_plan_ref = plan.upstreamPlanRef;
    else if (input.upstreamPlanRef) body.next_plan_ref = input.upstreamPlanRef;
  } else if (input.expireAt) {
    body.expire_at = expireAt;
  } else if (input.validitySeconds != null && input.validitySeconds > 0) {
    body.expire_at = expireAt;
  } else if (input.validitySeconds === 0) {
    body.validity_seconds = 0;
  } else if (
    plan?.validityCalendarMonths != null &&
    plan.validityCalendarMonths > 0
  ) {
    body.expire_at = expireAt;
  } else if (plan?.validitySeconds != null && plan.validitySeconds > 0) {
    body.expire_at = expireAt;
  } else if (plan?.validitySeconds === 0) {
    body.validity_seconds = 0;
  } else if (plan?.upstreamPlanRef) {
    body.next_plan_ref = plan.upstreamPlanRef;
  } else if (input.upstreamPlanRef) {
    body.next_plan_ref = input.upstreamPlanRef;
  } else {
    body.validity_seconds = 86400;
  }

  if (input.dataLimitBytes != null) {
    body.data_limit_bytes = input.dataLimitBytes;
  } else if (plan?.dataLimitBytes != null) {
    body.data_limit_bytes = Number(plan.dataLimitBytes);
  }

  const resetPolicy = input.resetPolicy ?? plan?.resetPolicy ?? null;
  if (resetPolicy === "custom") {
    const interval =
      input.customResetInterval !== undefined
        ? input.customResetInterval
        : plan?.customResetInterval ?? null;
    if (interval) {
      body.reset_policy = "custom";
      body.custom_reset_interval = interval;
    } else {
      // Misconfigured plan: avoid sending invalid custom without interval
      body.reset_policy = "no_reset";
    }
  } else if (resetPolicy && resetPolicy !== "no_reset") {
    body.reset_policy = resetPolicy;
  } else if (resetPolicy === "no_reset") {
    body.reset_policy = "no_reset";
  }

  // Concurrent device limit (WireRaw online_ip_limit)
  if (plan?.deviceSlots != null && plan.deviceSlots > 0) {
    body.online_ip_limit = plan.deviceSlots;
  }

  if (opts?.bindFullSpeedBandwidth !== false) {
    const bw = fullSpeedBandwidthPlanRef(plan?.fupTiers);
    if (bw) body.current_bandwidth_plan_ref = bw;
  }

  return body;
}

function toSubscriptionView(
  slot: UserUpstream & {
    plan?: Plan | null;
    user?: {
      projectId?: string;
      project?: { name: string; code: string } | null;
    } | null;
  },
  live?: WireRawCustomerView | null,
  locale?: string | null,
  origin?: string | null,
): SubscriptionView {
  const view = live ? normalizeCustomerView(live) : null;
  const end = view?.end_user;
  const url = view ? pickSubscriptionUrl(view, slot.subscriptionUrl) : slot.subscriptionUrl;
  const expiresAt = end?.expires_at || slot.expiresAt?.toISOString() || null;
  const status =
    slot.status === "disabled" || end?.status === "disabled"
      ? "disabled"
      : expiresAt && new Date(expiresAt) < new Date()
        ? "expired"
        : url
          ? "active"
          : "none";

  const used =
    toNum(end?.used_traffic_bytes) ??
    toNum(view?.used_traffic_bytes) ??
    toNum(slot.usedTrafficBytes);
  const limit =
    toNum(end?.data_limit_bytes) ??
    toNum(view?.data_limit_bytes) ??
    toNum(slot.dataLimitBytes);

  const planCopy = slot.plan ? localizePlanCopy(slot.plan, locale) : null;
  const slotLabelI18n = asDisplayNameI18n(slot.displayNameI18n);
  const growthLabel = !slot.planId
    ? pickAppCopy(
        Object.keys(slotLabelI18n).length
          ? slotLabelI18n
          : DEFAULT_GROWTH_SLOT_NAME_I18N,
        locale,
      )
    : null;
  const planNameI18n =
    (planCopy?.name_i18n as Record<string, string> | undefined) ||
    (Object.keys(slotLabelI18n).length
      ? slotLabelI18n
      : !slot.planId
        ? { ...DEFAULT_GROWTH_SLOT_NAME_I18N }
        : undefined);
  const planName =
    planCopy?.name ||
    slot.plan?.name ||
    growthLabel?.text ||
    null;
  const siteName =
    slot.user?.project?.name || slot.user?.project?.code || null;

  const bw = view?.bandwidth_policy;
  const cachedNode = parseCachedNode(slot.currentNode);
  const sourceIp = normalizeSourceIpFields(end);
  const inbounds = normalizeInbounds(view);
  const protocols = normalizeProtocols(view);
  const onlineSeconds = resolveOnlineSeconds(end);
  const resetPolicy =
    (typeof end?.reset_policy === "string" && end.reset_policy.trim()
      ? end.reset_policy.trim()
      : null) ||
    slot.plan?.resetPolicy ||
    "no_reset";
  const customResetInterval =
    (typeof end?.custom_reset_interval === "string" &&
    end.custom_reset_interval.trim()
      ? end.custom_reset_interval.trim()
      : null) ||
    slot.plan?.customResetInterval ||
    null;
  const nextResetAt =
    pickIsoDate(
      end?.next_reset_at,
      end?.traffic_reset_at,
      view?.next_reset_at,
      view?.traffic_reset_at,
    ) ||
    estimateNextTrafficResetAt({
      resetPolicy,
      customResetInterval,
      anchor: slot.createdAt,
    })?.toISOString() ||
    null;

  return {
    id: slot.id,
    plan_id: slot.planId,
    plan_code: slot.plan?.code || null,
    plan_name: planName,
    plan_name_i18n: planNameI18n,
    status,
    expires_at: expiresAt,
    service_expires_at:
      end?.service_expires_at || slot.serviceExpiresAt?.toISOString() || null,
    used_traffic_bytes: used,
    data_limit_bytes: limit,
    reset_policy: resetPolicy,
    custom_reset_interval: customResetInterval,
    next_reset_at: nextResetAt,
    subscription_url: url,
    client_urls: url
      ? buildClientSubscriptionUrls(slot.id, {
          profileTitle: buildProfileTitle(siteName, planName),
          origin,
        })
      : null,
    online_ip_limit:
      toNum(end?.online_ip_limit) ?? toNum(slot.onlineIpLimit),
    online_device_count:
      toNum(view?.online_device_count) ?? toNum(slot.onlineDeviceCount),
    subscription_online_devices:
      toNum(view?.subscription_online_devices) ??
      toNum(slot.subscriptionOnlineDevices),
    online_at: end?.online_at || slot.onlineAt?.toISOString() || null,
    online_since: end?.online_since || slot.onlineSince?.toISOString() || null,
    next_plan_ref: end?.next_plan_ref || slot.plan?.upstreamPlanRef || null,
    current_bandwidth_plan_ref: end?.current_bandwidth_plan_ref || null,
    next_bandwidth_plan_ref: end?.next_bandwidth_plan_ref || null,
    bandwidth_policy: bw
      ? {
          source: bw.source,
          up_mbps: toNum(bw.up_mbps),
          down_mbps: toNum(bw.down_mbps),
          editable: bw.editable,
        }
      : null,
    current_node: end?.current_node
      ? {
          id: end.current_node.id,
          name: end.current_node.name,
          region: end.current_node.region,
        }
      : cachedNode,
    source_ips: sourceIp.source_ips,
    source_ip_history: sourceIp.source_ip_history,
    last_source_ip: sourceIp.last_source_ip,
    online_seconds: onlineSeconds,
    inbounds,
    protocols,
    revoked_at: view?.subscription?.revoked_at || null,
    last_fetch_agent: view?.subscription?.last_fetch_agent || null,
    available_formats: Array.isArray(view?.subscription?.available_formats)
      ? view!.subscription!.available_formats!
      : [],
    note: end?.note || null,
    last_synced_at: slot.lastSyncedAt?.toISOString() || null,
    upstream_id: end?.id || slot.upstreamId,
    upstream_username: slot.upstreamUsername,
    fup: buildFupView({
      fupTiers: slot.plan?.fupTiers,
      usedBytes: used,
      currentRef: end?.current_bandwidth_plan_ref || null,
      nextResetAt,
    }),
    fup_history: [],
    can_renew: false,
    renew_spec: slot.plan
      ? {
          data_limit_bytes:
            slot.plan.dataLimitBytes == null
              ? null
              : Number(slot.plan.dataLimitBytes),
          device_slots: slot.plan.deviceSlots,
          reset_policy: slot.plan.resetPolicy,
          custom_reset_interval: slot.plan.customResetInterval,
          upstream_plan_ref: slot.plan.upstreamPlanRef,
          fup_tiers: slot.plan.fupTiers,
        }
      : null,
  };
}

async function toSubscriptionViewAsync(
  slot: UserUpstream & {
    plan?: Plan | null;
    user?: {
      projectId?: string;
      project?: { name: string; code: string } | null;
    } | null;
  },
  live?: WireRawCustomerView | null,
  locale?: string | null,
  projectId?: string | null,
): Promise<SubscriptionView> {
  const pid = projectId || slot.user?.projectId || null;
  const origin = pid
    ? await resolveSubscriptionPublicOrigin(pid, slot.id)
    : undefined;
  return toSubscriptionView(slot, live, locale, origin);
}

export async function findLegacyRenewSlot(userId: string, planId: string) {
  const slots = await prisma.userUpstream.findMany({
    where: { userId, planId, status: { not: "disabled" } },
  });
  if (!slots.length) return null;
  const now = Date.now();
  const unexpired = slots.filter(
    (s) => s.expiresAt && s.expiresAt.getTime() > now,
  );
  const pool = unexpired.length ? unexpired : slots;
  pool.sort(
    (a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0),
  );
  return pool[0] ?? null;
}

export async function assertSlotRenewableWithPlan(input: {
  userId: string;
  slotId: string;
  plan: Plan;
}) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: input.slotId, userId: input.userId },
    include: { plan: true },
  });
  if (!slot) {
    throw Object.assign(new Error("subscription.not_found"), { statusCode: 404 });
  }
  if (slot.status === "disabled") {
    throw Object.assign(new Error("subscription.renew_disabled"), { statusCode: 400 });
  }
  if (slot.plan && !plansCompatibleForRenew(slot.plan, input.plan)) {
    throw Object.assign(new Error("subscription.renew_incompatible"), {
      statusCode: 400,
    });
  }
  return slot;
}

async function attachCanRenew(
  userId: string,
  views: SubscriptionView[],
  slots: Array<{
    id: string;
    status: string;
    planId: string | null;
    plan: Plan | null;
  }>,
) {
  if (!views.length) return views;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { projectId: true },
  });
  if (!user) return views;
  const paidPlans = await prisma.plan.findMany({
    where: {
      projectId: user.projectId,
      enabled: true,
      isFreeClaimable: false,
    },
  });
  const byId = new Map(slots.map((s) => [s.id, s]));
  return views.map((view) => {
    const slot = byId.get(view.id);
    return {
      ...view,
      can_renew: slot
        ? subscriptionCanRenewWithPaidPlans(
            {
              status: view.status === "disabled" ? "disabled" : slot.status,
              planId: slot.planId,
              plan: slot.plan,
            },
            paidPlans,
          )
        : false,
    };
  });
}

/**
 * Create a NEW upstream customer slot for this user (new package).
 * Uses a unique WireRaw username; subscription URL is stored and kept stable on later updates.
 */
export async function createUpstreamSlot(input: {
  userId: string;
  planId?: string;
  /** Stable idempotency key for paid-order provisioning. */
  slotId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  dataLimitBytes?: number;
  locale?: string | null;
  note?: string;
  /** Localized label when creating a plan-less growth slot. */
  displayNameI18n?: Record<string, string> | null;
  /** If true and a slot for this plan already exists, renew/extend it instead of 409. */
  allowRenew?: boolean;
  /** Paid checkout "new slot": create even if the same plan is already owned. */
  skipPlanOwnedCheck?: boolean;
  /** When set, append entitlement ledger after successful create/renew. */
  ledger?: EntitlementLedgerContext;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  if (user.status !== "active") {
    throw Object.assign(new Error("user.disabled"), { statusCode: 403 });
  }

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : null;

  if (input.planId && plan && !input.skipPlanOwnedCheck) {
    const existing = await prisma.userUpstream.findFirst({
      where: { userId: user.id, planId: plan.id },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (input.allowRenew) {
        const target =
          (await findLegacyRenewSlot(user.id, plan.id)) || existing;
        const renewed = await updateUpstreamSlot({
          userId: input.userId,
          slotId: target.id,
          planId: plan.id,
          upstreamPlanRef: input.upstreamPlanRef,
          validitySeconds: input.validitySeconds,
          expireAt: input.expireAt,
          dataLimitBytes: input.dataLimitBytes,
          note: input.note,
          ledger: input.ledger,
        });
        scheduleInviteMilestoneForInvitee(input.userId);
        return renewed;
      }
      throw Object.assign(new Error("subscription.plan_already_owned"), {
        statusCode: 409,
      });
    }
  }

  // Pre-create local id so username is stable even before upstream returns
  const slotId =
    input.slotId ||
    `uus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const username = upstreamUsernameFor(user.id, slotId, user.email);

  const body: Record<string, unknown> = {
    username,
    email: user.email || undefined,
    note: input.note || `habibi_user:${user.id};slot:${slotId}`,
    status: "active",
    ...buildPlanBody(plan, input),
  };

  const created = normalizeCustomerView(
    await wireraw.upsertCustomer(body),
  );
  const snap = liveSnapshotFields(created);

  const displayNameI18n = !plan
    ? asDisplayNameI18n(
        input.displayNameI18n && Object.keys(input.displayNameI18n).length
          ? input.displayNameI18n
          : DEFAULT_GROWTH_SLOT_NAME_I18N,
      )
    : undefined;

  const slot = await prisma.userUpstream.create({
    data: {
      id: slotId,
      userId: user.id,
      planId: plan?.id ?? null,
      upstreamUsername: username,
      status: "active",
      ...snap,
      ...(displayNameI18n
        ? {
            displayNameI18n:
              displayNameI18n as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
    include: { plan: true },
  });

  if (input.ledger) {
    await recordEntitlementLedger({
      projectId: user.projectId,
      userId: user.id,
      slotId: slot.id,
      before: null,
      after: snapshotFromSlot(slot),
      ledger: {
        ...input.ledger,
        remark: input.ledger.remark ?? input.note,
      },
    });
  }

  const provisionBw = fullSpeedBandwidthPlanRef(plan?.fupTiers);
  if (provisionBw) {
    await recordFupBandwidthChange({
      slotId: slot.id,
      fromRef: null,
      toRef: provisionBw,
      usedTrafficBytes: toNum(created.end_user?.used_traffic_bytes) ?? 0,
      afterBytes: 0,
      reason: "provision",
    });
  }

  const createdView = {
    user,
    slot,
    subscription: await toSubscriptionViewAsync(
      slot,
      created,
      input.locale,
      user.projectId,
    ),
  };
  scheduleInviteMilestoneForInvitee(input.userId);
  return createdView;
}

/**
 * Renew / change plan on an EXISTING slot.
 * Always upserts WireRaw with the same end_user.id — never revoke/refresh — so subscription_url stays.
 */
export type SlotChangeOptions = {
  /** Keep current absolute expiry (ignore new plan duration / validity_seconds). */
  keepExpiresAt?: boolean;
  /**
   * Keep current used traffic (default true).
   * When false, attempt to zero used_traffic_bytes upstream (may be unsupported).
   */
  keepUsedTraffic?: boolean;
};

export async function updateUpstreamSlot(input: {
  userId: string;
  slotId: string;
  planId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  dataLimitBytes?: number;
  note?: string;
  locale?: string | null;
  /** Upstream + local slot status; default active */
  status?: "active" | "disabled";
  /** When set, append entitlement ledger after successful update. */
  ledger?: EntitlementLedgerContext;
} & SlotChangeOptions) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: input.slotId, userId: input.userId },
    include: { plan: true, user: true },
  });
  if (!slot) throw Object.assign(new Error("subscription.not_found"), { statusCode: 404 });
  if (!slot.upstreamId) {
    throw Object.assign(new Error("subscription.upstream_missing"), { statusCode: 400 });
  }

  const before = snapshotFromSlot(slot);
  const keepExpiresAt = Boolean(input.keepExpiresAt);
  const keepUsedTraffic = input.keepUsedTraffic !== false;

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : slot.plan;


  const status = input.status || "active";
  const planInput = {
    ...input,
    keepExpiresAt,
    expireAt: keepExpiresAt
      ? (slot.expiresAt?.toISOString() ?? input.expireAt)
      : input.expireAt,
    // keepExpiresAt wins over relative extend
    validitySeconds: keepExpiresAt ? undefined : input.validitySeconds,
  };
  const body: Record<string, unknown> = {
    id: slot.upstreamId,
    username: slot.upstreamUsername,
    email: slot.user.email || undefined,
    note: input.note || `habibi_user:${input.userId};slot:${slot.id}`,
    status,
    ...buildPlanBody(plan, planInput, {
      baseExpiresAt: slot.expiresAt,
      bindFullSpeedBandwidth: Boolean(
        input.planId && input.planId !== slot.planId,
      ),
    }),
  };
  if (!keepUsedTraffic) {
    body.used_traffic_bytes = 0;
  }

  let updated: WireRawCustomerView;
  try {
    updated = normalizeCustomerView(await wireraw.upsertCustomer(body));
  } catch (err) {
    if (!keepUsedTraffic && err instanceof WireRawError) {
      throw Object.assign(
        new Error(
          "upstream.used_traffic_reset_unsupported: 上游不支持清零已用流量，请勾选「已用流量不变」后重试",
        ),
        { statusCode: 400, cause: err },
      );
    }
    throw err;
  }
  const resolvedExpire =
    resolveExpireAtIso(plan, planInput, { baseExpiresAt: slot.expiresAt }) ||
    input.expireAt ||
    undefined;
  const snap = liveSnapshotFields(updated, {
    fallbackUrl: slot.subscriptionUrl,
    fallbackExpiresAt: resolvedExpire
      ? new Date(resolvedExpire)
      : slot.expiresAt,
    fallbackUpstreamId: slot.upstreamId,
    previous: previousLiveSnapshot(slot),
  });

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: {
      planId: plan?.id ?? slot.planId,
      status,
      ...snap,
    },
    include: { plan: true },
  });

  if (input.ledger) {
    await recordEntitlementLedger({
      projectId: slot.user.projectId,
      userId: input.userId,
      slotId: saved.id,
      before,
      after: snapshotFromSlot(saved),
      ledger: {
        ...input.ledger,
        remark: input.ledger.remark ?? input.note,
      },
    });
  }

  return {
    slot: saved,
    subscription: await toSubscriptionViewAsync(
      saved,
      updated,
      input.locale,
      slot.user.projectId,
    ),
    previous_subscription_url: slot.subscriptionUrl,
  };
}

export type SlotChangePreviewSide = {
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  expires_at: string | null;
  used_traffic_bytes: string | null;
  data_limit_bytes: string | null;
  online_ip_limit: number | null;
  reset_policy: string | null;
  custom_reset_interval: string | null;
  status: string;
};

/** Dry-run of updateUpstreamSlot for admin preview UI (no WireRaw write). */
export async function previewUpstreamSlotUpdate(input: {
  userId: string;
  slotId: string;
  planId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  note?: string;
  keepExpiresAt?: boolean;
  keepUsedTraffic?: boolean;
}) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: input.slotId, userId: input.userId },
    include: { plan: true },
  });
  if (!slot) {
    throw Object.assign(new Error("subscription.not_found"), { statusCode: 404 });
  }

  const keepExpiresAt = Boolean(input.keepExpiresAt);
  const keepUsedTraffic = input.keepUsedTraffic !== false;

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : slot.plan;


  if (
    !input.planId &&
    !input.upstreamPlanRef &&
    !input.validitySeconds &&
    !input.expireAt &&
    !keepExpiresAt
  ) {
    throw Object.assign(new Error("provision.empty_change"), { statusCode: 400 });
  }

  const planInput = {
    ...input,
    keepExpiresAt,
    expireAt: keepExpiresAt
      ? (slot.expiresAt?.toISOString() ?? input.expireAt)
      : input.expireAt,
    validitySeconds: keepExpiresAt ? undefined : input.validitySeconds,
  };

  const afterExpire = resolveExpireAtIso(plan, planInput, {
    baseExpiresAt: slot.expiresAt,
  });
  const afterPlanId = plan?.id ?? slot.planId ?? null;
  const afterLimit =
    plan?.dataLimitBytes != null
      ? plan.dataLimitBytes.toString()
      : slot.dataLimitBytes != null
        ? slot.dataLimitBytes.toString()
        : null;
  const afterUsed = keepUsedTraffic
    ? slot.usedTrafficBytes != null
      ? slot.usedTrafficBytes.toString()
      : null
    : "0";
  const afterDevices =
    plan?.deviceSlots != null && plan.deviceSlots > 0
      ? plan.deviceSlots
      : slot.onlineIpLimit;
  const afterReset = plan?.resetPolicy ?? null;
  const afterResetInterval =
    plan?.resetPolicy === "custom" ? plan.customResetInterval ?? null : null;

  const before: SlotChangePreviewSide = {
    plan_id: slot.planId,
    plan_code: slot.plan?.code ?? null,
    plan_name: slot.plan?.name ?? null,
    expires_at: slot.expiresAt?.toISOString() ?? null,
    used_traffic_bytes:
      slot.usedTrafficBytes != null ? slot.usedTrafficBytes.toString() : null,
    data_limit_bytes:
      slot.dataLimitBytes != null ? slot.dataLimitBytes.toString() : null,
    online_ip_limit: slot.onlineIpLimit,
    reset_policy: slot.plan?.resetPolicy ?? null,
    custom_reset_interval: slot.plan?.customResetInterval ?? null,
    status: slot.status,
  };

  const after: SlotChangePreviewSide = {
    plan_id: afterPlanId,
    plan_code: plan?.code ?? slot.plan?.code ?? null,
    plan_name: plan?.name ?? slot.plan?.name ?? null,
    expires_at: afterExpire,
    used_traffic_bytes: afterUsed,
    data_limit_bytes: afterLimit,
    online_ip_limit: afterDevices ?? null,
    reset_policy: afterReset,
    custom_reset_interval: afterResetInterval,
    status: slot.status,
  };

  const warnings: string[] = [];
  if (keepExpiresAt && !slot.expiresAt) {
    warnings.push("当前槽无到期时间，勾选「到期时间不变」时上游可能仍按新套餐重算");
  }
  if (!keepUsedTraffic) {
    warnings.push(
      "将尝试清零已用流量；若上游拒绝该字段，提交会失败（可改回勾选「已用流量不变」）",
    );
  }
  if (
    !keepExpiresAt &&
    input.validitySeconds == null &&
    !input.expireAt &&
    plan &&
    plan.validitySeconds == null &&
    !plan.validityCalendarMonths &&
    (plan.upstreamPlanRef || input.upstreamPlanRef)
  ) {
    warnings.push(
      "未勾选到期不变且无本地开通时长时，到期由上游 next_plan_ref 决定，预览中到期可能显示为 —",
    );
  }

  return {
    slot_id: slot.id,
    keep_expires_at: keepExpiresAt,
    keep_used_traffic: keepUsedTraffic,
    before,
    after,
    warnings,
  };
}

export type EntitlementClawbackResult =
  | {
      ok: true;
      skipped?: undefined;
      slot_id: string;
      clawback_seconds: number;
      previous_expires_at: string | null;
      new_expires_at: string;
      disabled: boolean;
    }
  | {
      ok: true;
      skipped: "no_slot";
      slot_id?: undefined;
      clawback_seconds?: undefined;
      previous_expires_at?: undefined;
      new_expires_at?: undefined;
      disabled?: undefined;
    }
  | {
      ok: false;
      error: string;
      slot_id?: string;
      clawback_seconds?: number;
      previous_expires_at?: string | null;
    };

/**
 * Claw back one order's purchased duration from the plan slot expiry (LIFO / end-of-stack).
 * Used by refund flows; does not mark the order itself.
 */
export async function clawbackUpstreamForOrder(order: {
  id: string;
  userId: string;
  planId: string;
  paidAt?: Date | null;
  storeExpiresAt?: Date | null;
  targetSlotId?: string | null;
}): Promise<EntitlementClawbackResult> {
  let slot = order.targetSlotId
    ? await prisma.userUpstream.findFirst({
        where: { id: order.targetSlotId, userId: order.userId },
        include: { plan: true },
      })
    : null;
  if (!slot) {
    slot = await prisma.userUpstream.findFirst({
      where: { id: `uus_${order.id}`, userId: order.userId },
      include: { plan: true },
    });
  }
  if (!slot) {
    const legacy = await findLegacyRenewSlot(order.userId, order.planId);
    slot = legacy
      ? await prisma.userUpstream.findFirst({
          where: { id: legacy.id },
          include: { plan: true },
        })
      : null;
  }
  if (!slot) {
    return { ok: true, skipped: "no_slot" };
  }

  const previousExpiresAt = slot.expiresAt?.toISOString() ?? null;
  const now = Date.now();

  const plan =
    slot.plan ||
    (await prisma.plan.findUnique({ where: { id: order.planId } }));

  let clawbackSeconds: number | null = null;
  if (order.storeExpiresAt && order.paidAt) {
    const delta = Math.floor(
      (order.storeExpiresAt.getTime() - order.paidAt.getTime()) / 1000,
    );
    if (delta > 0) clawbackSeconds = delta;
  }
  if (clawbackSeconds == null && plan?.validitySeconds != null && plan.validitySeconds > 0) {
    clawbackSeconds = plan.validitySeconds;
  }

  // No duration metadata → expire immediately (conservative)
  const baseMs =
    slot.expiresAt && slot.expiresAt.getTime() > now
      ? slot.expiresAt.getTime()
      : now;

  let newExpires: Date;
  if (
    clawbackSeconds == null &&
    plan?.validityCalendarMonths != null &&
    plan.validityCalendarMonths > 0 &&
    slot.expiresAt
  ) {
    // Peel one calendar-month grant off the end of the stack
    newExpires = addCalendarMonths(
      slot.expiresAt,
      -plan.validityCalendarMonths,
    );
    if (newExpires.getTime() < now) newExpires = new Date(now);
    clawbackSeconds = Math.max(
      0,
      Math.floor((baseMs - newExpires.getTime()) / 1000),
    );
  } else {
    const newExpiresMs =
      clawbackSeconds == null
        ? now
        : Math.max(now, baseMs - clawbackSeconds * 1000);
    newExpires = new Date(newExpiresMs);
  }
  const disabled = newExpires.getTime() <= now;
  const appliedSeconds =
    clawbackSeconds ??
    Math.max(0, Math.floor((baseMs - newExpires.getTime()) / 1000));

  const expireAt = newExpires.toISOString();
  const note = `refund_clawback:order:${order.id};seconds:${clawbackSeconds ?? "force_now"}`;

  if (!slot.upstreamId) {
    const before = snapshotFromSlot(slot);
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { projectId: true },
    });
    const saved = await prisma.userUpstream.update({
      where: { id: slot.id },
      data: {
        expiresAt: newExpires,
        status: disabled ? "disabled" : slot.status,
        lastSyncedAt: new Date(),
      },
    });
    if (user) {
      await recordEntitlementLedger({
        projectId: user.projectId,
        userId: order.userId,
        slotId: saved.id,
        before,
        after: snapshotFromSlot(saved),
        ledger: {
          reason: "refund_clawback",
          refType: "order",
          refId: order.id,
          actorType: "system",
          remark: note,
          idempotencyKey: `clawback:order:${order.id}`,
        },
      });
    }
    return {
      ok: true,
      slot_id: saved.id,
      clawback_seconds: appliedSeconds,
      previous_expires_at: previousExpiresAt,
      new_expires_at: expireAt,
      disabled,
    };
  }

  await updateUpstreamSlot({
    userId: order.userId,
    slotId: slot.id,
    expireAt,
    status: disabled ? "disabled" : "active",
    note,
    ledger: {
      reason: "refund_clawback",
      refType: "order",
      refId: order.id,
      actorType: "system",
      remark: note,
      idempotencyKey: `clawback:order:${order.id}`,
    },
  });

  return {
    ok: true,
    slot_id: slot.id,
    clawback_seconds: appliedSeconds,
    previous_expires_at: previousExpiresAt,
    new_expires_at: expireAt,
    disabled,
  };
}

/**
 * Grant VPN duration for growth rewards (campaign / redeem code).
 * Prefer stacking onto the user's longest-lived active slot via explicit expire_at.
 */
export async function grantVpnDuration(input: {
  userId: string;
  seconds: number;
  dataLimitBytes?: number;
  stackMode?: "extend_active" | "create_campaign_slot";
  note?: string;
  /** Used when creating a new plan-less slot (campaign / redeem). */
  displayNameI18n?: Record<string, string> | null;
  locale?: string | null;
  ledger?: EntitlementLedgerContext;
}) {
  if (!Number.isFinite(input.seconds) || input.seconds <= 0) {
    throw Object.assign(new Error("grant.invalid_seconds"), { statusCode: 400 });
  }

  const stackMode = input.stackMode || "extend_active";
  const note = input.note || `grant_vpn_duration:${input.seconds}s`;

  if (stackMode === "extend_active") {
    const nowMs = Date.now();
    // Only stack onto a still-valid slot. Expired / invalid slots must not be
    // revived under the old plan name (e.g. campaign 1h onto expired 6-month).
    const slots = await prisma.userUpstream.findMany({
      where: { userId: input.userId, status: "active" },
      orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
    });
    const slot =
      slots.find(
        (s) =>
          Boolean(s.upstreamId) &&
          s.expiresAt != null &&
          s.expiresAt.getTime() > nowMs,
      ) ||
      slots.find(
        (s) =>
          Boolean(s.upstreamId) &&
          s.expiresAt == null, // open-ended active
      );
    if (slot?.upstreamId) {
      const baseMs =
        slot.expiresAt && slot.expiresAt.getTime() > nowMs
          ? slot.expiresAt.getTime()
          : nowMs;
      const expireAt = new Date(baseMs + input.seconds * 1000).toISOString();
      const result = await updateUpstreamSlot({
        userId: input.userId,
        slotId: slot.id,
        expireAt,
        dataLimitBytes: input.dataLimitBytes,
        note,
        ledger: input.ledger,
      });
      return {
        mode: "extend_active" as const,
        slot: result.slot,
        subscription: result.subscription,
        granted_seconds: input.seconds,
        expires_at: result.subscription.expires_at,
      };
    }
    // No valid slot → fall through to create a fresh campaign/redeem slot.
  }

  const created = await createUpstreamSlot({
    userId: input.userId,
    validitySeconds: input.seconds,
    dataLimitBytes: input.dataLimitBytes,
    note,
    displayNameI18n: input.displayNameI18n,
    locale: input.locale,
    ledger: input.ledger,
  });

  return {
    mode: "create_campaign_slot" as const,
    slot: created.slot,
    subscription: created.subscription,
    granted_seconds: input.seconds,
    expires_at: created.subscription.expires_at,
  };
}

export async function claimFreePlan(
  userId: string,
  planId: string,
  locale?: string | null,
) {
  const [plan, user] = await Promise.all([
    prisma.plan.findUnique({ where: { id: planId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!plan || !plan.enabled) {
    throw Object.assign(new Error("plan.not_found"), { statusCode: 404 });
  }
  if (!plan.isFreeClaimable) {
    throw Object.assign(new Error("plan.not_free_claimable"), { statusCode: 400 });
  }
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  if (plan.projectId !== user.projectId) {
    throw Object.assign(new Error("plan.project_mismatch"), { statusCode: 403 });
  }
  return createUpstreamSlot({
    userId,
    planId: plan.id,
    locale,
    ledger: {
      reason: "free_claim",
      refType: "plan",
      refId: plan.id,
      actorType: "user",
      actorId: userId,
      idempotencyKey: `free_claim:${userId}:${plan.id}`,
    },
  });
}

/**
 * Rotate subscription token for a slot.
 * Old subscription_url becomes invalid immediately; client must re-import.
 */
export async function refreshUpstreamSubscriptionUrl(
  userId: string,
  slotId: string,
  locale?: string | null,
) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: slotId, userId },
    include: { plan: true, user: { select: { projectId: true } } },
  });
  if (!slot) {
    throw Object.assign(new Error("subscription.not_found"), { statusCode: 404 });
  }
  if (!slot.upstreamId) {
    throw Object.assign(new Error("subscription.upstream_missing"), { statusCode: 400 });
  }

  const previousUrl = slot.subscriptionUrl;

  await wireraw.refreshSubscription(slot.upstreamId);

  const view = normalizeCustomerView(await wireraw.getCustomer(slot.upstreamId));
  const subscriptionUrl = pickSubscriptionUrl(view);
  if (!subscriptionUrl) {
    throw Object.assign(new Error("subscription.refresh_no_url"), { statusCode: 502 });
  }

  const snap = liveSnapshotFields(view, {
    fallbackUrl: subscriptionUrl,
    fallbackExpiresAt: slot.expiresAt,
    fallbackUpstreamId: slot.upstreamId,
    previous: previousLiveSnapshot(slot),
    clearMissing: true,
  });

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: {
      status: "active",
      ...snap,
      subscriptionUrl,
    },
    include: { plan: true },
  });

  return {
    subscription: await toSubscriptionViewAsync(
      saved,
      view,
      locale,
      slot.user.projectId,
    ),
    previous_subscription_url: previousUrl,
    subscription_url_changed: previousUrl !== subscriptionUrl,
  };
}

const slotProjectInclude = {
  plan: true,
  user: {
    select: {
      projectId: true,
      project: { select: { name: true, code: true } },
    },
  },
} as const;

export async function syncUpstreamSlot(
  userId: string,
  slotId: string,
  locale?: string | null,
) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: slotId, userId },
    include: slotProjectInclude,
  });
  if (!slot) return null;

  const raw = slot.upstreamId
    ? await wireraw.getCustomer(slot.upstreamId)
    : await wireraw.getCustomerByUsername(slot.upstreamUsername);
  const live = normalizeCustomerView(raw);
  const snap = liveSnapshotFields(live, {
    fallbackUrl: slot.subscriptionUrl,
    fallbackExpiresAt: slot.expiresAt,
    fallbackUpstreamId: slot.upstreamId,
    previous: previousLiveSnapshot(slot),
    clearMissing: true,
  });

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: snap,
    include: slotProjectInclude,
  });

  scheduleInviteMilestoneForInvitee(userId);
  const view = await toSubscriptionViewAsync(saved, live, locale);
  const [withRenew] = await attachCanRenew(userId, [view], [saved]);
  return withRenew;
}

const DEFAULT_STALE_TTL_MS = 30_000;
const refreshInFlight = new Map<string, Promise<void>>();

function isSlotStale(
  slot: { lastSyncedAt: Date | null },
  ttlMs: number,
): boolean {
  if (!slot.lastSyncedAt) return true;
  return Date.now() - slot.lastSyncedAt.getTime() > ttlMs;
}

function scheduleBackgroundRefresh(userId: string, slotIds: string[]) {
  if (slotIds.length === 0) return;
  if (refreshInFlight.has(userId)) return;
  const p = Promise.allSettled(
    slotIds.map((id) => syncUpstreamSlot(userId, id)),
  )
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      refreshInFlight.delete(userId);
    });
  refreshInFlight.set(userId, p);
}

export type ListSubscriptionsOptions = {
  mode?: "cached" | "live";
  locale?: string | null;
  /** Soft TTL for background refresh when mode=cached. Default 30s. */
  staleTtlMs?: number;
};


async function attachFupHistory(
  views: SubscriptionView[],
): Promise<SubscriptionView[]> {
  const ids = views.map((v) => v.id);
  const hist = await listFupHistoryBySlotIds(ids);
  return views.map((v) => ({
    ...v,
    fup_history: hist.get(v.id) || [],
  }));
}

export async function listUserSubscriptions(
  userId: string,
  options: ListSubscriptionsOptions | boolean = {},
  localeArg?: string | null,
) {
  // Backward-compat: listUserSubscriptions(id, true) / (id, true, locale)
  const optionsObj: ListSubscriptionsOptions =
    typeof options === "boolean"
      ? { mode: options ? "live" : "cached", locale: localeArg }
      : options;
  const mode = optionsObj.mode ?? "cached";
  const locale = optionsObj.locale ?? localeArg;
  const staleTtlMs = optionsObj.staleTtlMs ?? DEFAULT_STALE_TTL_MS;

  const slots = await prisma.userUpstream.findMany({
    where: { userId },
    include: {
      plan: true,
      user: {
        select: {
          projectId: true,
          project: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (mode === "live") {
    const views = await Promise.all(
      slots.map(async (slot) => {
        try {
          const synced = await syncUpstreamSlot(userId, slot.id, locale);
          return synced ?? (await toSubscriptionViewAsync(slot, null, locale));
        } catch {
          return toSubscriptionViewAsync(slot, null, locale);
        }
      }),
    );
    return attachCanRenew(userId, await attachFupHistory(views), slots);
  }

  const staleIds = slots
    .filter((s) => isSlotStale(s, staleTtlMs))
    .map((s) => s.id);
  scheduleBackgroundRefresh(userId, staleIds);

  const cached = await Promise.all(
    slots.map((s) => toSubscriptionViewAsync(s, null, locale)),
  );
  return attachCanRenew(userId, await attachFupHistory(cached), slots);
}

/** @deprecated use createUpstreamSlot / updateUpstreamSlot */
export async function provisionUserUpstream(input: {
  userId: string;
  planId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  note?: string;
  /** If set, renew/change this slot instead of creating */
  slotId?: string;
}) {
  if (input.slotId) {
    return updateUpstreamSlot({ ...input, slotId: input.slotId });
  }
  return createUpstreamSlot(input);
}

export type { User };
