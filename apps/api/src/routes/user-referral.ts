import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { env } from "../config.js";
import {
  getPromoOverview,
  getPromoTools,
  listCommissions,
  listTeamInvites,
  listTeamOrders,
} from "../services/referral/stats.js";
import { createWithdrawRequest, listUserWithdrawals } from "../services/referral/withdraw.js";

export const userReferralRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${USER_API_PREFIX}/promo`;

  app.get(`${prefix}/overview`, { preHandler: [app.requireUser] }, async (req) => {
    return getPromoOverview(req.user!.sub);
  });

  app.get(`${prefix}/tools`, { preHandler: [app.requireUser] }, async (req) => {
    return getPromoTools(req.user!.sub, env.WEB_PUBLIC_ORIGIN);
  });

  app.get(`${prefix}/team`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { level?: string; limit?: string; offset?: string };
    return listTeamInvites(req.user!.sub, {
      level: q.level ? Number(q.level) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get(`${prefix}/commissions`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { status?: string; limit?: string; offset?: string };
    return listCommissions(req.user!.sub, {
      status: q.status,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get(`${prefix}/team-orders`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return listTeamOrders(req.user!.sub, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get(`${prefix}/withdrawals`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return listUserWithdrawals(req.user!.sub, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.post(`${prefix}/withdrawals`, { preHandler: [app.requireUser] }, async (req, reply) => {
    const parsed = z
      .object({
        amount_cents: z.number().int().positive(),
        method: z.string().min(1),
        account: z.record(z.unknown()),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const item = await createWithdrawRequest({
        userId: req.user!.sub,
        amountCents: parsed.data.amount_cents,
        method: parsed.data.method,
        accountPayload: parsed.data.account as Prisma.InputJsonValue,
      });
      return { ok: true, withdrawal: item };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
