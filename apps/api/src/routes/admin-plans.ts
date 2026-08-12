import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import {
  CLIENT_CHANNELS,
  ensurePlanCatalogOffers,
  listCatalogForClient,
  parseClientChannel,
  replacePlanCatalog,
  replacePlanStoreProducts,
  serializePlanAdmin,
} from "../services/catalog.js";
import {
  mergePlanCopyPatch,
  resolvePlanCopyInput,
} from "../services/plan-i18n.js";

const catalogOfferSchema = z.object({
  client: z.enum([
    "ios_appstore",
    "ios_alt",
    "android_play",
    "android_direct",
    "h5",
    "windows",
    "macos",
  ]),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  paymentMode: z.enum(["inherit", "iap_only", "web_only", "iap_or_web"]).optional(),
});

const storeProductSchema = z.object({
  store: z.enum(["app_store", "google_play"]),
  productId: z.string().min(1).max(191),
  productKind: z.enum([
    "consumable",
    "non_consumable",
    "auto_renewing",
    "non_renewing",
  ]),
  /** Marketing / catalog only — App Store Connect controls actual trial */
  trialDays: z.number().int().min(0).max(3650).optional().nullable(),
  enabled: z.boolean().optional(),
});

const copyI18nSchema = z.record(z.string()).optional();

const planBody = z.object({
  code: z.string().min(1).max(64),
  /** Legacy single-locale; prefer nameI18n / name_i18n */
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).optional().nullable(),
  nameI18n: copyI18nSchema,
  descriptionI18n: copyI18nSchema,
  name_i18n: copyI18nSchema,
  description_i18n: copyI18nSchema,
  priceCents: z.number().int().min(0),
  currency: z.string().min(1).max(8).default("USD"),
  upstreamPlanRef: z.string().max(128).optional().nullable(),
  validitySeconds: z.number().int().positive().optional().nullable(),
  /** Calendar months for expire_at; mutually exclusive with validitySeconds */
  validityCalendarMonths: z.number().int().positive().max(120).optional().nullable(),
  /** Catalog billing cycle (seconds); not used for WireRaw provision */
  billingPeriodSeconds: z.number().int().positive().optional().nullable(),
  /** GB; converted to bytes server-side. 0 / null = unlimited */
  dataLimitGb: z.number().min(0).optional().nullable(),
  dataLimitBytes: z.number().int().min(0).optional().nullable(),
  deviceSlots: z.number().int().min(1).max(100).optional().default(1),
  billingType: z.enum(["one_time", "renewable"]).optional().default("one_time"),
  /** WireRaw traffic cycle reset */
  resetPolicy: z
    .enum(["no_reset", "day", "week", "month", "year", "custom"])
    .optional()
    .default("no_reset"),
  /** Go duration e.g. 720h; required when resetPolicy=custom */
  customResetInterval: z.string().max(64).optional().nullable(),
  enabled: z.boolean().optional().default(true),
  isFreeClaimable: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
  /** Catalog display group; null clears */
  groupId: z.string().min(1).nullable().optional(),
  group_id: z.string().min(1).nullable().optional(),
  catalogOffers: z.array(catalogOfferSchema).optional(),
  storeProducts: z.array(storeProductSchema).optional(),
});

const GO_DURATION_RE = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;

function resolveResetFields(data: {
  resetPolicy?: string;
  customResetInterval?: string | null;
}): { resetPolicy?: string; customResetInterval?: string | null } {
  if (data.resetPolicy === undefined && data.customResetInterval === undefined) {
    return {};
  }
  const resetPolicy = data.resetPolicy ?? "no_reset";
  if (resetPolicy === "custom") {
    const interval = data.customResetInterval?.trim() || "";
    if (!interval || !GO_DURATION_RE.test(interval)) {
      throw Object.assign(new Error("plan.custom_reset_interval_invalid"), {
        statusCode: 400,
      });
    }
    return { resetPolicy, customResetInterval: interval };
  }
  return { resetPolicy, customResetInterval: null };
}

/** Prefer calendar months when set; clears the other field. */
function resolveValidityFields(data: {
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
}): {
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
} {
  if (
    data.validitySeconds === undefined &&
    data.validityCalendarMonths === undefined
  ) {
    return {};
  }
  if (
    data.validityCalendarMonths != null &&
    data.validityCalendarMonths > 0
  ) {
    return {
      validityCalendarMonths: data.validityCalendarMonths,
      validitySeconds: null,
    };
  }
  return {
    validityCalendarMonths: null,
    validitySeconds:
      data.validitySeconds != null && data.validitySeconds > 0
        ? data.validitySeconds
        : null,
  };
}

async function resolveGroupIdForProject(
  projectId: string,
  raw: string | null | undefined,
): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const group = await prisma.planGroup.findFirst({
    where: { id: raw, projectId },
    select: { id: true },
  });
  if (!group) {
    throw Object.assign(new Error("plan_group.not_found"), { statusCode: 400 });
  }
  return group.id;
}

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

async function loadPlanAdmin(id: string) {
  return prisma.plan.findUnique({
    where: { id },
    include: {
      group: true,
      catalogOffers: { orderBy: { client: "asc" } },
      storeProducts: { orderBy: [{ store: "asc" }, { productId: "asc" }] },
    },
  });
}

async function requirePlanInProject(id: string, projectId: string) {
  const plan = await loadPlanAdmin(id);
  if (!plan || plan.projectId !== projectId) return null;
  return plan;
}

export const adminPlansRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/plans`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/meta/clients`, async () => ({
    clients: CLIENT_CHANNELS,
    payment_modes: ["inherit", "iap_only", "web_only", "iap_or_web"],
    billing_types: ["one_time", "renewable"],
    reset_policies: ["no_reset", "day", "week", "month", "year", "custom"],
    stores: ["app_store", "google_play"],
    product_kinds: [
      "consumable",
      "non_consumable",
      "auto_renewing",
      "non_renewing",
    ],
  }));

  /** Same view as user GET /plans?client= — for ops preview */
  app.get(`${prefix}/catalog-preview`, async (req, reply) => {
    try {
      const q = req.query as { client?: string; locale?: string; lang?: string };
      const projectId = await resolveAdminProjectId(req);
      const client = parseClientChannel(q.client || "h5");
      const locale = q.locale || q.lang || null;
      const { plans, groups } = await listCatalogForClient({
        client,
        projectId,
        locale,
      });
      return {
        client,
        project_id: projectId,
        locale,
        groups,
        plans,
        count: plans.length,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(prefix, async (req, reply) => {
    try {
      const q = req.query as { enabled?: string; client?: string };
      const projectId = await resolveAdminProjectId(req);
      const plans = await prisma.plan.findMany({
        where: {
          projectId,
          ...(q.enabled === "true"
            ? { enabled: true }
            : q.enabled === "false"
              ? { enabled: false }
              : {}),
        },
        include: {
          group: true,
          catalogOffers: { orderBy: { client: "asc" } },
          storeProducts: true,
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });

      let list = plans.map(serializePlanAdmin);
      if (q.client) {
        list = list.filter((p) =>
          p.catalogOffers?.some((o) => o.client === q.client && o.enabled),
        );
      }
      return { project_id: projectId, plans: list };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /**
   * Reorder plans. Body `{ ids }` may be a full list or a filtered subset:
   * subset ids keep their slots in the global order, filled in the new relative order.
   * Must be registered before /:id.
   */
  app.post(`${prefix}/reorder`, async (req, reply) => {
    const parsed = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(500),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const ids = parsed.data.ids;
      const unique = new Set(ids);
      if (unique.size !== ids.length) {
        return reply.code(400).send({ error: "plan.reorder_duplicate_ids" });
      }
      const all = await prisma.plan.findMany({
        where: { projectId },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      });
      const allIds = all.map((p) => p.id);
      const allSet = new Set(allIds);
      for (const id of ids) {
        if (!allSet.has(id)) {
          return reply.code(400).send({ error: "plan.reorder_unknown_ids" });
        }
      }
      const moving = new Set(ids);
      let cursor = 0;
      const next = allIds.map((id) => (moving.has(id) ? ids[cursor++]! : id));
      await prisma.$transaction(
        next.map((id, index) =>
          prisma.plan.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );
      return { ok: true, count: ids.length, total: next.length };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/:id`, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const projectId = await resolveAdminProjectId(req);
      const plan = await requirePlanInProject(id, projectId);
      if (!plan) return reply.code(404).send({ error: "plan.not_found" });
      return { plan: serializePlanAdmin(plan) };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(prefix, async (req, reply) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const bytes = toDataLimitBytes(data);
    let copy;
    try {
      copy = resolvePlanCopyInput(data);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "plan.name_required",
      });
    }
    let resetFields: { resetPolicy?: string; customResetInterval?: string | null };
    try {
      resetFields = resolveResetFields(data);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "plan.reset_invalid",
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const groupId = await resolveGroupIdForProject(
        projectId,
        data.groupId !== undefined ? data.groupId : data.group_id,
      );
      const validity = resolveValidityFields({
        validitySeconds: data.validitySeconds,
        validityCalendarMonths: data.validityCalendarMonths,
      });
      const plan = await prisma.plan.create({
        data: {
          projectId,
          code: data.code,
          name: copy.name,
          description: copy.description,
          nameI18n: copy.nameI18n,
          descriptionI18n: copy.descriptionI18n,
          priceCents: data.priceCents,
          currency: data.currency,
          upstreamPlanRef: data.upstreamPlanRef ?? null,
          validitySeconds: validity.validitySeconds ?? null,
          validityCalendarMonths: validity.validityCalendarMonths ?? null,
          billingPeriodSeconds: data.billingPeriodSeconds ?? null,
          dataLimitBytes: bytes === undefined ? null : bytes,
          deviceSlots: data.deviceSlots ?? 1,
          billingType: data.billingType ?? "one_time",
          resetPolicy: (resetFields.resetPolicy as
            | "no_reset"
            | "day"
            | "week"
            | "month"
            | "year"
            | "custom") ?? "no_reset",
          customResetInterval: resetFields.customResetInterval ?? null,
          enabled: data.enabled ?? true,
          isFreeClaimable: data.isFreeClaimable ?? false,
          sortOrder: data.sortOrder ?? 0,
          ...(groupId !== undefined ? { groupId } : {}),
        },
      });
      await ensurePlanCatalogOffers(plan.id);
      if (data.catalogOffers?.length) {
        await replacePlanCatalog(plan.id, data.catalogOffers);
      }
      if (data.storeProducts) {
        await replacePlanStoreProducts(plan.id, data.storeProducts);
      }
      const full = await loadPlanAdmin(plan.id);
      return reply.code(201).send({ plan: serializePlanAdmin(full!) });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status) {
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
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

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = planPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const bytes = toDataLimitBytes(data);
    try {
      const projectId = await resolveAdminProjectId(req);
      const existing = await requirePlanInProject(id, projectId);
      if (!existing) return reply.code(404).send({ error: "plan.not_found" });
      let copyPatch;
      try {
        copyPatch = mergePlanCopyPatch(existing, data);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "plan.name_required",
        });
      }
      const groupId = await resolveGroupIdForProject(
        projectId,
        data.groupId !== undefined ? data.groupId : data.group_id,
      );
      let resetPatch: {
        resetPolicy?: string;
        customResetInterval?: string | null;
      };
      try {
        resetPatch = resolveResetFields({
          resetPolicy: data.resetPolicy,
          customResetInterval: data.customResetInterval,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 400;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "plan.reset_invalid",
        });
      }
      await prisma.plan.update({
        where: { id },
        data: {
          ...(data.code != null ? { code: data.code } : {}),
          ...(copyPatch.name != null ? { name: copyPatch.name } : {}),
          ...(copyPatch.description !== undefined
            ? { description: copyPatch.description }
            : {}),
          ...(copyPatch.nameI18n !== undefined
            ? { nameI18n: copyPatch.nameI18n }
            : {}),
          ...(copyPatch.descriptionI18n !== undefined
            ? { descriptionI18n: copyPatch.descriptionI18n }
            : {}),
          ...(data.priceCents != null ? { priceCents: data.priceCents } : {}),
          ...(data.currency != null ? { currency: data.currency } : {}),
          ...(data.upstreamPlanRef !== undefined
            ? { upstreamPlanRef: data.upstreamPlanRef }
            : {}),
          ...(() => {
            const validity = resolveValidityFields({
              validitySeconds: data.validitySeconds,
              validityCalendarMonths: data.validityCalendarMonths,
            });
            return {
              ...(validity.validitySeconds !== undefined
                ? { validitySeconds: validity.validitySeconds }
                : {}),
              ...(validity.validityCalendarMonths !== undefined
                ? {
                    validityCalendarMonths: validity.validityCalendarMonths,
                  }
                : {}),
            };
          })(),
          ...(data.billingPeriodSeconds !== undefined
            ? { billingPeriodSeconds: data.billingPeriodSeconds }
            : {}),
          ...(bytes !== undefined ? { dataLimitBytes: bytes } : {}),
          ...(data.deviceSlots != null ? { deviceSlots: data.deviceSlots } : {}),
          ...(data.billingType != null ? { billingType: data.billingType } : {}),
          ...(resetPatch.resetPolicy != null
            ? {
                resetPolicy: resetPatch.resetPolicy as
                  | "no_reset"
                  | "day"
                  | "week"
                  | "month"
                  | "year"
                  | "custom",
              }
            : {}),
          ...(resetPatch.customResetInterval !== undefined
            ? { customResetInterval: resetPatch.customResetInterval }
            : {}),
          ...(data.enabled != null ? { enabled: data.enabled } : {}),
          ...(data.isFreeClaimable != null
            ? { isFreeClaimable: data.isFreeClaimable }
            : {}),
          ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
          ...(groupId !== undefined ? { groupId } : {}),
        },
      });
      await ensurePlanCatalogOffers(id);
      if (data.catalogOffers) {
        await replacePlanCatalog(id, data.catalogOffers);
      }
      if (data.storeProducts) {
        await replacePlanStoreProducts(id, data.storeProducts);
      }
      const full = await loadPlanAdmin(id);
      return { plan: serializePlanAdmin(full!) };
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status) {
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
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

  app.put(`${prefix}/:id/catalog`, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const parsed = z.object({ offers: z.array(catalogOfferSchema) }).safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      const projectId = await resolveAdminProjectId(req);
      const plan = await requirePlanInProject(id, projectId);
      if (!plan) return reply.code(404).send({ error: "plan.not_found" });
      const offers = await replacePlanCatalog(id, parsed.data.offers);
      return { offers };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.put(`${prefix}/:id/store-products`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ products: z.array(storeProductSchema) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const plan = await requirePlanInProject(id, projectId);
      if (!plan) return reply.code(404).send({ error: "plan.not_found" });
      const products = await replacePlanStoreProducts(id, parsed.data.products);
      return { products };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "store_product.conflict" });
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
      const existing = await requirePlanInProject(id, projectId);
      if (!existing) return reply.code(404).send({ error: "plan.not_found" });

      const orderCount = await prisma.order.count({ where: { planId: id } });
      if (orderCount > 0) {
        const plan = await prisma.plan.update({
          where: { id },
          data: { enabled: false },
        });
        await prisma.planCatalogOffer.updateMany({
          where: { planId: id },
          data: { enabled: false },
        });
        const full = await loadPlanAdmin(plan.id);
        return {
          plan: serializePlanAdmin(full!),
          soft_disabled: true,
          message: "已有订单引用，已改为下架而非删除",
        };
      }
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
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
