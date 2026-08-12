import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import {
  replaceCouponClients,
  serializeCoupon,
  type CouponWithClients,
} from "../services/growth/coupons.js";

const clientEnum = z.enum([
  "ios_appstore",
  "ios_alt",
  "android_play",
  "android_direct",
  "h5",
  "windows",
  "macos",
]);

const DEFAULT_WEB_CLIENTS: Array<{ client: z.infer<typeof clientEnum>; enabled: boolean }> = [
  { client: "h5", enabled: true },
  { client: "android_direct", enabled: true },
  { client: "windows", enabled: true },
  { client: "macos", enabled: true },
  { client: "ios_alt", enabled: true },
  { client: "ios_appstore", enabled: false },
  { client: "android_play", enabled: false },
];

const couponBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  discountType: z.enum(["percent", "fixed_amount"]),
  /** percent: percent 1-100; fixed_amount: cents */
  discountValue: z.number().int().positive(),
  minOrderCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().positive().optional().nullable(),
  planIds: z.array(z.string()).optional(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  totalLimit: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().min(1).optional(),
  remark: z.string().max(2000).optional().nullable(),
  clients: z
    .array(z.object({ client: clientEnum, enabled: z.boolean().optional() }))
    .optional(),
});

function toDbDiscountValue(
  type: "percent" | "fixed_amount",
  value: number,
): number {
  if (type === "percent") {
    return Math.round(Math.max(0, Math.min(100, value)) * 100);
  }
  return value;
}

function fromDbDiscountValue(
  type: "percent" | "fixed_amount",
  value: number,
): number {
  if (type === "percent") return value / 100;
  return value;
}

async function loadCoupon(id: string): Promise<CouponWithClients | null> {
  return prisma.coupon.findUnique({
    where: { id },
    include: { clients: { orderBy: { client: "asc" } } },
  });
}

function serializeAdmin(c: CouponWithClients) {
  const base = serializeCoupon(c);
  return {
    ...base,
    discount_value_display: fromDbDiscountValue(c.discountType, c.discountValue),
  };
}

export const adminCouponRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/coupons`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/meta`, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const plans = await prisma.plan.findMany({
      where: { projectId, enabled: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, priceCents: true },
    });
    return {
      clients: CLIENT_CHANNELS,
      plans,
      default_clients: DEFAULT_WEB_CLIENTS,
    };
  });

  app.get(prefix, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const rows = await prisma.coupon.findMany({
      where: { projectId },
      include: { clients: { orderBy: { client: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return { coupons: rows.map(serializeAdmin) };
  });

  app.post(prefix, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const body = couponBody.parse(req.body);
    const code = body.code.trim().toUpperCase();
    try {
      const created = await prisma.coupon.create({
        data: {
          projectId,
          code,
          name: body.name,
          discountType: body.discountType,
          discountValue: toDbDiscountValue(body.discountType, body.discountValue),
          minOrderCents: body.minOrderCents ?? 0,
          maxDiscountCents: body.maxDiscountCents ?? null,
          planIdsJson: (body.planIds || []) as Prisma.InputJsonValue,
          startAt: body.startAt ? new Date(body.startAt) : null,
          endAt: body.endAt ? new Date(body.endAt) : null,
          status: body.status || "draft",
          totalLimit: body.totalLimit ?? null,
          perUserLimit: body.perUserLimit ?? 1,
          remark: body.remark ?? null,
        },
      });
      await replaceCouponClients(
        created.id,
        body.clients?.length ? body.clients : DEFAULT_WEB_CLIENTS,
      );
      const full = await loadCoupon(created.id);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "coupon.create",
        targetType: "coupon",
        targetId: created.id,
      });
      return reply.code(201).send({ coupon: serializeAdmin(full!) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Unique constraint")) {
        return reply.code(409).send({ error: "coupon.code_taken" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const body = couponBody.partial().parse(req.body);
    const existing = await loadCoupon(id);
    if (!existing || existing.projectId !== projectId) {
      return reply.code(404).send({ error: "coupon.not_found" });
    }

    const data: Prisma.CouponUpdateInput = {};
    if (body.code != null) data.code = body.code.trim().toUpperCase();
    if (body.name != null) data.name = body.name;
    if (body.discountType != null) data.discountType = body.discountType;
    if (body.discountValue != null) {
      const type = body.discountType || existing.discountType;
      data.discountValue = toDbDiscountValue(type, body.discountValue);
    }
    if (body.minOrderCents != null) data.minOrderCents = body.minOrderCents;
    if (body.maxDiscountCents !== undefined) {
      data.maxDiscountCents = body.maxDiscountCents;
    }
    if (body.planIds) data.planIdsJson = body.planIds as Prisma.InputJsonValue;
    if (body.startAt !== undefined) {
      data.startAt = body.startAt ? new Date(body.startAt) : null;
    }
    if (body.endAt !== undefined) {
      data.endAt = body.endAt ? new Date(body.endAt) : null;
    }
    if (body.status != null) data.status = body.status;
    if (body.totalLimit !== undefined) data.totalLimit = body.totalLimit;
    if (body.perUserLimit != null) data.perUserLimit = body.perUserLimit;
    if (body.remark !== undefined) data.remark = body.remark;

    await prisma.coupon.update({ where: { id }, data });
    if (body.clients) await replaceCouponClients(id, body.clients);
    const full = await loadCoupon(id);
    return { coupon: serializeAdmin(full!) };
  });
};
