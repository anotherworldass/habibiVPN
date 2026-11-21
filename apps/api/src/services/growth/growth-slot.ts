/**
 * Plan-less growth slots (daily claim / redeem duration).
 * One user keeps a single activity subscription: extend it when it is still
 * valid, otherwise reuse the latest one from now. Paid plan slots are never
 * candidates, so an expired package is not revived under its old name.
 */

export type GrowthSlotRef = {
  id: string;
  planId: string | null;
  upstreamId: string | null;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export type GrowthSlotReuse<T> = {
  slot: T;
  /** "expiry" adds onto a still-valid end; "now" starts a fresh window. */
  from: "expiry" | "now";
};

function isReusableGrowthSlot(slot: GrowthSlotRef): boolean {
  return slot.planId == null && slot.status === "active" && Boolean(slot.upstreamId);
}

function isUnexpired(slot: GrowthSlotRef, nowMs: number): boolean {
  return slot.expiresAt == null || slot.expiresAt.getTime() > nowMs;
}

/** Later expiry first. Open-ended (null) outranks a dated slot. */
function compareGrowthSlotRecency(a: GrowthSlotRef, b: GrowthSlotRef): number {
  const ae = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const be = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (be !== ae) return be - ae;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function pickGrowthSlotToReuse<T extends GrowthSlotRef>(
  slots: T[],
  nowMs: number,
): GrowthSlotReuse<T> | null {
  const pool = slots.filter(isReusableGrowthSlot);
  if (!pool.length) return null;
  const unexpired = pool.filter((slot) => isUnexpired(slot, nowMs));
  const candidates = [...(unexpired.length ? unexpired : pool)].sort(
    compareGrowthSlotRecency,
  );
  const slot = candidates[0];
  if (!slot) return null;
  const from =
    slot.expiresAt != null && slot.expiresAt.getTime() > nowMs ? "expiry" : "now";
  return { slot, from };
}

/**
 * App/web list: keep every paid slot (including expired, so renew still works).
 * Plan-less slots collapse to the still-valid ones, or the single latest
 * expired one when none are valid. Disabled growth slots are omitted.
 */
export function selectVisibleSubscriptionSlots<T extends GrowthSlotRef>(
  slots: T[],
  nowMs: number,
): T[] {
  const growth = slots.filter(
    (slot) => slot.planId == null && slot.status !== "disabled",
  );
  const unexpired = growth.filter((slot) => isUnexpired(slot, nowMs));
  const keepGrowthIds = new Set<string>();
  if (unexpired.length) {
    for (const slot of unexpired) keepGrowthIds.add(slot.id);
  } else if (growth.length) {
    const latest = [...growth].sort(compareGrowthSlotRecency)[0];
    if (latest) keepGrowthIds.add(latest.id);
  }
  return slots.filter(
    (slot) => slot.planId != null || keepGrowthIds.has(slot.id),
  );
}
