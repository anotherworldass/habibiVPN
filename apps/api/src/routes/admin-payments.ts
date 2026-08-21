import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { decryptCredentials, encryptCredentials } from "../payments/credentials.js";
import {
  createPaymentAdapter,
  supportedPaymentAdapters,
  validatePaymentProviderConfig,
} from "../payments/registry.js";

const configValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const channelBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  method: z.string().min(1).max(64),
  currency: z.string().min(1).max(8).default("CNY"),
  minCents: z.number().int().min(1),
  maxCents: z.number().int().min(1),
  enabled: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
const providerBody = z.object({
  code: z.string().regex(/^[a-z0-9_-]+$/).max(64),
  name: z.string().min(1).max(128),
  adapter: z.string().min(1).max(64),
  enabled: z.boolean().default(false),
  config: z.record(z.string(), configValue),
  secret: z.string().min(1).optional(),
  channels: z.array(channelBody).optional(),
});
const providerPatch = providerBody
  .omit({ code: true, channels: true })
  .partial()
  .extend({ secret: z.string().min(1).optional() });

async function requireSuperadmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.admin?.role !== "superadmin") {
    await reply.code(403).send({ error: "auth.superadmin_required" });
  }
}

function publicProvider<T extends {
  credentialsEncrypted: string | null;
  channels?: unknown;
}>(provider: T) {
  const { credentialsEncrypted, ...safe } = provider;
  let secret: string | null = null;
  let secretUnreadable = false;
  if (credentialsEncrypted) {
    try {
      secret = decryptCredentials(credentialsEncrypted).secret;
    } catch {
      secretUnreadable = true;
    }
  }
  return {
    ...safe,
    hasSecret: Boolean(credentialsEncrypted),
    secret,
    secretUnreadable,
  };
}

export const adminPaymentRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/payment`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/adapters`, async () => ({ adapters: supportedPaymentAdapters }));

  app.get(`${prefix}/providers`, async () => {
    const providers = await prisma.paymentProvider.findMany({
      include: { channels: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      orderBy: { createdAt: "asc" },
    });
    return { providers: providers.map(publicProvider) };
  });

  app.post(
    `${prefix}/providers`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const parsed = providerBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      try {
        const data = parsed.data;
        const config = validatePaymentProviderConfig(data.adapter, data.config);
        const provider = await prisma.paymentProvider.create({
          data: {
            code: data.code,
            name: data.name,
            adapter: data.adapter,
            enabled: data.enabled,
            config: config as Prisma.InputJsonValue,
            credentialsEncrypted: data.secret
              ? encryptCredentials({ secret: data.secret })
              : null,
            channels: data.channels ? { create: data.channels } : undefined,
          },
          include: { channels: true },
        });
        await writeAudit({
          actorType: "admin",
          actorId: req.admin!.sub,
          action: "payment.provider_create",
          targetType: "payment_provider",
          targetId: provider.id,
          ip: req.ip,
        });
        return reply.code(201).send({ provider: publicProvider(provider) });
      } catch (error) {
        const code = (error as { code?: string }).code;
        return reply.code(code === "P2002" ? 409 : 400).send({
          error: code === "P2002" ? "payment.provider_code_conflict" : error instanceof Error ? error.message : "validation.failed",
        });
      }
    },
  );

  app.patch(
    `${prefix}/providers/:id`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = providerPatch.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      const current = await prisma.paymentProvider.findUnique({ where: { id } });
      if (!current) return reply.code(404).send({ error: "payment.provider_not_found" });
      try {
        const adapter = parsed.data.adapter || current.adapter;
        const config =
          parsed.data.config !== undefined
            ? validatePaymentProviderConfig(adapter, parsed.data.config)
            : undefined;
        const provider = await prisma.paymentProvider.update({
          where: { id },
          data: {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.adapter !== undefined ? { adapter } : {}),
            ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
            ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
            ...(parsed.data.secret
              ? { credentialsEncrypted: encryptCredentials({ secret: parsed.data.secret }) }
              : {}),
          },
          include: { channels: { orderBy: { sortOrder: "asc" } } },
        });
        await writeAudit({
          actorType: "admin",
          actorId: req.admin!.sub,
          action: "payment.provider_update",
          targetType: "payment_provider",
          targetId: provider.id,
          meta: {
            changed: Object.keys(parsed.data).filter((key) => key !== "secret"),
            secretChanged: Boolean(parsed.data.secret),
          },
          ip: req.ip,
        });
        return { provider: publicProvider(provider) };
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "validation.failed",
        });
      }
    },
  );

  app.post(
    `${prefix}/providers/:id/channels`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = channelBody.safeParse(req.body);
      if (!parsed.success || parsed.success && parsed.data.maxCents < parsed.data.minCents) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const channel = await prisma.paymentChannel.create({
          data: { ...parsed.data, providerId: id },
        });
        return reply.code(201).send({ channel });
      } catch (error) {
        const code = (error as { code?: string }).code;
        return reply.code(code === "P2002" ? 409 : 400).send({
          error: code === "P2002" ? "payment.channel_code_conflict" : "payment.channel_create_failed",
        });
      }
    },
  );

  app.patch(
    `${prefix}/channels/:id`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = channelBody.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "validation.failed" });
      const current = await prisma.paymentChannel.findUnique({ where: { id } });
      if (!current) return reply.code(404).send({ error: "payment.channel_not_found" });
      const minCents = parsed.data.minCents ?? current.minCents;
      const maxCents = parsed.data.maxCents ?? current.maxCents;
      if (maxCents < minCents) return reply.code(400).send({ error: "payment.invalid_limits" });
      const channel = await prisma.paymentChannel.update({
        where: { id },
        data: parsed.data,
      });
      return { channel };
    },
  );

  app.post(
    `${prefix}/providers/:id/balance`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const provider = await prisma.paymentProvider.findUnique({ where: { id } });
      if (!provider) return reply.code(404).send({ error: "payment.provider_not_found" });
      try {
        const adapter = createPaymentAdapter(provider);
        if (!adapter.queryBalance) {
          return reply.code(400).send({ error: "payment.balance_not_supported" });
        }
        return { result: await adapter.queryBalance() };
      } catch (error) {
        return reply.code((error as { statusCode?: number }).statusCode || 502).send({
          error: error instanceof Error ? error.message : "payment.balance_query_failed",
        });
      }
    },
  );
};
