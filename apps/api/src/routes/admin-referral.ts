import type { FastifyPluginAsync } from "fastify";
import type { PromoWalletEntryType } from "@prisma/client";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { createPaidOrderAndSettle, refundOrderAndInvalidate } from "../services/orders.js";
import { getReferralConfig, updateReferralConfig } from "../services/referral/config.js";
import {
  freezeWallet,
  invalidateLedgerByAdmin,
  invalidateOrderCommissionsByAdmin,
  setPromoEnabled,
} from "../services/referral/fraud.js";
import {
  getPromoGroup,
  listPromoGroups,
  setUserPromoGroup,
  updatePromoGroup,
} from "../services/referral/groups.js";
import {
  createCatalogItem,
  listAdminSpends,
  listCatalogItems,
  reviewSpendRequest,
  updateCatalogItem,
} from "../services/referral/catalog-spend.js";
import { getUplineChain } from "../services/referral/stats.js";
import { listWalletLedger } from "../services/referral/wallet.js";
import { reviewWithdrawRequest } from "../services/referral/withdraw.js";
import {
  INVITE_CODE_MAX_LEN,
  INVITE_CODE_MIN_LEN,
  updateUserInviteCode,
} from "../services/referral/codes.js";
import { bindInviteForExistingUser } from "../services/referral/bind.js";
import { writeAudit } from "../lib/audit.js";

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

async function requireGroupInProject(groupId: string, projectId: string) {
  const g = await getPromoGroup(groupId);
  if (g.projectId !== projectId) {
    throw Object.assign(new Error("promo_group.not_found"), { statusCode: 404 });
  }
  return g;
}

export const adminReferralRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/referral`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/config`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return await getReferralConfig(projectId);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/groups`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return listPromoGroups(projectId);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/groups/:id`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return await requireGroupInProject((req.params as { id: string }).id, projectId);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.put(`${prefix}/groups/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().min(1).max(64).optional(),
        enabled: z.boolean().optional(),
        maxLevel: z.number().int().min(1).max(10).nullable().optional(),
        sort: z.number().int().optional(),
        remark: z.string().max(2000).nullable().optional(),
        levels: z
          .array(
            z.object({
              level: z.number().int().min(1).max(10),
              rateBps: z.number().int().min(0).max(10000),
            }),
          )
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      await requireGroupInProject(id, projectId);
      return await updatePromoGroup(id, parsed.data);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.patch(`${prefix}/users/:id/promo-group`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        promo_group_id: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const result = await setUserPromoGroup(id, parsed.data.promo_group_id, req.admin!.sub);
      return { ok: true, ...result };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.put(`${prefix}/config`, async (req, reply) => {
    const parsed = z
      .object({
        enabled: z.boolean().optional(),
        maxLevel: z.number().int().min(1).max(10).optional(),
        settleDays: z.number().int().min(0).max(90).optional(),
        minWithdrawCents: z.number().int().min(0).optional(),
        withdrawFeeBps: z.number().int().min(0).max(5000).optional(),
        maxTotalRateBps: z.number().int().min(0).max(10000).optional(),
        iapCommissionBaseBps: z.number().int().min(0).max(10000).optional(),
        playCommissionBaseBps: z.number().int().min(0).max(10000).optional(),
        firstCommissionBaseBps: z.number().int().min(0).max(10000).optional(),
        renewCommissionBaseBps: z.number().int().min(0).max(10000).optional(),
        withdrawMethods: z.array(z.string()).optional(),
        catalogSpendEnabled: z.boolean().optional(),
        levels: z
          .array(
            z.object({
              level: z.number().int().min(1).max(10),
              rateBps: z.number().int().min(0).max(10000),
            }),
          )
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      return await updateReferralConfig(projectId, parsed.data);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/catalog`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const items = await listCatalogItems(projectId);
      return { items, project_id: projectId };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/catalog`, async (req, reply) => {
    const parsed = z
      .object({
        kind: z.enum(["phone_credit", "gift_card"]),
        name: z.string().min(1).max(128),
        description: z.string().max(2000).nullable().optional(),
        face_value_cents: z.number().int().positive(),
        price_cents: z.number().int().positive(),
        enabled: z.boolean().optional(),
        sort: z.number().int().optional(),
        stock: z.number().int().min(0).nullable().optional(),
        remark: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const item = await createCatalogItem({
        projectId,
        kind: parsed.data.kind,
        name: parsed.data.name,
        description: parsed.data.description,
        faceValueCents: parsed.data.face_value_cents,
        priceCents: parsed.data.price_cents,
        enabled: parsed.data.enabled,
        sort: parsed.data.sort,
        stock: parsed.data.stock,
        remark: parsed.data.remark,
      });
      return { ok: true, item };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.put(`${prefix}/catalog/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        kind: z.enum(["phone_credit", "gift_card"]).optional(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(2000).nullable().optional(),
        face_value_cents: z.number().int().positive().optional(),
        price_cents: z.number().int().positive().optional(),
        enabled: z.boolean().optional(),
        sort: z.number().int().optional(),
        stock: z.number().int().min(0).nullable().optional(),
        remark: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const item = await updateCatalogItem(id, projectId, {
        kind: parsed.data.kind,
        name: parsed.data.name,
        description: parsed.data.description,
        faceValueCents: parsed.data.face_value_cents,
        priceCents: parsed.data.price_cents,
        enabled: parsed.data.enabled,
        sort: parsed.data.sort,
        stock: parsed.data.stock,
        remark: parsed.data.remark,
      });
      return { ok: true, item };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/spends`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { status?: string; limit?: string; offset?: string };
      return await listAdminSpends(projectId, {
        status: q.status,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/spends/:id/review`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        action: z.enum(["fulfill", "reject"]),
        admin_note: z.string().max(1000).optional(),
        fulfillment_note: z.string().max(4000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const item = await reviewSpendRequest({
        id,
        action: parsed.data.action,
        adminId: req.admin!.sub,
        adminNote: parsed.data.admin_note,
        fulfillmentNote: parsed.data.fulfillment_note,
      });
      return { ok: true, item };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/commissions`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as {
        status?: string;
        user_id?: string;
        order_id?: string;
        promo_group_id?: string;
        limit?: string;
        offset?: string;
      };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const where = {
        beneficiary: { projectId },
        ...(q.status ? { status: q.status as "pending" | "settled" | "invalid" } : {}),
        ...(q.user_id ? { beneficiaryId: q.user_id } : {}),
        ...(q.order_id ? { orderId: q.order_id } : {}),
        ...(q.promo_group_id ? { promoGroupId: q.promo_group_id } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.commissionLedger.count({ where }),
        prisma.commissionLedger.findMany({
          where,
          include: {
            beneficiary: { select: { id: true, uid: true, email: true, inviteCode: true } },
            payer: { select: { id: true, email: true } },
            promoGroup: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);
      return { total, items, project_id: projectId };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/commissions/:id/invalidate`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const item = await invalidateLedgerByAdmin(id, parsed.data.reason, req.admin!.sub);
      return { ok: true, item };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/orders/:orderId/invalidate-commissions`, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const parsed = z
      .object({ reason: z.string().min(1).max(500).default("admin_invalidate") })
      .safeParse(req.body || {});
    try {
      const result = await invalidateOrderCommissionsByAdmin(
        orderId,
        parsed.success ? parsed.data.reason : "admin_invalidate",
        req.admin!.sub,
      );
      return { ok: true, ...result };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/withdrawals`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { status?: string; limit?: string; offset?: string };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const where = {
        user: { projectId },
        ...(q.status
          ? { status: q.status as "pending" | "approved" | "paid" | "rejected" }
          : {}),
      };
      const [total, items] = await Promise.all([
        prisma.withdrawRequest.count({ where }),
        prisma.withdrawRequest.findMany({
          where,
          include: { user: { select: { id: true, email: true, inviteCode: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);
      return { total, items, project_id: projectId };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/withdrawals/:id/review`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        action: z.enum(["approve", "reject", "paid"]),
        admin_note: z.string().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const item = await reviewWithdrawRequest({
        id,
        action: parsed.data.action,
        adminId: req.admin!.sub,
        adminNote: parsed.data.admin_note,
      });
      return { ok: true, item };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** Users who have invited at least one person. */
  app.get(`${prefix}/relations`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { q?: string; limit?: string; offset?: string };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const qTrim = q.q?.trim() || "";
      const asUid = qTrim && /^\d+$/.test(qTrim) ? Number(qTrim) : null;

      const where = {
        projectId,
        invitees: { some: {} },
        ...(qTrim
          ? {
              OR: [
                { email: { contains: qTrim } },
                { id: { contains: qTrim } },
                { inviteCode: { contains: qTrim } },
                ...(asUid != null && Number.isSafeInteger(asUid) ? [{ uid: asUid }] : []),
              ],
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: {
            id: true,
            uid: true,
            email: true,
            inviteCode: true,
            invitedById: true,
            promoEnabled: true,
            status: true,
            adminRemark: true,
            createdAt: true,
            promoGroup: { select: { id: true, name: true, code: true } },
            inviter: { select: { id: true, email: true, inviteCode: true, uid: true } },
            promoWallet: {
              select: {
                availableCents: true,
                pendingCents: true,
                withdrawnCents: true,
                frozenCents: true,
              },
            },
            _count: { select: { invitees: true } },
          },
          orderBy: [{ invitees: { _count: "desc" } }, { createdAt: "desc" }],
          take: limit,
          skip: offset,
        }),
      ]);

      return {
        total,
        project_id: projectId,
        items: items.map((u) => ({
          id: u.id,
          uid: u.uid,
          email: u.email,
          invite_code: u.inviteCode,
          invited_by_id: u.invitedById,
          promo_enabled: u.promoEnabled,
          status: u.status,
          admin_remark: u.adminRemark,
          created_at: u.createdAt,
          invite_count: u._count.invitees,
          promo_group: u.promoGroup,
          inviter: u.inviter
            ? {
                id: u.inviter.id,
                uid: u.inviter.uid,
                email: u.inviter.email,
                invite_code: u.inviter.inviteCode,
              }
            : null,
          wallet: u.promoWallet
            ? {
                available_cents: u.promoWallet.availableCents,
                pending_cents: u.promoWallet.pendingCents,
                withdrawn_cents: u.promoWallet.withdrawnCents,
                frozen_cents: u.promoWallet.frozenCents,
              }
            : null,
        })),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/users/:id/wallet-ledger`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id: raw } = req.params as { id: string };
      const key = decodeURIComponent(raw).trim();
      const asUid = /^\d+$/.test(key) ? Number(key) : null;
      const q = req.query as { limit?: string; offset?: string; entry_type?: string };

      const user = await prisma.user.findFirst({
        where: {
          projectId,
          OR: [
            { id: key },
            { inviteCode: key.toUpperCase() },
            ...(key.includes("@") ? [{ email: key }] : []),
            ...(asUid != null && Number.isSafeInteger(asUid) ? [{ uid: asUid }] : []),
          ],
        },
        select: { id: true },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });

      const entryType = q.entry_type as PromoWalletEntryType | undefined;
      return await listWalletLedger(user.id, {
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
        entryType,
      });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/users/:id/relations`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id: raw } = req.params as { id: string };
      const key = decodeURIComponent(raw).trim();
      const asUid = /^\d+$/.test(key) ? Number(key) : null;

      const user = await prisma.user.findFirst({
        where: {
          projectId,
          OR: [
            { id: key },
            { inviteCode: key.toUpperCase() },
            ...(key.includes("@") ? [{ email: key }] : []),
            ...(asUid != null && Number.isSafeInteger(asUid) ? [{ uid: asUid }] : []),
          ],
        },
        select: {
          id: true,
          uid: true,
          email: true,
          emailVerifiedAt: true,
          inviteCode: true,
          invitedById: true,
          promoEnabled: true,
          promoGroupId: true,
          projectId: true,
          status: true,
          adminRemark: true,
          createdAt: true,
          sourceClient: true,
          connectMode: true,
          connectClients: true,
          connectPrefSource: true,
          connectPrefAt: true,
          sourceSite: { select: { id: true, name: true, host: true } },
          sourcePackage: { select: { id: true, name: true, packageName: true, client: true } },
          promoWallet: true,
          promoGroup: { select: { id: true, name: true, code: true } },
          inviter: { select: { id: true, email: true, inviteCode: true } },
        },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });

      const [upline, downlineCounts, groups] = await Promise.all([
        getUplineChain(user.id),
        prisma.inviteClosure.groupBy({
          by: ["depth"],
          where: { ancestorId: user.id },
          _count: { _all: true },
        }),
        listPromoGroups(projectId),
      ]);

      return {
        user: {
          ...user,
          connectClients: Array.isArray(user.connectClients)
            ? user.connectClients
            : [],
        },
        upline,
        downline_by_level: Object.fromEntries(
          downlineCounts.map((d) => [d.depth, d._count._all]),
        ),
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          code: g.code,
          enabled: g.enabled,
        })),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/users/:id/inviter`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const parsed = z
        .object({ inviter: z.string().trim().min(1).max(255) })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }

      const user = await prisma.user.findFirst({
        where: { id, projectId },
        select: { id: true, invitedById: true },
      });
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      if (user.invitedById) {
        return reply.code(409).send({ error: "invite.already_bound" });
      }

      const key = parsed.data.inviter;
      const asUid = /^\d+$/.test(key) ? Number(key) : null;
      const inviter = await prisma.user.findFirst({
        where: {
          projectId,
          OR: [
            { id: key },
            { inviteCode: key.toUpperCase() },
            ...(key.includes("@") ? [{ email: key.toLowerCase() }] : []),
            ...(asUid != null && Number.isSafeInteger(asUid) ? [{ uid: asUid }] : []),
          ],
        },
        select: { id: true, uid: true, email: true, inviteCode: true },
      });
      if (!inviter) {
        return reply.code(404).send({ error: "invite.inviter_not_found" });
      }

      await bindInviteForExistingUser({
        userId: user.id,
        inviteCode: inviter.inviteCode,
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin!.sub,
        action: "referral.inviter_bind",
        targetType: "user",
        targetId: user.id,
        meta: { inviter_id: inviter.id, inviter_uid: inviter.uid },
        ip: req.ip,
      });
      return { ok: true, inviter };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.patch(`${prefix}/users/:id/promo`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        promo_enabled: z.boolean().optional(),
        frozen_cents: z.number().int().min(0).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      if (parsed.data.promo_enabled != null) {
        await setPromoEnabled(id, parsed.data.promo_enabled, req.admin!.sub);
      }
      if (parsed.data.frozen_cents != null) {
        await freezeWallet(id, parsed.data.frozen_cents, req.admin!.sub);
      }
      const user = await prisma.user.findUnique({
        where: { id },
        include: { promoWallet: true },
      });
      return { ok: true, user };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** Admin-only ops remark on a user (visible in referral relations). */
  app.patch(`${prefix}/users/:id/remark`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const parsed = z
        .object({
          admin_remark: z.string().max(5000).nullable(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      const existing = await prisma.user.findFirst({
        where: { id, projectId },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ error: "user.not_found" });

      const remark =
        parsed.data.admin_remark == null || parsed.data.admin_remark.trim() === ""
          ? null
          : parsed.data.admin_remark.trim();

      const user = await prisma.user.update({
        where: { id },
        data: { adminRemark: remark },
        select: {
          id: true,
          uid: true,
          adminRemark: true,
        },
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "user.admin_remark_update",
        targetType: "user",
        targetId: id,
        meta: { admin_remark: remark },
      });
      return {
        ok: true,
        user: {
          id: user.id,
          uid: user.uid,
          admin_remark: user.adminRemark,
        },
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.patch(`${prefix}/users/:id/invite-code`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const parsed = z
        .object({
          invite_code: z.string().min(INVITE_CODE_MIN_LEN).max(INVITE_CODE_MAX_LEN),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      const existing = await prisma.user.findFirst({
        where: { id, projectId },
        select: { id: true },
      });
      if (!existing) return reply.code(404).send({ error: "user.not_found" });

      const result = await updateUserInviteCode({
        userId: id,
        inviteCodeRaw: parsed.data.invite_code,
        actorType: "admin",
        actorId: req.admin?.sub,
      });
      return { ok: true, invite_code: result.invite_code, unchanged: result.unchanged };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  /** Manual paid order for commission testing before payment gateway. */
  app.post(`${prefix}/orders/manual`, async (req, reply) => {
    const parsed = z
      .object({
        user_id: z.string().min(1),
        plan_id: z.string().min(1),
        amount_cents: z.number().int().positive().optional(),
        currency: z.string().optional(),
        note: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const [user, plan] = await Promise.all([
        prisma.user.findFirst({
          where: { id: parsed.data.user_id, projectId },
          select: { id: true },
        }),
        prisma.plan.findFirst({
          where: { id: parsed.data.plan_id, projectId },
          select: { id: true },
        }),
      ]);
      if (!user) return reply.code(404).send({ error: "user.not_found" });
      if (!plan) return reply.code(404).send({ error: "plan.not_found" });
      const result = await createPaidOrderAndSettle({
        userId: parsed.data.user_id,
        planId: parsed.data.plan_id,
        amountCents: parsed.data.amount_cents,
        currency: parsed.data.currency,
        provider: "admin_manual",
        providerRef: parsed.data.note,
      });
      return {
        ok: true,
        order: result.order,
        commission_created: result.commission.created,
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/orders/:orderId/refund`, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const parsed = z
      .object({ reason: z.string().min(1).max(500).default("refund") })
      .safeParse(req.body || {});
    try {
      const result = await refundOrderAndInvalidate(
        orderId,
        parsed.success ? parsed.data.reason : "refund",
      );
      return { ok: true, ...result };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/orders`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { limit?: string; offset?: string; user_id?: string };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      // List view: paid-amount orders only. Per-user view: full history (incl. trials / $0).
      const where = {
        user: { projectId },
        ...(q.user_id
          ? { userId: q.user_id }
          : { amountCents: { gt: 0 } }),
      };
      const [total, items] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include: {
            user: { select: { id: true, email: true, uid: true } },
            plan: { select: { id: true, code: true, name: true } },
            paymentChannel: { select: { id: true, code: true, name: true } },
            _count: { select: { commissions: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);
      return { total, items, project_id: projectId };
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
