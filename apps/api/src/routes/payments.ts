import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { createPaymentAdapter } from "../payments/registry.js";
import {
  applyPaymentResult,
  createPaymentOrder,
  isStoreIapOnlyClient,
  publicOrder,
  refreshPaymentOrder,
} from "../services/payments.js";
import type { ClientChannel } from "@prisma/client";

const createOrderBody = z.object({
  plan_id: z.string().min(1),
  channel_id: z.string().min(1),
  coupon_code: z.string().min(1).max(64).optional(),
  client: z
    .enum([
      "ios_appstore",
      "ios_alt",
      "android_play",
      "android_direct",
      "h5",
      "windows",
      "macos",
    ])
    .optional(),
  jump_url: z.string().url().optional(),
});

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "")]),
  );
}

function requestClientChannel(req: {
  headers: Record<string, unknown>;
  query?: unknown;
  body?: unknown;
}): ClientChannel | null {
  const header = req.headers["x-habibi-client"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const q = (req.query || {}) as { client?: string };
  const body = (req.body || {}) as { client?: string };
  const raw =
    (typeof fromHeader === "string" && fromHeader.trim()) ||
    (typeof q.client === "string" && q.client.trim()) ||
    (typeof body.client === "string" && body.client.trim()) ||
    "";
  if (!raw) return null;
  if (
    raw === "ios_appstore" ||
    raw === "ios_alt" ||
    raw === "android_play" ||
    raw === "android_direct" ||
    raw === "h5" ||
    raw === "windows" ||
    raw === "macos"
  ) {
    return raw;
  }
  return null;
}

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.get(`${USER_API_PREFIX}/payment-channels`, async (req) => {
    const query = req.query as { plan_id?: string; client?: string };
    const client =
      requestClientChannel(req) ||
      (typeof query.client === "string" ? (query.client as ClientChannel) : null);
    // 商店客户端：不暴露任何第三方支付通道。
    if (isStoreIapOnlyClient(client)) {
      return { channels: [] };
    }
    const plan = query.plan_id
      ? await prisma.plan.findUnique({ where: { id: query.plan_id } })
      : null;
    const channels = await prisma.paymentChannel.findMany({
      where: {
        enabled: true,
        provider: { enabled: true, credentialsEncrypted: { not: null } },
        ...(plan
          ? {
              currency: plan.currency,
              minCents: { lte: plan.priceCents },
              maxCents: { gte: plan.priceCents },
            }
          : {}),
      },
      include: { provider: { select: { code: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return {
      channels: channels.map((channel) => ({
        id: channel.id,
        code: channel.code,
        name: channel.name,
        method: channel.method,
        currency: channel.currency,
        min_cents: channel.minCents,
        max_cents: channel.maxCents,
        provider: channel.provider,
      })),
    };
  });

  app.post(
    `${USER_API_PREFIX}/orders`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = createOrderBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "validation.failed" });
      const headerClient = requestClientChannel(req);
      if (
        isStoreIapOnlyClient(headerClient) ||
        isStoreIapOnlyClient(parsed.data.client)
      ) {
        return reply.code(403).send({ error: "payment.store_iap_only" });
      }
      try {
        const order = await createPaymentOrder({
          userId: req.user!.sub,
          planId: parsed.data.plan_id,
          channelId: parsed.data.channel_id,
          couponCode: parsed.data.coupon_code,
          client: parsed.data.client ?? headerClient ?? undefined,
          jumpUrl: parsed.data.jump_url,
        });
        return reply.code(201).send({ order: publicOrder(order) });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode || 500;
        req.log.error({ err: error }, "create payment order failed");
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "payment.create_failed",
        });
      }
    },
  );

  app.get(
    `${USER_API_PREFIX}/orders`,
    { preHandler: [app.requireUser] },
    async (req) => {
      const q = req.query as { status?: string; limit?: string; offset?: string };
      const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
      const offset = Math.max(Number(q.offset) || 0, 0);
      const status = q.status?.trim() || undefined;
      const where = {
        userId: req.user!.sub,
        ...(status
          ? {
              status: status as
                | "pending"
                | "paid"
                | "provisioning"
                | "provisioned"
                | "failed"
                | "refunded"
                | "cancelled",
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include: {
            plan: { select: { id: true, code: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);
      return {
        total,
        items: rows.map((order) => ({
          ...publicOrder(order),
          plan: {
            id: order.plan.id,
            code: order.plan.code,
            name: order.plan.name,
          },
        })),
      };
    },
  );

  app.get(
    `${USER_API_PREFIX}/orders/:id`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const refresh = (req.query as { refresh?: string }).refresh === "true";
      try {
        if (refresh) {
          const order = await refreshPaymentOrder(req.user!.sub, id);
          if (!order) return reply.code(404).send({ error: "order.not_found" });
          return { order: publicOrder(order) };
        }
        const order = await prisma.order.findFirst({
          where: { id, userId: req.user!.sub },
          include: { plan: { select: { id: true, code: true, name: true } } },
        });
        if (!order) return reply.code(404).send({ error: "order.not_found" });
        return {
          order: {
            ...publicOrder(order),
            plan: {
              id: order.plan.id,
              code: order.plan.code,
              name: order.plan.name,
            },
          },
        };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: error instanceof Error ? error.message : "payment.query_failed",
        });
      }
    },
  );

  app.post(`${USER_API_PREFIX}/payments/callback/:providerCode`, async (req, reply) => {
    const { providerCode } = req.params as { providerCode: string };
    try {
      const provider = await prisma.paymentProvider.findUnique({
        where: { code: providerCode },
      });
      if (!provider) return reply.code(404).type("text/plain").send("FAIL");
      const callback = createPaymentAdapter(provider).verifyCallback(stringRecord(req.body));
      await applyPaymentResult(provider.code, callback);
      return reply.type("text/plain").send("SUCCESS");
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode || 500;
      req.log.error({ err: error, providerCode }, "payment callback failed");
      return reply.code(status).type("text/plain").send("FAIL");
    }
  });
};
