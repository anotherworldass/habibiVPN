import type { ClientChannel, Order } from "@prisma/client";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { createPaymentAdapter } from "../payments/registry.js";
import type { PaymentCallback } from "../payments/types.js";
import {
  releaseCouponForOrder,
  reserveCouponRedemption,
  validateAndPriceCoupon,
} from "./growth/coupons.js";
import { createUpstreamSlot } from "./provision.js";
import { settleCommissionsForOrder } from "./referral/commission.js";
import { resolveCommissionKind } from "./referral/commission-kind.js";
import {
  assertCreateOrderAllowed,
  findReusablePendingOrder,
  shouldRefreshRemotePayment,
} from "./payments-guard.js";
import { getPaymentOrderGuardPolicy } from "./system-settings.js";

/** App Store / Play 数字内容必须走 IAP，禁止第三方网关下单。 */
export const STORE_IAP_ONLY_CLIENTS: ReadonlySet<ClientChannel> = new Set([
  "ios_appstore",
  "android_play",
]);

export function isStoreIapOnlyClient(
  client: ClientChannel | string | null | undefined,
): boolean {
  return !!client && STORE_IAP_ONLY_CLIENTS.has(client as ClientChannel);
}

export function publicOrder(order: Order) {
  return {
    id: order.id,
    status: order.status,
    list_price_cents: order.listPriceCents ?? order.amountCents,
    discount_cents: order.discountCents,
    amount_cents: order.amountCents,
    coupon_id: order.couponId,
    coupon_code: order.couponCode,
    currency: order.currency,
    provider: order.provider,
    provider_ref: order.providerRef,
    commission_kind: order.commissionKind,
    payment_url: order.paymentUrl,
    failure_reason: order.failureReason,
    provision_error: order.provisionError,
    store_expires_at: order.storeExpiresAt,
    store_price_millis: order.storePriceMillis,
    apple_offer_type: order.appleOfferType,
    apple_offer_discount_type: order.appleOfferDiscountType,
    is_trial_period: order.isTrialPeriod,
    paid_at: order.paidAt,
    provisioned_at: order.provisionedAt,
    created_at: order.createdAt,
  };
}

export async function createPaymentOrder(input: {
  userId: string;
  planId: string;
  channelId: string;
  jumpUrl?: string;
  couponCode?: string | null;
  client?: ClientChannel;
  ip?: string | null;
}) {
  const [plan, channel, user] = await Promise.all([
    prisma.plan.findUnique({ where: { id: input.planId } }),
    prisma.paymentChannel.findUnique({
      where: { id: input.channelId },
      include: { provider: true },
    }),
    prisma.user.findUnique({ where: { id: input.userId } }),
  ]);
  if (!plan || !plan.enabled || plan.isFreeClaimable) {
    throw Object.assign(new Error("plan.not_found"), { statusCode: 404 });
  }
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  if (plan.projectId !== user.projectId) {
    throw Object.assign(new Error("plan.project_mismatch"), { statusCode: 403 });
  }
  // 商店端用户 / 请求不得走第三方支付（Guideline 3.1.1 / Play 等价政策）。
  const effectiveClient = input.client ?? user.sourceClient ?? null;
  if (
    isStoreIapOnlyClient(effectiveClient) ||
    isStoreIapOnlyClient(user.sourceClient)
  ) {
    throw Object.assign(new Error("payment.store_iap_only"), {
      statusCode: 403,
    });
  }
  // Paid packs may be purchased again to renew/extend an existing slot.
  if (!channel || !channel.enabled || !channel.provider.enabled) {
    throw Object.assign(new Error("payment.channel_unavailable"), { statusCode: 404 });
  }
  if (plan.currency.toUpperCase() !== channel.currency.toUpperCase()) {
    throw Object.assign(new Error("payment.currency_unsupported"), { statusCode: 400 });
  }
  if (!channel.provider.credentialsEncrypted) {
    throw Object.assign(new Error("payment.provider_not_configured"), { statusCode: 503 });
  }

  const orderGuard = await getPaymentOrderGuardPolicy(user.projectId);
  await assertCreateOrderAllowed({
    projectId: user.projectId,
    userId: input.userId,
    ip: input.ip,
    policy: orderGuard,
  });

  const listPriceCents = plan.priceCents;
  let discountCents = 0;
  let amountCents = listPriceCents;
  let couponId: string | null = null;
  let couponCode: string | null = null;

  if (input.couponCode?.trim()) {
    const client =
      input.client || user.sourceClient || ("h5" as ClientChannel);
    const priced = await validateAndPriceCoupon({
      projectId: user.projectId,
      userId: user.id,
      couponCode: input.couponCode,
      planId: plan.id,
      listPriceCents,
      client,
    });
    discountCents = priced.discountCents;
    amountCents = priced.amountCents;
    couponId = priced.coupon.id;
    couponCode = priced.coupon.code;
  }

  if (amountCents < channel.minCents || amountCents > channel.maxCents) {
    throw Object.assign(new Error("payment.amount_out_of_range"), { statusCode: 400 });
  }

  const reusable = await findReusablePendingOrder({
    projectId: user.projectId,
    userId: input.userId,
    planId: plan.id,
    paymentChannelId: channel.id,
    amountCents,
    couponCode,
    policy: orderGuard,
  });
  if (reusable) return reusable;

  const commissionKind = await resolveCommissionKind(input.userId);
  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      paymentChannelId: channel.id,
      listPriceCents,
      discountCents,
      couponId,
      couponCode,
      amountCents,
      currency: plan.currency,
      provider: channel.provider.code,
      commissionKind,
    },
  });

  if (couponId) {
    await reserveCouponRedemption({
      couponId,
      userId: input.userId,
      orderId: order.id,
    });
  }

  try {
    const adapter = createPaymentAdapter(channel.provider);
    const result = await adapter.createPayment({
      merchantOrderNo: order.id,
      amountCents: order.amountCents,
      channelCode: channel.code,
      subject: plan.name,
      notifyUrl: `${env.API_PUBLIC_ORIGIN.replace(/\/$/, "")}/api/v1/payments/callback/${encodeURIComponent(channel.provider.code)}`,
      jumpUrl:
        input.jumpUrl ||
        `${env.WEB_PUBLIC_ORIGIN.replace(/\/$/, "")}/payment/${encodeURIComponent(order.id)}`,
    });
    return prisma.order.update({
      where: { id: order.id },
      data: {
        providerRef: result.providerOrderNo,
        paymentUrl: result.paymentUrl,
      },
    });
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "failed",
        failureReason: error instanceof Error ? error.message : "payment.create_failed",
      },
    });
    await releaseCouponForOrder(order.id);
    throw error;
  }
}

/** Mark paid order as provisioning → settle commissions + open upstream slot. */
export async function provisionPaidOrder(orderId: string) {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: "paid" },
    data: { status: "provisioning", provisionError: null },
  });
  if (!claimed.count) return prisma.order.findUnique({ where: { id: orderId } });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("order.not_found");
  try {
    await settleCommissionsForOrder(orderId);
    const isIap =
      order.provider === "app_store" || order.provider === "google_play";
    await createUpstreamSlot({
      userId: order.userId,
      planId: order.planId,
      slotId: `uus_${order.id}`,
      note: order.isTrialPeriod
        ? `paid_order:${order.id};iap_trial`
        : `paid_order:${order.id}`,
      allowRenew: true,
      // Prefer Apple subscription period end when present (trial + renewals)
      ...(order.storeExpiresAt
        ? { expireAt: order.storeExpiresAt.toISOString() }
        : {}),
      ledger: {
        reason: isIap ? "iap" : "order_paid",
        refType: "order",
        refId: order.id,
        actorType: "system",
        actorId: order.provider || undefined,
        idempotencyKey: `order:${order.id}`,
      },
    });
    const saved = await prisma.order.update({
      where: { id: order.id },
      data: { status: "provisioned", provisionedAt: new Date(), provisionError: null },
    });
    await writeAudit({
      actorType: "payment",
      actorId: order.provider,
      action: "payment.order_provisioned",
      targetType: "order",
      targetId: order.id,
    });
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "provision.failed";
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "paid", provisionError: message },
    });
    throw error;
  }
}

export async function applyPaymentResult(
  providerCode: string,
  result: PaymentCallback,
) {
  const order = await prisma.order.findUnique({ where: { id: result.merchantOrderNo } });
  if (!order || order.provider !== providerCode) {
    throw Object.assign(new Error("order.not_found"), { statusCode: 404 });
  }
  if (["paid", "provisioning", "provisioned"].includes(order.status)) {
    return order;
  }
  if (order.amountCents !== result.amountCents) {
    throw Object.assign(new Error("payment.amount_mismatch"), { statusCode: 400 });
  }
  if (order.providerRef && order.providerRef !== result.providerOrderNo) {
    throw Object.assign(new Error("payment.provider_ref_mismatch"), { statusCode: 400 });
  }

  if (result.state === "paid") {
    await prisma.order.updateMany({
      where: { id: order.id, status: { in: ["pending", "failed"] } },
      data: {
        status: "paid",
        providerRef: result.providerOrderNo,
        paidAt: new Date(),
        failureReason: null,
      },
    });
    const current = await prisma.order.findUnique({ where: { id: order.id } });
    if (current?.status === "paid") return provisionPaidOrder(order.id);
    return current;
  }

  if (result.state === "failed") {
    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: "pending" },
      data: { status: "failed", failureReason: "payment.remote_failed" },
    });
    if (updated.count) await releaseCouponForOrder(order.id);
    return prisma.order.findUnique({ where: { id: order.id } });
  }
  return order;
}

export async function refreshPaymentOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });
  if (!order) throw Object.assign(new Error("order.not_found"), { statusCode: 404 });
  if (!order.provider || !["pending", "paid"].includes(order.status)) return order;
  if (!(await shouldRefreshRemotePayment(order.id))) return order;
  const provider = await prisma.paymentProvider.findUnique({ where: { code: order.provider } });
  if (!provider || !provider.enabled) return order;

  const result = await createPaymentAdapter(provider).queryPayment(order.id, {
    providerRef: order.providerRef,
    paymentUrl: order.paymentUrl,
  });
  if (result.amountCents != null && result.amountCents !== order.amountCents) {
    throw Object.assign(new Error("payment.amount_mismatch"), { statusCode: 400 });
  }
  if (result.providerOrderNo && !order.providerRef) {
    await prisma.order.update({
      where: { id: order.id },
      data: { providerRef: result.providerOrderNo },
    });
  }
  if (result.state === "paid" && result.providerOrderNo) {
    return applyPaymentResult(order.provider, {
      merchantOrderNo: order.id,
      providerOrderNo: result.providerOrderNo,
      state: "paid",
      amountCents: order.amountCents,
    });
  }
  if (result.state === "failed") {
    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: "pending" },
      data: { status: "failed", failureReason: "payment.remote_failed" },
    });
    if (updated.count) await releaseCouponForOrder(order.id);
  }
  return prisma.order.findUnique({ where: { id: order.id } });
}
