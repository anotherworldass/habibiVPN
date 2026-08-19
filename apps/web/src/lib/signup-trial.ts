import { apiFetch } from "./api";

export type SignupTrialPromo = {
  enabled: boolean;
  web: boolean;
  app: boolean;
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
  plan: null,
};

export async function fetchSignupTrialPromo(): Promise<SignupTrialPromo> {
  try {
    const res = await apiFetch<SignupTrialPromo>("/api/v1/signup-trial");
    return {
      enabled: !!res.enabled,
      web: !!res.web,
      app: !!res.app,
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
