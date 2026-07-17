import { prisma } from "../lib/prisma.js";
import { wireraw } from "../wireraw/client.js";
import type { Plan, User, UserUpstream } from "@prisma/client";

type WireRawCustomerView = {
  end_user?: {
    id?: string;
    username?: string;
    expires_at?: string;
    status?: string;
    used_traffic_bytes?: number | string;
    data_limit_bytes?: number | string;
    online_ip_limit?: number | string;
    next_plan_ref?: string;
  };
  /** Some responses also expose traffic at top level */
  used_traffic_bytes?: number | string;
  data_limit_bytes?: number | string;
  subscription_url?: string;
  subscription?: { subscription_url?: string; url?: string; revoked_at?: string | null };
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
  status: string;
  expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  subscription_url: string | null;
  online_ip_limit: number | null;
  next_plan_ref: string | null;
  upstream_id: string | null;
  upstream_username: string;
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

function buildPlanBody(plan: Plan | null, input: {
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  dataLimitBytes?: number;
}) {
  const body: Record<string, unknown> = {};
  if (input.expireAt) {
    body.expire_at = input.expireAt;
  } else if (input.validitySeconds) {
    body.validity_seconds = input.validitySeconds;
  } else if (plan?.upstreamPlanRef) {
    body.next_plan_ref = plan.upstreamPlanRef;
  } else if (input.upstreamPlanRef) {
    body.next_plan_ref = input.upstreamPlanRef;
  } else if (plan?.validitySeconds) {
    body.validity_seconds = plan.validitySeconds;
  } else {
    body.validity_seconds = 86400;
  }

  if (input.dataLimitBytes != null) {
    body.data_limit_bytes = input.dataLimitBytes;
  } else if (plan?.dataLimitBytes != null) {
    body.data_limit_bytes = Number(plan.dataLimitBytes);
  }
  return body;
}

function toSubscriptionView(
  slot: UserUpstream & { plan?: Plan | null },
  live?: WireRawCustomerView | null,
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
    toNum(end?.used_traffic_bytes) ?? toNum(view?.used_traffic_bytes);
  const limit =
    toNum(end?.data_limit_bytes) ?? toNum(view?.data_limit_bytes);

  return {
    id: slot.id,
    plan_id: slot.planId,
    plan_code: slot.plan?.code || null,
    plan_name: slot.plan?.name || null,
    status,
    expires_at: expiresAt,
    used_traffic_bytes: used,
    data_limit_bytes: limit,
    subscription_url: url,
    online_ip_limit: toNum(end?.online_ip_limit),
    next_plan_ref: end?.next_plan_ref || slot.plan?.upstreamPlanRef || null,
    upstream_id: end?.id || slot.upstreamId,
    upstream_username: slot.upstreamUsername,
  };
}

/**
 * Create a NEW upstream customer slot for this user (new package).
 * Uses a unique WireRaw username; subscription URL is stored and kept stable on later updates.
 */
export async function createUpstreamSlot(input: {
  userId: string;
  planId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  note?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  if (user.status !== "active") {
    throw Object.assign(new Error("user.disabled"), { statusCode: 403 });
  }

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : null;

  if (input.planId && plan) {
    const existing = await prisma.userUpstream.findUnique({
      where: { userId_planId: { userId: user.id, planId: plan.id } },
    });
    if (existing) {
      throw Object.assign(new Error("subscription.plan_already_owned"), {
        statusCode: 409,
      });
    }
  }

  // Pre-create local id so username is stable even before upstream returns
  const slotId = `uus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const username = upstreamUsernameFor(user.id, slotId, user.email);

  const body: Record<string, unknown> = {
    username,
    email: user.email || undefined,
    note: input.note || `habibi_user:${user.id};slot:${slotId}`,
    status: "active",
    ...buildPlanBody(plan, input),
  };

  const created = (await wireraw.upsertCustomer(body)) as WireRawCustomerView;
  const subscriptionUrl = pickSubscriptionUrl(created);
  const expiresAt = created.end_user?.expires_at
    ? new Date(created.end_user.expires_at)
    : null;

  const slot = await prisma.userUpstream.create({
    data: {
      id: slotId,
      userId: user.id,
      planId: plan?.id ?? null,
      upstreamId: created.end_user?.id || null,
      upstreamUsername: username,
      subscriptionUrl,
      expiresAt,
      status: "active",
      lastSyncedAt: new Date(),
    },
    include: { plan: true },
  });

  return {
    user,
    slot,
    subscription: toSubscriptionView(slot, created),
  };
}

/**
 * Renew / change plan on an EXISTING slot.
 * Always upserts WireRaw with the same end_user.id — never revoke/refresh — so subscription_url stays.
 */
export async function updateUpstreamSlot(input: {
  userId: string;
  slotId: string;
  planId?: string;
  upstreamPlanRef?: string;
  validitySeconds?: number;
  expireAt?: string;
  note?: string;
}) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: input.slotId, userId: input.userId },
    include: { plan: true, user: true },
  });
  if (!slot) throw Object.assign(new Error("subscription.not_found"), { statusCode: 404 });
  if (!slot.upstreamId) {
    throw Object.assign(new Error("subscription.upstream_missing"), { statusCode: 400 });
  }

  const plan = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : slot.plan;

  if (input.planId && plan && input.planId !== slot.planId) {
    const clash = await prisma.userUpstream.findUnique({
      where: { userId_planId: { userId: input.userId, planId: plan.id } },
    });
    if (clash && clash.id !== slot.id) {
      throw Object.assign(new Error("subscription.plan_already_owned"), {
        statusCode: 409,
      });
    }
  }

  const body: Record<string, unknown> = {
    id: slot.upstreamId,
    username: slot.upstreamUsername,
    email: slot.user.email || undefined,
    note: input.note || `habibi_user:${input.userId};slot:${slot.id}`,
    status: "active",
    ...buildPlanBody(plan, input),
  };

  const updated = (await wireraw.upsertCustomer(body)) as WireRawCustomerView;

  // Prefer previous URL if upstream omits it (keeps link stable)
  const subscriptionUrl =
    pickSubscriptionUrl(updated, slot.subscriptionUrl) || slot.subscriptionUrl;

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: {
      planId: plan?.id ?? slot.planId,
      subscriptionUrl,
      expiresAt: updated.end_user?.expires_at
        ? new Date(updated.end_user.expires_at)
        : slot.expiresAt,
      status: "active",
      lastSyncedAt: new Date(),
    },
    include: { plan: true },
  });

  return {
    slot: saved,
    subscription: toSubscriptionView(saved, updated),
    previous_subscription_url: slot.subscriptionUrl,
  };
}

export async function claimFreePlan(userId: string, planId: string) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.enabled) {
    throw Object.assign(new Error("plan.not_found"), { statusCode: 404 });
  }
  if (!plan.isFreeClaimable) {
    throw Object.assign(new Error("plan.not_free_claimable"), { statusCode: 400 });
  }
  return createUpstreamSlot({ userId, planId: plan.id });
}

/**
 * Rotate subscription token for a slot.
 * Old subscription_url becomes invalid immediately; client must re-import.
 */
export async function refreshUpstreamSubscriptionUrl(userId: string, slotId: string) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: slotId, userId },
    include: { plan: true },
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

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: {
      subscriptionUrl,
      expiresAt: view.end_user?.expires_at
        ? new Date(view.end_user.expires_at)
        : slot.expiresAt,
      status: "active",
      lastSyncedAt: new Date(),
    },
    include: { plan: true },
  });

  return {
    subscription: toSubscriptionView(saved, view),
    previous_subscription_url: previousUrl,
    subscription_url_changed: previousUrl !== subscriptionUrl,
  };
}

export async function syncUpstreamSlot(userId: string, slotId: string) {
  const slot = await prisma.userUpstream.findFirst({
    where: { id: slotId, userId },
    include: { plan: true },
  });
  if (!slot) return null;

  const raw = slot.upstreamId
    ? await wireraw.getCustomer(slot.upstreamId)
    : await wireraw.getCustomerByUsername(slot.upstreamUsername);
  const view = normalizeCustomerView(raw);

  const subscriptionUrl = pickSubscriptionUrl(view, slot.subscriptionUrl);

  const saved = await prisma.userUpstream.update({
    where: { id: slot.id },
    data: {
      upstreamId: view.end_user?.id || slot.upstreamId,
      // never wipe a known-good URL
      subscriptionUrl: subscriptionUrl || slot.subscriptionUrl,
      expiresAt: view.end_user?.expires_at
        ? new Date(view.end_user.expires_at)
        : slot.expiresAt,
      lastSyncedAt: new Date(),
    },
    include: { plan: true },
  });

  return toSubscriptionView(saved, view);
}

export async function listUserSubscriptions(userId: string, live = true) {
  const slots = await prisma.userUpstream.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (!live) {
    return slots.map((s) => toSubscriptionView(s));
  }

  const out: SubscriptionView[] = [];
  for (const slot of slots) {
    try {
      const synced = await syncUpstreamSlot(userId, slot.id);
      if (synced) out.push(synced);
    } catch {
      out.push(toSubscriptionView(slot));
    }
  }
  return out;
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
