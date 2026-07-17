import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import {
  createUpstreamSlot,
  listUserSubscriptions,
  syncUpstreamSlot,
  updateUpstreamSlot,
} from "../services/provision.js";
import { WireRawError } from "../wireraw/client.js";

const provisionBody = z.object({
  plan_id: z.string().optional(),
  upstream_plan_ref: z.string().optional(),
  validity_seconds: z.number().int().positive().optional(),
  expire_at: z.string().optional(),
  note: z.string().optional(),
  /** Renew/change existing slot (keeps subscription URL) */
  slot_id: z.string().optional(),
});

export const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/users`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(prefix, async (req) => {
    const q = req.query as { q?: string; limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Number(q.offset) || 0;
    const where = q.q
      ? {
          OR: [
            { email: { contains: q.q } },
            { phone: { contains: q.q } },
            { id: { contains: q.q } },
          ],
        }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          upstreams: { include: { plan: true }, orderBy: { createdAt: "desc" } },
          _count: { select: { invitees: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const rechargeRows = userIds.length
      ? await prisma.order.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["paid", "provisioned"] },
            amountCents: { gt: 0 },
          },
          _sum: { amountCents: true },
        })
      : [];
    const rechargeMap = new Map(
      rechargeRows.map((r) => [r.userId, r._sum.amountCents || 0]),
    );

    return {
      total,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        status: u.status,
        created_at: u.createdAt,
        subscription_count: u.upstreams.length,
        total_recharge_cents: rechargeMap.get(u.id) || 0,
        invite_count: u._count.invitees,
        upstreams: u.upstreams.map((s) => ({
          id: s.id,
          plan_id: s.planId,
          plan_code: s.plan?.code || null,
          plan_name: s.plan?.name || null,
          upstream_id: s.upstreamId,
          upstream_username: s.upstreamUsername,
          subscription_url: s.subscriptionUrl,
          expires_at: s.expiresAt,
          status: s.status,
          last_synced_at: s.lastSyncedAt,
        })),
      })),
    };
  });

  app.get(`${prefix}/:id/subscriptions`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "user.not_found" });
    const subscriptions = await listUserSubscriptions(id, true);
    return { subscriptions };
  });

  app.post(`${prefix}/:id/sync`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      include: { upstreams: true },
    });
    if (!user) return reply.code(404).send({ error: "user.not_found" });
    try {
      const subscriptions = [];
      for (const slot of user.upstreams) {
        const sub = await syncUpstreamSlot(id, slot.id);
        if (sub) subscriptions.push(sub);
      }
      return { ok: true, subscriptions };
    } catch (err) {
      if (err instanceof WireRawError) {
        return reply.code(err.status).send({ error: err.code, upstream: err.body });
      }
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "sync_failed",
      });
    }
  });

  app.post(`${prefix}/:id/provision`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = provisionBody.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      if (parsed.data.slot_id) {
        const result = await updateUpstreamSlot({
          userId: id,
          slotId: parsed.data.slot_id,
          planId: parsed.data.plan_id,
          upstreamPlanRef: parsed.data.upstream_plan_ref,
          validitySeconds: parsed.data.validity_seconds,
          expireAt: parsed.data.expire_at,
          note: parsed.data.note,
        });
        return {
          ok: true,
          mode: "update",
          subscription: result.subscription,
          subscription_url_unchanged:
            result.previous_subscription_url === result.subscription.subscription_url,
        };
      }
      const result = await createUpstreamSlot({
        userId: id,
        planId: parsed.data.plan_id,
        upstreamPlanRef: parsed.data.upstream_plan_ref,
        validitySeconds: parsed.data.validity_seconds,
        expireAt: parsed.data.expire_at,
        note: parsed.data.note,
      });
      return {
        ok: true,
        mode: "create",
        subscription: result.subscription,
      };
    } catch (err) {
      if (err instanceof WireRawError) {
        return reply.code(err.status).send({ error: err.code, upstream: err.body });
      }
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "provision_failed",
      });
    }
  });

  app.patch(`${prefix}/:id/status`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ status: z.enum(["active", "disabled"]) })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const user = await prisma.user.update({
        where: { id },
        data: { status: body.data.status },
      });
      return { user: { id: user.id, email: user.email, status: user.status } };
    } catch {
      return reply.code(404).send({ error: "user.not_found" });
    }
  });
};
