export type RenewSpec = {
  data_limit_bytes: number | null;
  device_slots: number;
  reset_policy: string;
  custom_reset_interval: string | null;
  upstream_plan_ref: string | null;
  fup_tiers?: unknown;
};

export type RenewableSlot = {
  id: string;
  status: string;
  plan_id: string | null;
  plan_name: string | null;
  expires_at: string | null;
  upstream_username?: string | null;
  can_renew?: boolean;
  renew_spec?: RenewSpec | null;
};

export type RenewablePlan = {
  id?: string;
  data_limit_bytes?: number | null;
  device_slots?: number;
  reset_policy?: string;
  custom_reset_interval?: string | null;
  upstream_plan_ref?: string | null;
  fup_tiers?: unknown;
};

function canonFup(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function slotIsExpired(slot: Pick<RenewableSlot, "status" | "expires_at">) {
  if (slot.status === "expired") return true;
  if (!slot.expires_at) return false;
  const t = new Date(slot.expires_at).getTime();
  return Number.isFinite(t) && t < Date.now();
}

export function slotCompatibleWithPlan(
  slot: RenewableSlot,
  plan: RenewablePlan,
) {
  if (slot.status === "disabled") return false;
  if (slotIsExpired(slot)) return true;
  if (!slot.plan_id || !slot.renew_spec) return true;
  if (plan.id && slot.plan_id === plan.id) return true;
  const spec = slot.renew_spec;
  return (
    (spec.data_limit_bytes ?? null) === (plan.data_limit_bytes ?? null) &&
    spec.device_slots === (plan.device_slots ?? 1) &&
    spec.reset_policy === (plan.reset_policy ?? "no_reset") &&
    (spec.custom_reset_interval || null) ===
      (plan.custom_reset_interval || null) &&
    (spec.upstream_plan_ref || null) === (plan.upstream_plan_ref || null) &&
    canonFup(spec.fup_tiers) === canonFup(plan.fup_tiers)
  );
}
