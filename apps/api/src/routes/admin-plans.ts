import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { serializePlan } from "../lib/serialize.js";

const planBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.number().int().min(0),
  currency: z.string().min(1).max(8).default("USD"),
  upstreamPlanRef: z.string().max(128).optional().nullable(),
  validitySeconds: z.number().int().positive().optional().nullable(),
  /** GB; converted to bytes server-side. 0 / null = unlimited */
  dataLimitGb: z.number().min(0).optional().nullable(),
  dataLimitBytes: z.number().int().min(0).optional().nullable(),
  enabled: z.boolean().optional().default(true),
  isFreeClaimable: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

const planPatch = planBody.partial().extend({
  code: z.string().min(1).max(64).optional(),
});

function toDataLimitBytes(input: {
  dataLimitGb?: number | null;
  dataLimitBytes?: number | null;
}): bigint | null | undefined {
  if (input.dataLimitBytes != null) {
    return BigInt(input.dataLimitBytes);
  }
  if (input.dataLimitGb == null) return undefined;
  if (input.dataLimitGb === 0) return BigInt(0);
  return BigInt(Math.round(input.dataLimitGb * 1024 ** 3));
}

export const adminPlansRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/plans`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(prefix, async (req) => {
    const q = req.query as { enabled?: string };
    const plans = await prisma.plan.findMany({
      where:
        q.enabled === "true"
          ? { enabled: true }
          : q.enabled === "false"
            ? { enabled: false }
            : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return { plans: plans.map(serializePlan) };
  });

  app.get(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) return reply.code(404).send({ error: "plan.not_found" });
    return { plan: serializePlan(plan) };
  });

  app.post(prefix, async (req, reply) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const bytes = toDataLimitBytes(data);
    try {
      const plan = await prisma.plan.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          priceCents: data.priceCents,
          currency: data.currency,
          upstreamPlanRef: data.upstreamPlanRef ?? null,
          validitySeconds: data.validitySeconds ?? null,
          dataLimitBytes: bytes === undefined ? null : bytes,
          enabled: data.enabled ?? true,
          isFreeClaimable: data.isFreeClaimable ?? false,
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return reply.code(201).send({ plan: serializePlan(plan) });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "plan.code_conflict" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = planPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const bytes = toDataLimitBytes(data);
    try {
      const plan = await prisma.plan.update({
        where: { id },
        data: {
          ...(data.code != null ? { code: data.code } : {}),
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.priceCents != null ? { priceCents: data.priceCents } : {}),
          ...(data.currency != null ? { currency: data.currency } : {}),
          ...(data.upstreamPlanRef !== undefined
            ? { upstreamPlanRef: data.upstreamPlanRef }
            : {}),
          ...(data.validitySeconds !== undefined
            ? { validitySeconds: data.validitySeconds }
            : {}),
          ...(bytes !== undefined ? { dataLimitBytes: bytes } : {}),
          ...(data.enabled != null ? { enabled: data.enabled } : {}),
          ...(data.isFreeClaimable != null
            ? { isFreeClaimable: data.isFreeClaimable }
            : {}),
          ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        },
      });
      return { plan: serializePlan(plan) };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return reply.code(404).send({ error: "plan.not_found" });
      }
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "plan.code_conflict" });
      }
      throw err;
    }
  });

  app.delete(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const orderCount = await prisma.order.count({ where: { planId: id } });
    if (orderCount > 0) {
      // Soft-disable instead of hard delete when referenced
      const plan = await prisma.plan.update({
        where: { id },
        data: { enabled: false },
      });
      return {
        plan: serializePlan(plan),
        soft_disabled: true,
        message: "已有订单引用，已改为下架而非删除",
      };
    }
    try {
      await prisma.plan.delete({ where: { id } });
      return { ok: true };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        return reply.code(404).send({ error: "plan.not_found" });
      }
      throw err;
    }
  });
};
