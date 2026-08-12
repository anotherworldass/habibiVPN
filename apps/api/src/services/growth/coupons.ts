import type { ClientChannel, Coupon, CouponClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { computeCouponDiscount } from "./coupon-pricing.js";

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function asPlanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

export type CouponWithClients = Coupon & { clients: CouponClient[] };

export function serializeCoupon(c: CouponWithClients) {
  return {
    id: c.id,
    project_id: c.projectId,
    code: c.code,
    name: c.name,
    discount_type: c.discountType,
    discount_value: c.discountValue,
    min_order_cents: c.minOrderCents,
    max_discount_cents: c.maxDiscountCents,
    plan_ids: asPlanIds(c.planIdsJson),
    start_at: c.startAt?.toISOString() || null,
    end_at: c.endAt?.toISOString() || null,
    status: c.status,
    total_limit: c.totalLimit,
    per_user_limit: c.perUserLimit,
    remark: c.remark,
    clients: c.clients.map((x) => ({
      client: x.client,
      enabled: x.enabled,
    })),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

function withinWindow(c: Coupon, now = new Date()): boolean {
  if (c.startAt && c.startAt.getTime() > now.getTime()) return false;
  if (c.endAt && c.endAt.getTime() < now.getTime()) return false;
  return true;
}

function clientAllowed(clients: CouponClient[], client: ClientChannel): boolean {
  const row = clients.find((x) => x.client === client);
  return Boolean(row?.enabled);
}

/** Orders that currently occupy a coupon slot */
const OCCUPYING_STATUSES = [
  "pending",
  "paid",
  "provisioning",
  "provisioned",
] as const;

export async function countCouponOccupancy(input: {
  couponId: string;
  userId?: string;
}): Promise<number> {
  return prisma.order.count({
    where: {
      couponId: input.couponId,
      status: { in: [...OCCUPYING_STATUSES] },
      ...(input.userId ? { userId: input.userId } : {}),
    },
  });
}

export async function validateAndPriceCoupon(input: {
  projectId: string;
  userId: string;
  couponCode: string;
  planId: string;
  listPriceCents: number;
  client: ClientChannel;
}): Promise<{
  coupon: CouponWithClients;
  listPriceCents: number;
  discountCents: number;
  amountCents: number;
}> {
  const code = input.couponCode.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({
    where: {
      projectId_code: { projectId: input.projectId, code },
    },
    include: { clients: true },
  });
  if (!coupon) throw httpError("coupon.not_found", 404);
  if (coupon.status !== "active") throw httpError("coupon.not_active", 400);
  if (!withinWindow(coupon)) throw httpError("coupon.outside_window", 400);
  if (!clientAllowed(coupon.clients, input.client)) {
    throw httpError("coupon.client_not_allowed", 403);
  }

  const planIds = asPlanIds(coupon.planIdsJson);
  if (planIds.length && !planIds.includes(input.planId)) {
    throw httpError("coupon.plan_not_applicable", 400);
  }

  if (coupon.totalLimit != null) {
    const total = await countCouponOccupancy({ couponId: coupon.id });
    if (total >= coupon.totalLimit) throw httpError("coupon.total_limit", 429);
  }
  if (coupon.perUserLimit > 0) {
    const mine = await countCouponOccupancy({
      couponId: coupon.id,
      userId: input.userId,
    });
    if (mine >= coupon.perUserLimit) throw httpError("coupon.user_limit", 429);
  }

  const priced = computeCouponDiscount(input.listPriceCents, {
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderCents: coupon.minOrderCents,
    maxDiscountCents: coupon.maxDiscountCents,
  });

  return {
    coupon,
    listPriceCents: priced.listPriceCents,
    discountCents: priced.discountCents,
    amountCents: priced.amountCents,
  };
}

export async function replaceCouponClients(
  couponId: string,
  clients: Array<{ client: ClientChannel; enabled?: boolean }>,
) {
  await prisma.$transaction([
    prisma.couponClient.deleteMany({ where: { couponId } }),
    prisma.couponClient.createMany({
      data: clients.map((c) => ({
        couponId,
        client: c.client,
        enabled: c.enabled !== false,
      })),
    }),
  ]);
}

export async function releaseCouponForOrder(orderId: string) {
  await prisma.couponRedemption.deleteMany({ where: { orderId } });
}

export async function reserveCouponRedemption(input: {
  couponId: string;
  userId: string;
  orderId: string;
}) {
  await prisma.couponRedemption.create({
    data: {
      couponId: input.couponId,
      userId: input.userId,
      orderId: input.orderId,
    },
  });
}
