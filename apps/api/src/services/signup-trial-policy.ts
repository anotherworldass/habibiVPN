import type { SignupTrialEvent } from "./system-settings.js";

export type { SignupTrialEvent } from "./system-settings.js";

export type SignupTrialSkipReason =
  | "disabled"
  | "event_mismatch"
  | "no_plan"
  | "user_not_found"
  | "user_disabled"
  | "plan_invalid";

export type SignupTrialSurface = "web" | "app" | "telegram";

export function resolveSignupTrialSurface(input: {
  shell?: string | null;
  client?: string | null;
}): SignupTrialSurface {
  const shell = (input.shell || "").trim().toLowerCase();
  if (shell === "telegram_mini_app" || shell === "telegram" || shell === "tg") {
    return "telegram";
  }
  const client = (input.client || "").trim().toLowerCase();
  if (
    client === "ios_appstore" ||
    client === "ios_alt" ||
    client === "android_play" ||
    client === "android_direct" ||
    client === "windows" ||
    client === "macos"
  ) {
    return "app";
  }
  return "web";
}

export function signupTrialEventEnabled(
  events: readonly SignupTrialEvent[],
  event: SignupTrialEvent,
): boolean {
  return events.includes(event);
}

/** Where the public promo may appear: Web, native App bootstrap, Telegram Mini App. */
export function publicSignupTrialChannels(events: readonly SignupTrialEvent[]): {
  web: boolean;
  app: boolean;
  telegram: boolean;
} {
  const on = (event: SignupTrialEvent) => signupTrialEventEnabled(events, event);
  return {
    web: on("web_unverified") || on("web_verified"),
    app: on("app_bootstrap") || on("app_soft_bind") || on("app_verified_bind"),
    telegram:
      on("telegram_bootstrap") ||
      on("telegram_soft_bind") ||
      on("telegram_verified_bind") ||
      on("telegram_bind"),
  };
}

export function signupTrialEventForAuth(
  surface: SignupTrialSurface,
  kind:
    | "bootstrap"
    | "unverified_register"
    | "unverified_bind"
    | "verified_register"
    | "verified_bind",
): SignupTrialEvent | null {
  if (kind === "bootstrap") {
    if (surface === "telegram") return "telegram_bootstrap";
    if (surface === "app") return "app_bootstrap";
    return null;
  }
  if (kind === "unverified_register") return "web_unverified";
  if (kind === "verified_register") return "web_verified";
  if (kind === "unverified_bind") {
    if (surface === "telegram") return "telegram_soft_bind";
    if (surface === "app") return "app_soft_bind";
    return "web_unverified";
  }
  if (surface === "telegram") return "telegram_verified_bind";
  if (surface === "app") return "app_verified_bind";
  return "web_verified";
}

export function evaluateSignupTrialGrant(input: {
  enabled: boolean;
  events: readonly SignupTrialEvent[];
  event: SignupTrialEvent;
  planId: string;
  user: { id: string; projectId: string; status: string } | null;
  plan: { id: string; projectId: string; enabled: boolean } | null;
}): { ok: true; planId: string } | { ok: false; reason: SignupTrialSkipReason } {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (!signupTrialEventEnabled(input.events, input.event)) {
    return { ok: false, reason: "event_mismatch" };
  }
  const planId = input.planId.trim();
  if (!planId) return { ok: false, reason: "no_plan" };
  if (!input.user) return { ok: false, reason: "user_not_found" };
  if (input.user.status !== "active") return { ok: false, reason: "user_disabled" };
  if (!input.plan || !input.plan.enabled || input.plan.projectId !== input.user.projectId) {
    return { ok: false, reason: "plan_invalid" };
  }
  return { ok: true, planId: input.plan.id };
}
