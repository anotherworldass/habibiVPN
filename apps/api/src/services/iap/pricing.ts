import type { Plan } from "@prisma/client";
import type { AppleTransactionInfo } from "./apple.js";
import type { GooglePurchaseInfo } from "./google.js";

/** Apple JWS `price` is currency units × 1000 (e.g. $9.99 → 9990). */
export function applePriceToCents(priceMillis: number | null | undefined): number | null {
  if (priceMillis == null || !Number.isFinite(priceMillis) || priceMillis < 0) {
    return null;
  }
  return Math.round(priceMillis / 10);
}

/** Google `priceAmountMicros` → cents (÷ 10_000). */
export function googlePriceToCents(priceMicros: number | null | undefined): number | null {
  if (priceMicros == null || !Number.isFinite(priceMicros) || priceMicros < 0) {
    return null;
  }
  return Math.round(priceMicros / 10_000);
}

export function amountCentsFromGooglePurchase(
  purchase: GooglePurchaseInfo,
  plan: Pick<Plan, "priceCents">,
): number {
  if (purchase.isTrialPeriod) return 0;
  const fromStore = googlePriceToCents(purchase.priceMicros);
  if (fromStore != null) return fromStore;
  return plan.priceCents;
}

export function isAppleFreeTrial(txn: AppleTransactionInfo): boolean {
  if (txn.offerDiscountType?.toUpperCase() === "FREE_TRIAL") return true;
  // Fallback: zero-priced subscription period with an expiry
  if (
    txn.priceMillis != null &&
    txn.priceMillis === 0 &&
    txn.expiresDate != null &&
    (txn.type == null ||
      /auto.?renew|subscript/i.test(txn.type) ||
      txn.type === "Auto-Renewable Subscription")
  ) {
    return true;
  }
  return false;
}

/**
 * Payable cents for Habibi order / commission.
 * Prefer Apple-reported price; trial → 0; else plan list price.
 */
export function amountCentsFromAppleTxn(
  txn: AppleTransactionInfo,
  plan: Pick<Plan, "priceCents">,
): number {
  if (isAppleFreeTrial(txn)) return 0;
  const fromStore = applePriceToCents(txn.priceMillis);
  if (fromStore != null) return fromStore;
  return plan.priceCents;
}

/** Prefer Apple expiresDate for entitlement end; else null (caller falls back to plan). */
export function provisionExpireAtFromTxn(txn: AppleTransactionInfo): string | undefined {
  if (!txn.expiresDate || Number.isNaN(txn.expiresDate.getTime())) return undefined;
  return txn.expiresDate.toISOString();
}
