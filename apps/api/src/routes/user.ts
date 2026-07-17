import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signUserToken } from "../lib/user-jwt.js";
import { serializePlan } from "../lib/serialize.js";
import {
  claimFreePlan,
  listUserSubscriptions,
  refreshUpstreamSubscriptionUrl,
  syncUpstreamSlot,
  updateUpstreamSlot,
} from "../services/provision.js";
import { getPublicNodePool } from "../services/nodes.js";
import { createUserWithInvite } from "../services/referral/bind.js";
import { WireRawError } from "../wireraw/client.js";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  invite_code: z.string().min(2).max(32).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof WireRawError) {
    return reply.code(err.status).send({ error: err.code, upstream: err.body });
  }
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.post(`${USER_API_PREFIX}/auth/register`, async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return reply.code(409).send({ error: "auth.email_taken" });
    }
    try {
      const inviteCode = parsed.data.invite_code?.trim() || undefined;
      const user = await createUserWithInvite({
        email,
        passwordHash: await hashPassword(parsed.data.password),
        inviteCode,
      });
      const token = await signUserToken({ sub: user.id, email: user.email });
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          status: user.status,
          invite_code: user.inviteCode,
          invited_by_id: user.invitedById,
        },
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${USER_API_PREFIX}/auth/login`, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "auth.invalid_credentials" });
    }
    if (user.status !== "active") {
      return reply.code(403).send({ error: "auth.user_disabled" });
    }
    const token = await signUserToken({ sub: user.id, email: user.email });
    return {
      token,
      user: { id: user.id, email: user.email, status: user.status },
    };
  });

  app.get(
    `${USER_API_PREFIX}/me`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        include: { upstreams: true },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      return {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          status: user.status,
          invite_code: user.inviteCode,
          invited_by_id: user.invitedById,
          promo_enabled: user.promoEnabled,
          created_at: user.createdAt,
          subscription_count: user.upstreams.length,
          has_subscription: user.upstreams.length > 0,
        },
      };
    },
  );

  /** Public node pool summary (region / status / count) — no IPs or links */
  app.get(`${USER_API_PREFIX}/nodes`, async (_req, reply) => {
    try {
      return await getPublicNodePool();
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${USER_API_PREFIX}/plans`, async (req) => {
    let claimedPlanIds = new Set<string>();
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const { verifyUserToken } = await import("../lib/user-jwt.js");
        const payload = await verifyUserToken(header.slice(7));
        const owned = await prisma.userUpstream.findMany({
          where: { userId: payload.sub, planId: { not: null } },
          select: { planId: true },
        });
        claimedPlanIds = new Set(
          owned.map((o) => o.planId).filter((id): id is string => !!id),
        );
      } catch {
        /* public list */
      }
    }

    const plans = await prisma.plan.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return {
      plans: plans.map((p) => {
        const s = serializePlan(p);
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          description: s.description,
          price_cents: s.priceCents,
          currency: s.currency,
          validity_seconds: s.validitySeconds,
          data_limit_bytes: s.dataLimitBytes,
          is_free_claimable: p.isFreeClaimable,
          already_claimed: claimedPlanIds.has(p.id),
          enabled: s.enabled,
        };
      }),
    };
  });

  /** List all package slots for current user */
  app.get(
    `${USER_API_PREFIX}/subscriptions`,
    { preHandler: [app.requireUser] },
    async (req) => {
      const subscriptions = await listUserSubscriptions(req.user!.sub, true);
      return { subscriptions };
    },
  );

  /** Backward-compatible: first active subscription or none */
  app.get(
    `${USER_API_PREFIX}/subscription`,
    { preHandler: [app.requireUser] },
    async (req) => {
      const subscriptions = await listUserSubscriptions(req.user!.sub, true);
      const active =
        subscriptions.find((s) => s.status === "active") || subscriptions[0] || null;
      if (!active) {
        return {
          status: "none",
          expires_at: null,
          used_traffic_bytes: null,
          data_limit_bytes: null,
          subscription_url: null,
          online_ip_limit: null,
          next_plan_ref: null,
          subscriptions: [],
        };
      }
      return { ...active, subscriptions };
    },
  );

  app.get(
    `${USER_API_PREFIX}/subscriptions/:id`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const sub = await syncUpstreamSlot(req.user!.sub, id);
        if (!sub) return reply.code(404).send({ error: "subscription.not_found" });
        return { subscription: sub };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  /** Free claim after register — creates a new upstream customer for this plan */
  app.post(
    `${USER_API_PREFIX}/subscriptions/claim`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = z.object({ plan_id: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const result = await claimFreePlan(req.user!.sub, parsed.data.plan_id);
        return {
          ok: true,
          subscription: result.subscription,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  /**
   * Rotate subscription URL (WireRaw refresh).
   * Old link becomes invalid immediately; client must re-import.
   */
  app.post(
    `${USER_API_PREFIX}/subscriptions/:id/refresh-url`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const result = await refreshUpstreamSubscriptionUrl(req.user!.sub, id);
        return {
          ok: true,
          subscription: result.subscription,
          subscription_url_changed: result.subscription_url_changed,
          previous_subscription_url: result.previous_subscription_url,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  /**
   * Change plan / extend on existing slot.
   * Upserts same WireRaw customer id → subscription_url stays.
   */
  app.post(
    `${USER_API_PREFIX}/subscriptions/:id/change-plan`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z
        .object({
          plan_id: z.string().optional(),
          upstream_plan_ref: z.string().optional(),
          validity_seconds: z.number().int().positive().optional(),
          expire_at: z.string().optional(),
        })
        .safeParse(req.body || {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const result = await updateUpstreamSlot({
          userId: req.user!.sub,
          slotId: id,
          planId: parsed.data.plan_id,
          upstreamPlanRef: parsed.data.upstream_plan_ref,
          validitySeconds: parsed.data.validity_seconds,
          expireAt: parsed.data.expire_at,
        });
        return {
          ok: true,
          subscription: result.subscription,
          subscription_url_unchanged:
            result.previous_subscription_url === result.subscription.subscription_url,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );
};
