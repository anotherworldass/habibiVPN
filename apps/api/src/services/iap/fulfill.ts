import { createHash } from "node:crypto";
import type { CommissionKind } from "@prisma/client";
import { env } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { provisionPaidOrder, publicOrder } from "../payments.js";
import { resolveCommissionKind } from "../referral/commission-kind.js";
import {
  APP_STORE_PROVIDER,
  type AppleTransactionInfo,
  verifySignedTransaction,
} from "./apple.js";
import {
  acknowledgeGooglePurchase,
  GOOGLE_PLAY_PROVIDER,
  type GooglePurchaseInfo,
  verifyGooglePurchase,
} from "./google.js";
import {
  assertAppleBundleForProject,
  resolveAndroidPackageNameForProject,
  resolveAppleBundleForMockProject,
} from "./store-package.js";
import {
  amountCentsFromAppleTxn,
  amountCentsFromGooglePurchase,
  isAppleFreeTrial,
  provisionExpireAtFromTxn,
} from "./pricing.js";

/**
 * Idempotency key for Apple orders.
 * Local StoreKit Testing often emits transactionId=0 for every purchase; using
 * that literally collapses all SKUs onto the first order. Fall back to a JWS hash.
 */
export function appleProviderRef(
  txn: AppleTransactionInfo,
  signedTransaction?: string,
): string {
  const id = txn.transactionId?.trim() ?? "";
  if (id && id !== "0") return id;

  const basis =
    signedTransaction?.trim() ||
    [
      txn.productId,
      txn.originalTransactionId || "",
      txn.purchaseDate.toISOString(),
      String(txn.priceMillis ?? ""),
      txn.expiresDate?.toISOString() ?? "",
    ].join("|");

  return `sk_local_${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

export async function resolvePlanByStoreProductId(
  productId: string,
  store: "app_store" | "google_play" = "app_store",
) {
  const storeProduct = await prisma.storeProduct.findFirst({
    where: {
      store,
      productId,
      enabled: true,
    },
    include: {
      plan: true,
    },
  });
  if (!storeProduct || !storeProduct.plan || !storeProduct.plan.enabled) {
    throw Object.assign(new Error("store_product.not_found"), { statusCode: 404 });
  }
  return { storeProduct, plan: storeProduct.plan };
}

/**
 * Fulfill a verified Apple transaction: create paid order (idempotent) + provision.
 * Free-trial periods: amountCents=0, entitlement ends at Apple expiresDate.
 * First real charge after trial uses commissionKind=first (via resolveCommissionKind).
 */
export async function fulfillAppleTransaction(input: {
  userId: string;
  txn: AppleTransactionInfo;
  /** Raw JWS (or mock payload). Used when transactionId is unusable (e.g. local SK = 0). */
  signedTransaction?: string;
  /** Optional override; ASN renewals should omit so first paid-after-trial stays first */
  commissionKind?: CommissionKind;
}): Promise<{ order: ReturnType<typeof publicOrder>; created: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }

  const providerRef = appleProviderRef(input.txn, input.signedTransaction);

  const existing = await prisma.order.findUnique({
    where: {
      provider_providerRef: {
        provider: APP_STORE_PROVIDER,
        providerRef,
      },
    },
  });

  const resumeExisting = async (row: NonNullable<typeof existing>) => {
    if (row.userId !== input.userId) {
      throw Object.assign(new Error("iap.transaction_owned_by_other"), { statusCode: 409 });
    }
    if (row.status === "paid") {
      const provisioned = await provisionPaidOrder(row.id);
      return { order: publicOrder(provisioned || row), created: false };
    }
    return { order: publicOrder(row), created: false };
  };

  if (existing) {
    return resumeExisting(existing);
  }

  let bundleId = input.txn.bundleId?.trim() || "";
  if (!bundleId && env.APPLE_IAP_MODE === "mock") {
    bundleId = (await resolveAppleBundleForMockProject(user.projectId)) || "";
  }
  await assertAppleBundleForProject(user.projectId, bundleId);

  const { plan } = await resolvePlanByStoreProductId(input.txn.productId);
  if (plan.projectId !== user.projectId) {
    throw Object.assign(new Error("plan.project_mismatch"), { statusCode: 403 });
  }

  const trial = isAppleFreeTrial(input.txn);
  const amountCents = amountCentsFromAppleTxn(input.txn, plan);
  const commissionKind =
    input.commissionKind ?? (await resolveCommissionKind(input.userId));

  let order;
  try {
    order = await prisma.order.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "paid",
        listPriceCents: plan.priceCents,
        amountCents,
        currency: input.txn.currency || plan.currency,
        provider: APP_STORE_PROVIDER,
        providerRef,
        commissionKind,
        paidAt: input.txn.purchaseDate,
        storeExpiresAt: input.txn.expiresDate,
        storePriceMillis: input.txn.priceMillis,
        appleOfferType: input.txn.offerType,
        appleOfferDiscountType: input.txn.offerDiscountType,
        isTrialPeriod: trial,
      },
    });
  } catch (err) {
    // Parallel verify (purchase stream + unsolicited) can race on the unique key.
    if ((err as { code?: string }).code === "P2002") {
      const raced = await prisma.order.findUnique({
        where: {
          provider_providerRef: {
            provider: APP_STORE_PROVIDER,
            providerRef,
          },
        },
      });
      if (raced) return resumeExisting(raced);
    }
    throw err;
  }

  await writeAudit({
    actorType: "user",
    actorId: user.id,
    action: "iap.apple.fulfilled",
    targetType: "order",
    targetId: order.id,
    meta: {
      transactionId: input.txn.transactionId,
      provider_ref: providerRef,
      productId: input.txn.productId,
      bundleId,
      originalTransactionId: input.txn.originalTransactionId,
      is_trial: trial,
      amount_cents: amountCents,
      store_expires_at: provisionExpireAtFromTxn(input.txn) ?? null,
      offer_discount_type: input.txn.offerDiscountType,
      offer_type: input.txn.offerType,
    },
  });

  const provisioned = await provisionPaidOrder(order.id);
  return { order: publicOrder(provisioned || order), created: true };
}

export async function verifyAndFulfillAppleIap(input: {
  userId: string;
  signedTransaction: string;
}) {
  const txn = await verifySignedTransaction(input.signedTransaction);
  return fulfillAppleTransaction({
    userId: input.userId,
    txn,
    signedTransaction: input.signedTransaction,
  });
}

export async function fulfillGooglePurchase(input: {
  userId: string;
  purchase: GooglePurchaseInfo;
  commissionKind?: CommissionKind;
}): Promise<{ order: ReturnType<typeof publicOrder>; created: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }

  const existing = await prisma.order.findUnique({
    where: {
      provider_providerRef: {
        provider: GOOGLE_PLAY_PROVIDER,
        providerRef: input.purchase.providerRef,
      },
    },
  });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw Object.assign(new Error("iap.transaction_owned_by_other"), { statusCode: 409 });
    }
    if (existing.status === "paid") {
      const provisioned = await provisionPaidOrder(existing.id);
      return { order: publicOrder(provisioned || existing), created: false };
    }
    return { order: publicOrder(existing), created: false };
  }

  await resolveAndroidPackageNameForProject(
    user.projectId,
    input.purchase.packageName,
  );

  const { plan } = await resolvePlanByStoreProductId(
    input.purchase.productId,
    "google_play",
  );
  if (plan.projectId !== user.projectId) {
    throw Object.assign(new Error("plan.project_mismatch"), { statusCode: 403 });
  }

  const amountCents = amountCentsFromGooglePurchase(input.purchase, plan);
  const commissionKind =
    input.commissionKind ?? (await resolveCommissionKind(input.userId));

  const order = await prisma.order.create({
    data: {
      userId: user.id,
      planId: plan.id,
      status: "paid",
      listPriceCents: plan.priceCents,
      amountCents,
      currency: input.purchase.currency || plan.currency,
      provider: GOOGLE_PLAY_PROVIDER,
      providerRef: input.purchase.providerRef,
      commissionKind,
      paidAt: input.purchase.purchaseDate,
      storeExpiresAt: input.purchase.expiresDate,
      storePriceMillis:
        input.purchase.priceMicros != null
          ? Math.round(input.purchase.priceMicros / 1000)
          : null,
      isTrialPeriod: input.purchase.isTrialPeriod,
    },
  });

  await writeAudit({
    actorType: "user",
    actorId: user.id,
    action: "iap.google.fulfilled",
    targetType: "order",
    targetId: order.id,
    meta: {
      productId: input.purchase.productId,
      packageName: input.purchase.packageName,
      orderId: input.purchase.orderId,
      providerRef: input.purchase.providerRef,
      is_subscription: input.purchase.isSubscription,
      is_trial: input.purchase.isTrialPeriod,
      amount_cents: amountCents,
    },
  });

  const provisioned = await provisionPaidOrder(order.id);
  void acknowledgeGooglePurchase(input.purchase);
  return { order: publicOrder(provisioned || order), created: true };
}

export async function verifyAndFulfillGoogleIap(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
  packageName?: string | null;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  const packageName = await resolveAndroidPackageNameForProject(
    user.projectId,
    input.packageName,
  );
  const purchase = await verifyGooglePurchase({
    productId: input.productId,
    purchaseToken: input.purchaseToken,
    packageName,
  });
  return fulfillGooglePurchase({ userId: input.userId, purchase });
}

/**
 * ASN renewal / subscribe path: find user by originalTransactionId's prior order, then fulfill.
 * Does not force commissionKind=renew — first paid charge after a $0 trial remains first.
 */
export async function fulfillAppleRenewal(txn: AppleTransactionInfo): Promise<{
  orderId: string | null;
  created: boolean;
  skipped?: string;
}> {
  const existing = await prisma.order.findUnique({
    where: {
      provider_providerRef: {
        provider: APP_STORE_PROVIDER,
        providerRef: txn.transactionId,
      },
    },
  });
  if (existing) {
    if (existing.status === "paid") {
      await provisionPaidOrder(existing.id);
    }
    return { orderId: existing.id, created: false };
  }

  // Bind renewal to same user as original transaction
  const original = await prisma.order.findFirst({
    where: {
      provider: APP_STORE_PROVIDER,
      OR: [
        { providerRef: txn.originalTransactionId },
        {
          providerRef: { startsWith: txn.originalTransactionId },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  let userId = original?.userId;
  if (!userId) {
    const { plan } = await resolvePlanByStoreProductId(txn.productId);
    const last = await prisma.order.findFirst({
      where: {
        provider: APP_STORE_PROVIDER,
        planId: plan.id,
        status: { in: ["paid", "provisioning", "provisioned"] },
      },
      orderBy: { createdAt: "desc" },
    });
    userId = last?.userId;
  }

  if (!userId) {
    return { orderId: null, created: false, skipped: "iap.renewal_user_unknown" };
  }

  const result = await fulfillAppleTransaction({
    userId,
    txn,
  });
  return { orderId: result.order.id, created: result.created };
}
