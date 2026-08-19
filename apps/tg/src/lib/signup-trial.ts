import { apiFetch } from "./api";

export type SignupTrialPromo = {
  enabled: boolean;
  web: boolean;
  app: boolean;
  telegram: boolean;
  plan: {
    name: string;
    validity_seconds: number | null;
    data_limit_bytes: number | null;
  } | null;
};

const EMPTY: SignupTrialPromo = {
  enabled: false,
  web: false,
  app: false,
  telegram: false,
  plan: null,
};

const TRIAL_PLAN_FALLBACK = "体验套餐";

export async function fetchSignupTrialPromo(): Promise<SignupTrialPromo> {
  try {
    const res = await apiFetch<SignupTrialPromo>("/api/v1/signup-trial");
    return {
      enabled: !!res.enabled,
      web: !!res.web,
      app: !!res.app,
      telegram:
        typeof res.telegram === "boolean" ? !!res.telegram : !!res.app,
      plan: res.plan?.name
        ? {
            name: res.plan.name,
            validity_seconds: res.plan.validity_seconds ?? null,
            data_limit_bytes: res.plan.data_limit_bytes ?? null,
          }
        : null,
    };
  } catch {
    return EMPTY;
  }
}

/** Mini App: show campaign when TG bind or bootstrap would grant. */
export function telegramSignupTrialPlan(
  promo: SignupTrialPromo,
): { name: string; validity_seconds: number | null; data_limit_bytes: number | null } | null {
  if (!promo.enabled || !promo.telegram || !promo.plan) return null;
  const name = promo.plan.name.trim() || TRIAL_PLAN_FALLBACK;
  return { ...promo.plan, name };
}
