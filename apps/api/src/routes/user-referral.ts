import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  createSpendRequest,
  listCatalogItems,
  listUserSpends,
} from "../services/referral/catalog-spend.js";
import { getReferralConfig } from "../services/referral/config.js";
import {
  getPromoOverview,
  getPromoRules,
  getPromoTools,
  listCommissions,
  listTeamInvites,
  listTeamOrders,
} from "../services/referral/stats.js";
import { createWithdrawRequest, listUserWithdrawals } from "../services/referral/withdraw.js";
import { listWalletLedger } from "../services/referral/wallet.js";
import {
  INVITE_CODE_MAX_LEN,
  INVITE_CODE_MIN_LEN,
  updateUserInviteCode,
} from "../services/referral/codes.js";
import { bindInviteForExistingUser } from "../services/referral/bind.js";

export const userReferralRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${USER_API_PREFIX}/promo`;

  app.get(`${prefix}/overview`, { preHandler: [app.requireUser] }, async (req) => {
    return getPromoOverview(req.user!.sub);
  });

  app.get(`${prefix}/catalog`, { preHandler: [app.requireUser] }, async (req, reply) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.sub },
        select: { projectId: true },
      });
      const config = await getReferralConfig(user.projectId);
      if (!config.catalogSpendEnabled) {
        return { items: [], catalog_spend_enabled: false };
      }
      const items = await listCatalogItems(user.projectId, { forUser: true });
      return {
        catalog_spend_enabled: true,
        items: items.map((i) => ({
          id: i.id,
          kind: i.kind,
          name: i.name,
          description: i.description,
          face_value_cents: i.faceValueCents,
          price_cents: i.priceCents,
          sort: i.sort,
          stock: i.stock,
          in_stock: i.stock == null || i.stock > 0,
        })),
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/spends`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return listUserSpends(req.user!.sub, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get(`${prefix}/wallet-ledger`, { preHandler: [app.requireUser] }, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const res = await listWalletLedger(req.user!.sub, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    return {
      total: res.total,
      items: res.items.map((row) => ({
        id: row.id,
        entry_type: row.entryType,
        available_delta: row.availableDelta,
        pending_delta: row.pendingDelta,
        withdrawn_delta: row.withdrawnDelta,
        frozen_delta: row.frozenDelta,
        spent_delta: row.spentDelta,
        available_after: row.availableAfter,
        pending_after: row.pendingAfter,
        withdrawn_after: row.withdrawnAfter,
        frozen_after: row.frozenAfter,
        spent_after: row.spentAfter,
        ref_type: row.refType,
        ref_id: row.refId,
        remark: row.remark,
        created_at: row.createdAt,
      })),
    };
  });

  app.post(`${prefix}/spends`, { preHandler: [app.requireUser] }, async (req, reply) => {
    const parsed = z
      .object({
        catalog_item_id: z.string().min(1),
        fulfillment: z.record(z.unknown()),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const item = await createSpendRequest({
        userId: req.user!.sub,
        catalogItemId: parsed.data.catalog_item_id,
        fulfillmentPayload: parsed.data.fulfillment,
      });
      return { ok: true, spend: item };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/tools`, { preHandler: [app.requireUser] }, async (req) => {
    const shell = String(req.headers["x-habibi-shell"] || "").toLowerCase();
    const preferTelegram =
      shell === "telegram_mini_app" || shell === "telegram" || shell === "tg";
    return getPromoTools(req.user!.sub, env.WEB_PUBLIC_ORIGIN, { preferTelegram });
  });

  /** Commission ladder + settle / withdraw rules for invite UI. */
  app.get(`${prefix}/rules`, { preHandler: [app.requireUser] }, async (req) => {
    return getPromoRules(req.user!.sub);
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

  app.patch(`${prefix}/invite-code`, { preHandler: [app.requireUser] }, async (req, reply) => {
    const parsed = z
      .object({
        invite_code: z.string().min(INVITE_CODE_MIN_LEN).max(INVITE_CODE_MAX_LEN),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const result = await updateUserInviteCode({
        userId: req.user!.sub,
        inviteCodeRaw: parsed.data.invite_code,
        actorType: "user",
        actorId: req.user!.sub,
      });
      return { ok: true, invite_code: result.invite_code, unchanged: result.unchanged };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /** Bind inviter after signup/bootstrap when not yet bound. */
  app.post(`${prefix}/bind-invite`, { preHandler: [app.requireUser] }, async (req, reply) => {
    const parsed = z
      .object({
        invite_code: z.string().min(INVITE_CODE_MIN_LEN).max(INVITE_CODE_MAX_LEN),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const result = await bindInviteForExistingUser({
        userId: req.user!.sub,
        inviteCode: parsed.data.invite_code,
      });
      return { ok: true, invited_by_id: result.invited_by_id };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
