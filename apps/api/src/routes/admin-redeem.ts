import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import {
  generateCodesForBatch,
  listRedeemBatches,
  loadRedeemBatch,
  replaceRedeemBatchClients,
  serializeRedeemBatch,
  serializeRedeemCode,
} from "../services/growth/redeem.js";

const clientEnum = z.enum([
  "ios_appstore",
  "ios_alt",
  "android_play",
  "android_direct",
  "h5",
  "windows",
  "macos",
]);

const batchBodyBase = z.object({
  name: z.string().min(1).max(128),
  planId: z.string().min(1).optional().nullable(),
  validitySeconds: z.number().int().positive().optional().nullable(),
  dataLimitBytes: z.number().int().min(0).optional().nullable(),
  stackMode: z.enum(["extend_active", "create_campaign_slot"]).optional(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  maxRedemptionsPerUser: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  remark: z.string().max(2000).optional().nullable(),
  clients: z
    .array(z.object({ client: clientEnum, enabled: z.boolean().optional() }))
    .optional(),
});

const batchBody = batchBodyBase.refine(
  (b) => Boolean(b.planId) || Boolean(b.validitySeconds),
  { message: "planId_or_validitySeconds_required" },
);

const batchPatch = batchBodyBase.partial();

export const adminRedeemRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/redeem`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/meta`, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const plans = await prisma.plan.findMany({
      where: { projectId, enabled: true, isFreeClaimable: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        validitySeconds: true,
        priceCents: true,
        currency: true,
      },
    });
    return { clients: CLIENT_CHANNELS, plans };
  });

  app.get(`${prefix}/batches`, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const rows = await listRedeemBatches(projectId);
    return { batches: rows.map(serializeRedeemBatch) };
  });

  app.post(`${prefix}/batches`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const body = batchBody.parse(req.body);
    if (body.planId) {
      const plan = await prisma.plan.findFirst({
        where: { id: body.planId, projectId },
      });
      if (!plan) return reply.code(400).send({ error: "plan.not_found" });
    }
    const created = await prisma.redeemBatch.create({
      data: {
        projectId,
        name: body.name,
        planId: body.planId || null,
        validitySeconds: body.planId ? null : body.validitySeconds ?? null,
        dataLimitBytes:
          body.dataLimitBytes == null ? null : BigInt(body.dataLimitBytes),
        stackMode: body.stackMode || "extend_active",
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        maxRedemptionsPerUser: body.maxRedemptionsPerUser ?? 1,
        enabled: body.enabled !== false,
        remark: body.remark ?? null,
      },
    });
    await replaceRedeemBatchClients(created.id, body.clients || []);
    const full = await loadRedeemBatch(created.id);
    await writeAudit({
      actorType: "admin",
      actorId: req.admin?.sub,
      action: "redeem.batch_create",
      targetType: "redeem_batch",
      targetId: created.id,
    });
    return reply.code(201).send({ batch: serializeRedeemBatch(full!) });
  });

  app.patch(`${prefix}/batches/:id`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const body = batchPatch.parse(req.body);
    const existing = await loadRedeemBatch(id);
    if (!existing || existing.projectId !== projectId) {
      return reply.code(404).send({ error: "redeem.batch_not_found" });
    }
    if (body.planId) {
      const plan = await prisma.plan.findFirst({
        where: { id: body.planId, projectId },
      });
      if (!plan) return reply.code(400).send({ error: "plan.not_found" });
    }
    await prisma.redeemBatch.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.planId !== undefined ? { planId: body.planId } : {}),
        ...(body.validitySeconds !== undefined
          ? { validitySeconds: body.validitySeconds }
          : {}),
        ...(body.dataLimitBytes !== undefined
          ? {
              dataLimitBytes:
                body.dataLimitBytes == null
                  ? null
                  : BigInt(body.dataLimitBytes),
            }
          : {}),
        ...(body.stackMode != null ? { stackMode: body.stackMode } : {}),
        ...(body.startAt !== undefined
          ? { startAt: body.startAt ? new Date(body.startAt) : null }
          : {}),
        ...(body.endAt !== undefined
          ? { endAt: body.endAt ? new Date(body.endAt) : null }
          : {}),
        ...(body.maxRedemptionsPerUser != null
          ? { maxRedemptionsPerUser: body.maxRedemptionsPerUser }
          : {}),
        ...(body.enabled != null ? { enabled: body.enabled } : {}),
        ...(body.remark !== undefined ? { remark: body.remark } : {}),
      },
    });
    if (body.clients) await replaceRedeemBatchClients(id, body.clients);
    const full = await loadRedeemBatch(id);
    return { batch: serializeRedeemBatch(full!) };
  });

  app.post(`${prefix}/batches/:id/generate`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({ count: z.number().int().min(1).max(5000) })
      .parse(req.body);
    const existing = await loadRedeemBatch(id);
    if (!existing || existing.projectId !== projectId) {
      return reply.code(404).send({ error: "redeem.batch_not_found" });
    }
    const codes = await generateCodesForBatch(id, body.count);
    await writeAudit({
      actorType: "admin",
      actorId: req.admin?.sub,
      action: "redeem.codes_generate",
      targetType: "redeem_batch",
      targetId: id,
      meta: { count: codes.length },
    });
    return { count: codes.length, codes };
  });

  app.get(`${prefix}/batches/:id/codes`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const q = req.query as {
      page?: string;
      page_size?: string;
      status?: string;
      export?: string;
    };
    const existing = await loadRedeemBatch(id);
    if (!existing || existing.projectId !== projectId) {
      return reply.code(404).send({ error: "redeem.batch_not_found" });
    }

    const where = {
      batchId: id,
      ...(q.status === "unused" ||
      q.status === "redeemed" ||
      q.status === "disabled"
        ? { status: q.status as "unused" | "redeemed" | "disabled" }
        : {}),
    };

    if (q.export === "csv") {
      const all = await prisma.redeemCode.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
      const lines = ["code,status,redeemed_at"];
      for (const c of all) {
        lines.push(
          `${c.code},${c.status},${c.redeemedAt?.toISOString() || ""}`,
        );
      }
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header(
        "content-disposition",
        `attachment; filename="redeem_${id}.csv"`,
      );
      return lines.join("\n");
    }

    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.page_size) || 50));
    const [total, items] = await Promise.all([
      prisma.redeemCode.count({ where }),
      prisma.redeemCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      page_size: pageSize,
      codes: items.map(serializeRedeemCode),
    };
  });

  app.post(`${prefix}/codes/:id/disable`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const code = await prisma.redeemCode.findUnique({
      where: { id },
      include: { batch: true },
    });
    if (!code || code.batch.projectId !== projectId) {
      return reply.code(404).send({ error: "redeem.code_not_found" });
    }
    if (code.status === "redeemed") {
      return reply.code(400).send({ error: "redeem.code_already_used" });
    }
    const saved = await prisma.redeemCode.update({
      where: { id },
      data: { status: "disabled" },
    });
    return { code: serializeRedeemCode(saved) };
  });
};
