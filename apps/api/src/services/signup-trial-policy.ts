import type { SignupTrialTrigger } from "./system-settings.js";

export type SignupTrialEvent = "verified_email" | "bootstrap" | "telegram_bind";

export type SignupTrialSkipReason =
  | "disabled"
  | "trigger_mismatch"
  | "no_plan"
  | "user_not_found"
  | "user_disabled"
  | "plan_invalid";

export function signupTrialTriggerMatches(
  trigger: SignupTrialTrigger,
  event: SignupTrialEvent,
): boolean {
  if (trigger === "verified_email") return event === "verified_email";
  if (trigger === "bootstrap") return event === "bootstrap";
  return event === "verified_email" || event === "telegram_bind";
}

export function evaluateSignupTrialGrant(input: {
  enabled: boolean;
  trigger: SignupTrialTrigger;
  event: SignupTrialEvent;
  planId: string;
  user: { id: string; projectId: string; status: string } | null;
  plan: { id: string; projectId: string; enabled: boolean } | null;
}): { ok: true; planId: string } | { ok: false; reason: SignupTrialSkipReason } {
  if (!input.enabled) return { ok: false, reason: "disabled" };
  if (!signupTrialTriggerMatches(input.trigger, input.event)) {
    return { ok: false, reason: "trigger_mismatch" };
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
