import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ADMIN_API_PREFIX,
  normalizeAppCopyI18n,
  pickAppCopy,
} from "@habibi/shared";
import type { PlanGroup, Prisma } from "@prisma/client";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { asCopyMap } from "../services/plan-i18n.js";

const copyI18nSchema = z.record(z.string()).optional();

const groupBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128).optional(),
  nameI18n: copyI18nSchema,
  name_i18n: copyI18nSchema,
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const groupPatch = groupBody.partial().extend({
  code: z.string().min(1).max(64).optional(),
});

function resolveGroupCopy(input: {
  name?: string | null;
  nameI18n?: unknown;
  name_i18n?: unknown;
}): { name: string; nameI18n: Prisma.InputJsonValue } {
  let nameI18n = normalizeAppCopyI18n(input.name_i18n ?? input.nameI18n, 128);
  if (!Object.keys(nameI18n).length && input.name?.trim()) {
    nameI18n = { zh: input.name.trim().slice(0, 128) };
  }
  const name =
    pickAppCopy(nameI18n, "zh").text ||
    pickAppCopy(nameI18n, "en").text ||
    Object.values(nameI18n).find((v) => !!v?.trim()) ||
    "";
  if (!name) {
    throw Object.assign(new Error("plan_group.name_required"), {
      statusCode: 400,
    });
  }
  return { name, nameI18n: nameI18n as Prisma.InputJsonValue };
}

export function serializePlanGroup(g: PlanGroup) {
  const nameI18n = asCopyMap(g.nameI18n);
  if (!Object.keys(nameI18n).length && g.name) nameI18n.zh = g.name;
  return {
    id: g.id,
    projectId: g.projectId,
    code: g.code,
    name: g.name,
    nameI18n,
    enabled: g.enabled,
    sortOrder: g.sortOrder,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export const adminPlanGroupsRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/plan-groups`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(prefix, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const groups = await prisma.planGroup.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return {
        project_id: projectId,
        groups: groups.map(serializePlanGroup),
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(prefix, async (req, reply) => {
    const parsed = groupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    let copy;
    try {
      copy = resolveGroupCopy(data);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "plan_group.name_required",
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const group = await prisma.planGroup.create({
        data: {
          projectId,
          code: data.code.trim(),
          name: copy.name,
          nameI18n: copy.nameI18n,
          enabled: data.enabled ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });
      return reply.code(201).send({ group: serializePlanGroup(group) });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "plan_group.code_conflict" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = groupPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    try {
      const projectId = await resolveAdminProjectId(req);
      const existing = await prisma.planGroup.findFirst({
        where: { id, projectId },
      });
      if (!existing) {
        return reply.code(404).send({ error: "plan_group.not_found" });
      }

      let name: string | undefined;
      let nameI18n: Prisma.InputJsonValue | undefined;
      if (
        data.name !== undefined ||
        data.nameI18n !== undefined ||
        data.name_i18n !== undefined
      ) {
        const existingMap = asCopyMap(existing.nameI18n);
        const incoming = normalizeAppCopyI18n(
          data.name_i18n ?? data.nameI18n,
          128,
        );
        const merged = { ...existingMap };
        if (Object.keys(incoming).length) {
          for (const [k, v] of Object.entries(incoming)) {
            if (!v?.trim()) delete merged[k];
            else merged[k] = v;
          }
        }
        if (data.name?.trim() && !Object.keys(incoming).length) {
          merged.zh = data.name.trim().slice(0, 128);
        }
        const resolved = resolveGroupCopy({
          name: data.name ?? existing.name,
          nameI18n: merged,
        });
        name = resolved.name;
        nameI18n = resolved.nameI18n;
      }

      const group = await prisma.planGroup.update({
        where: { id },
        data: {
          ...(data.code != null ? { code: data.code.trim() } : {}),
          ...(name != null ? { name } : {}),
          ...(nameI18n !== undefined ? { nameI18n } : {}),
          ...(data.enabled != null ? { enabled: data.enabled } : {}),
          ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
        },
      });
      return { group: serializePlanGroup(group) };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "plan_group.code_conflict" });
      }
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.delete(`${prefix}/:id`, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const projectId = await resolveAdminProjectId(req);
      const existing = await prisma.planGroup.findFirst({
        where: { id, projectId },
      });
      if (!existing) {
        return reply.code(404).send({ error: "plan_group.not_found" });
      }
      // Plan.groupId onDelete SetNull — plans become ungrouped
      await prisma.planGroup.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
