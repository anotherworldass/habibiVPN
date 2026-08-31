import type { Plan } from "@prisma/client";
import { parseFupTiers } from "./fup.js";

export type RenewPlanSpec = Pick<
  Plan,
  | "dataLimitBytes"
  | "deviceSlots"
  | "resetPolicy"
  | "customResetInterval"
  | "upstreamPlanRef"
  | "fupTiers"
>;

function sameLimit(
  a: bigint | number | null | undefined,
  b: bigint | number | null | undefined,
) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return BigInt(a) === BigInt(b);
}

function canonFup(value: unknown) {
  const tiers = parseFupTiers(value);
  return JSON.stringify(
    tiers.map((t) => [t.afterBytes, t.bandwidthPlanRef]),
  );
}

/** Same entitlement spec except duration / price / name. Campaign (no plan) is always compatible. */
export function plansCompatibleForRenew(
  slotPlan: RenewPlanSpec | null | undefined,
  purchasedPlan: RenewPlanSpec,
) {
  if (!slotPlan) return true;
  return (
    sameLimit(slotPlan.dataLimitBytes, purchasedPlan.dataLimitBytes) &&
    slotPlan.deviceSlots === purchasedPlan.deviceSlots &&
    slotPlan.resetPolicy === purchasedPlan.resetPolicy &&
    (slotPlan.customResetInterval || null) ===
      (purchasedPlan.customResetInterval || null) &&
    (slotPlan.upstreamPlanRef || null) ===
      (purchasedPlan.upstreamPlanRef || null) &&
    canonFup(slotPlan.fupTiers) === canonFup(purchasedPlan.fupTiers)
  );
}

export function slotStatusAllowsRenew(status: string) {
  return status !== "disabled";
}

/** View `expired` or past `expiresAt`. Missing expiry is not expired. */
export function slotIsExpired(slot: {
  status?: string | null;
  expiresAt?: Date | string | null;
}) {
  if (slot.status === "expired") return true;
  if (slot.expiresAt == null) return false;
  const t =
    slot.expiresAt instanceof Date
      ? slot.expiresAt.getTime()
      : Date.parse(String(slot.expiresAt));
  return Number.isFinite(t) && t < Date.now();
}

export function slotAllowsRenewWithPlan(
  slot: {
    status: string;
    expiresAt?: Date | string | null;
    plan: RenewPlanSpec | null | undefined;
  },
  purchasedPlan: RenewPlanSpec,
) {
  if (!slotStatusAllowsRenew(slot.status)) return false;
  if (slotIsExpired(slot)) return true;
  return plansCompatibleForRenew(slot.plan, purchasedPlan);
}

export function subscriptionCanRenewWithPaidPlans(
  slot: {
    status: string;
    planId: string | null;
    plan: RenewPlanSpec | null;
    expiresAt?: Date | string | null;
  },
  paidPlans: RenewPlanSpec[],
) {
  if (!slotStatusAllowsRenew(slot.status)) return false;
  if (!slot.planId || !slot.plan) return paidPlans.length > 0;
  if (slotIsExpired(slot)) return paidPlans.length > 0;
  return paidPlans.some((p) => plansCompatibleForRenew(slot.plan, p));
}
