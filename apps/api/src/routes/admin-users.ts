import type { ConnectMode } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { writeAudit } from "../lib/audit.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import {
  createUpstreamSlot,
  listUserSubscriptions,
  previewUpstreamSlotUpdate,
  syncUpstreamSlot,
  updateUpstreamSlot,
} from "../services/provision.js";
import { listUserAuthEvents } from "../services/auth-events.js";
import {
  buildClientSubscriptionUrls,
  buildProfileTitle,
} from "../services/subscription-convert/index.js";
import { WireRawError } from "../wireraw/client.js";

const provisionBody = z.object({
  plan_id: z.string().optional(),
  upstream_plan_ref: z.string().optional(),
  validity_seconds: z.number().int().positive().optional(),
  expire_at: z.string().optional(),
  note: z.string().optional(),
  /** Renew/change existing slot (keeps subscription URL) */
  slot_id: z.string().optional(),
  /** Keep current absolute expiry (change-plan) */
  keep_expires_at: z.boolean().optional(),
  /** Keep used traffic; false = attempt clear to 0 */
  keep_used_traffic: z.boolean().optional(),
});

export const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/users`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(prefix, async (req, reply) => {
    try {
    const q = req.query as {
      q?: string;
      limit?: string;
      offset?: string;
      promo_group_id?: string;
      connect_mode?: string;
    };
    const projectId = await resolveAdminProjectId(req);
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Number(q.offset) || 0;
    const qTrim = q.q?.trim() || "";
    const qAsUid = qTrim && /^\d+$/.test(qTrim) ? Number(qTrim) : null;
    const groupId = q.promo_group_id?.trim() || "";
    const connectModeRaw = q.connect_mode?.trim() || "";
    const connectModeFilter: ConnectMode | undefined =
      connectModeRaw === "unset" ||
      connectModeRaw === "official_app" ||
      connectModeRaw === "subscription_client"
        ? connectModeRaw
        : undefined;
    const where = {
      projectId,
      ...(groupId ? { promoGroupId: groupId } : {}),
      ...(connectModeFilter ? { connectMode: connectModeFilter } : {}),
      ...(qTrim
        ? {
            OR: [
              { email: { contains: qTrim } },
              { phone: { contains: qTrim } },
              { id: { contains: qTrim } },
              { inviteCode: { contains: qTrim } },
              ...(qAsUid != null && Number.isSafeInteger(qAsUid) ? [{ uid: qAsUid }] : []),
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          upstreams: { include: { plan: true }, orderBy: { createdAt: "desc" } },
          promoGroup: { select: { id: true, name: true, code: true, enabled: true } },
          sourceSite: { select: { id: true, name: true, host: true } },
          sourcePackage: { select: { id: true, name: true, packageName: true, client: true } },
          project: { select: { id: true, code: true, name: true } },
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
      project_id: projectId,
      users: users.map((u) => ({
        id: u.id,
        uid: u.uid,
        email: u.email,
        phone: u.phone,
        status: u.status,
        is_anonymous: !u.email,
        created_at: u.createdAt,
        subscription_count: u.upstreams.length,
        total_recharge_cents: rechargeMap.get(u.id) || 0,
        invite_count: u._count.invitees,
        invite_code: u.inviteCode,
        promo_group_id: u.promoGroupId,
        promo_group: u.promoGroup
          ? {
              id: u.promoGroup.id,
              name: u.promoGroup.name,
              code: u.promoGroup.code,
              enabled: u.promoGroup.enabled,
            }
          : null,
        project: u.project,
        source_client: u.sourceClient,
        source_site: u.sourceSite,
        source_package: u.sourcePackage,
        preferences: {
          connect_mode: u.connectMode,
          connect_clients: Array.isArray(u.connectClients)
            ? u.connectClients
            : [],
          connect_pref_source: u.connectPrefSource,
          connect_pref_at: u.connectPrefAt,
        },
        upstreams: u.upstreams.map((s) => ({
          id: s.id,
          plan_id: s.planId,
          plan_code: s.plan?.code || null,
          plan_name: s.plan?.name || null,
          upstream_id: s.upstreamId,
          upstream_username: s.upstreamUsername,
          subscription_url: s.subscriptionUrl,
          client_urls: s.subscriptionUrl
            ? buildClientSubscriptionUrls(s.id, {
                profileTitle: buildProfileTitle(
                  u.project?.name || u.project?.code,
                  s.plan?.name,
                ),
              })
            : null,
          expires_at: s.expiresAt,
          status: s.status,
          last_synced_at: s.lastSyncedAt,
        })),
      })),
    };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/:id/subscriptions`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: "user.not_found" });
    const subscriptions = await listUserSubscriptions(id, { mode: "live" });
    return { subscriptions };
  });

  app.get(`${prefix}/:id/auth-events`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const q = req.query as { limit?: string; offset?: string };
      const user = await prisma.user.findFirst({
        where: { id, projectId },
        select: { id: true },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      return await listUserAuthEvents(id, {
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(`${prefix}/:id/reset-password`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const parsed = z
        .object({ new_password: z.string().min(6).max(128) })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }

      const user = await prisma.user.findFirst({
        where: { id, projectId },
        select: { id: true, email: true },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      if (!user.email) {
        return reply.code(409).send({ error: "auth.email_required" });
      }

      const passwordHash = await hashPassword(parsed.data.new_password);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin!.sub,
        action: "auth.password_reset_by_admin",
        targetType: "user",
        targetId: user.id,
        ip: req.ip,
      });
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
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

  app.post(`${prefix}/:id/provision/preview`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = provisionBody.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    if (!parsed.data.slot_id) {
      return reply.code(400).send({ error: "provision.slot_id_required" });
    }
    try {
      const preview = await previewUpstreamSlotUpdate({
        userId: id,
        slotId: parsed.data.slot_id,
        planId: parsed.data.plan_id,
        upstreamPlanRef: parsed.data.upstream_plan_ref,
        validitySeconds: parsed.data.validity_seconds,
        expireAt: parsed.data.expire_at,
        note: parsed.data.note,
        keepExpiresAt: parsed.data.keep_expires_at,
        // Upstream cannot clear used traffic
        keepUsedTraffic: true,
      });
      return { ok: true, preview };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "preview_failed",
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
      const ledger = {
        reason: "admin_provision" as const,
        refType: "admin",
        refId: req.admin?.sub || undefined,
        actorType: "admin",
        actorId: req.admin?.sub || req.admin?.username || undefined,
        remark: parsed.data.note,
      };
      if (parsed.data.slot_id) {
        const result = await updateUpstreamSlot({
          userId: id,
          slotId: parsed.data.slot_id,
          planId: parsed.data.plan_id,
          upstreamPlanRef: parsed.data.upstream_plan_ref,
          validitySeconds: parsed.data.validity_seconds,
          expireAt: parsed.data.expire_at,
          note: parsed.data.note,
          keepExpiresAt: parsed.data.keep_expires_at,
          // Upstream cannot clear used traffic
          keepUsedTraffic: true,
          ledger,
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
        ledger,
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
