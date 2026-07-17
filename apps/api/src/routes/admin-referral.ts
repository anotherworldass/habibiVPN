import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { createPaidOrderAndSettle, refundOrderAndInvalidate } from "../services/orders.js";
import { getReferralConfig, updateReferralConfig } from "../services/referral/config.js";
import {
  freezeWallet,
  invalidateLedgerByAdmin,
  invalidateOrderCommissionsByAdmin,
  setPromoEnabled,
} from "../services/referral/fraud.js";
import { getUplineChain } from "../services/referral/stats.js";
import { reviewWithdrawRequest } from "../services/referral/withdraw.js";

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const adminReferralRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/referral`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/config`, async () => getReferralConfig());

  app.put(`${prefix}/config`, async (req, reply) => {
    const parsed = z
      .object({
        enabled: z.boolean().optional(),
        maxLevel: z.number().int().min(1).max(10).optional(),
        settleDays: z.number().int().min(0).max(90).optional(),
        minWithdrawCents: z.number().int().min(0).optional(),
        withdrawFeeBps: z.number().int().min(0).max(5000).optional(),
        maxTotalRateBps: z.number().int().min(0).max(10000).optional(),
        withdrawMethods: z.array(z.string()).optional(),
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
      return await updateReferralConfig(parsed.data);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/commissions`, async (req) => {
    const q = req.query as {
      status?: string;
      user_id?: string;
      order_id?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Number(q.offset) || 0;
    const where = {
      ...(q.status ? { status: q.status as "pending" | "settled" | "invalid" } : {}),
      ...(q.user_id ? { beneficiaryId: q.user_id } : {}),
      ...(q.order_id ? { orderId: q.order_id } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.commissionLedger.count({ where }),
      prisma.commissionLedger.findMany({
        where,
        include: {
          beneficiary: { select: { id: true, email: true, inviteCode: true } },
          payer: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);
    return { total, items };
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

  app.get(`${prefix}/withdrawals`, async (req) => {
    const q = req.query as { status?: string; limit?: string; offset?: string };
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Number(q.offset) || 0;
    const where = q.status
      ? { status: q.status as "pending" | "approved" | "paid" | "rejected" }
      : {};
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
    return { total, items };
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

  app.get(`${prefix}/users/:id/relations`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        inviteCode: true,
        invitedById: true,
        promoEnabled: true,
        status: true,
        createdAt: true,
        promoWallet: true,
        inviter: { select: { id: true, email: true, inviteCode: true } },
      },
    });
    if (!user) return reply.code(404).send({ error: "user.not_found" });

    const [upline, downlineCounts] = await Promise.all([
      getUplineChain(id),
      prisma.inviteClosure.groupBy({
        by: ["depth"],
        where: { ancestorId: id },
        _count: { _all: true },
      }),
    ]);

    return {
      user,
      upline,
      downline_by_level: Object.fromEntries(
        downlineCounts.map((d) => [d.depth, d._count._all]),
      ),
    };
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

  app.get(`${prefix}/orders`, async (req) => {
    const q = req.query as { limit?: string; offset?: string; user_id?: string };
    const limit = Math.min(Number(q.limit) || 20, 100);
    const offset = Number(q.offset) || 0;
    const where = {
      amountCents: { gt: 0 },
      ...(q.user_id ? { userId: q.user_id } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true } },
          plan: { select: { id: true, code: true, name: true } },
          _count: { select: { commissions: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);
    return { total, items };
  });
};
