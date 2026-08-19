import { prisma } from "../lib/prisma.js";
import { createUpstreamSlot } from "./provision.js";
import {
  evaluateSignupTrialGrant,
  type SignupTrialEvent,
} from "./signup-trial-policy.js";
import { getSignupTrialConfig } from "./system-settings.js";

export type { SignupTrialEvent } from "./signup-trial-policy.js";
export {
  evaluateSignupTrialGrant,
  signupTrialTriggerMatches,
} from "./signup-trial-policy.js";

/**
 * Fire-and-forget: never reject. Registration / bind must not fail if WireRaw is down.
 */
export function scheduleSignupTrialGrant(
  userId: string,
  event: SignupTrialEvent,
  locale?: string | null,
) {
  void grantSignupTrialIfEligible(userId, event, locale).catch((err) => {
    console.error("[signup-trial] grant failed", userId, event, err);
  });
}

export async function grantSignupTrialIfEligible(
  userId: string,
  event: SignupTrialEvent,
  locale?: string | null,
): Promise<"skipped" | "granted"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, projectId: true, status: true },
  });
  if (!user) return "skipped";

  const cfg = await getSignupTrialConfig(user.projectId);
  const planId = cfg.value.planId.trim();
  const plan = planId
    ? await prisma.plan.findUnique({
        where: { id: planId },
        select: { id: true, projectId: true, enabled: true },
      })
    : null;

  const decision = evaluateSignupTrialGrant({
    enabled: cfg.enabled,
    trigger: cfg.value.trigger,
    event,
    planId,
    user,
    plan,
  });
  if (!decision.ok) return "skipped";

  try {
    await createUpstreamSlot({
      userId: user.id,
      planId: decision.planId,
      locale,
      ledger: {
        reason: "signup_trial",
        refType: "plan",
        refId: decision.planId,
        actorType: "system",
        actorId: "signup_trial",
        idempotencyKey: `signup_trial:${user.id}:${decision.planId}`,
      },
    });
    return "granted";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "subscription.plan_already_owned") return "skipped";
    throw err;
  }
}
