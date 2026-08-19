import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateSignupTrialGrant,
  signupTrialTriggerMatches,
} from "./signup-trial-policy.js";

describe("signupTrialTriggerMatches", () => {
  it("verified_email only matches email OTP register/bind", () => {
    assert.equal(signupTrialTriggerMatches("verified_email", "verified_email"), true);
    assert.equal(signupTrialTriggerMatches("verified_email", "bootstrap"), false);
    assert.equal(signupTrialTriggerMatches("verified_email", "telegram_bind"), false);
  });

  it("bootstrap only matches new anonymous accounts", () => {
    assert.equal(signupTrialTriggerMatches("bootstrap", "bootstrap"), true);
    assert.equal(signupTrialTriggerMatches("bootstrap", "verified_email"), false);
    assert.equal(signupTrialTriggerMatches("bootstrap", "telegram_bind"), false);
  });

  it("identity matches verified email or telegram bind, not anonymous bootstrap", () => {
    assert.equal(signupTrialTriggerMatches("identity", "verified_email"), true);
    assert.equal(signupTrialTriggerMatches("identity", "telegram_bind"), true);
    assert.equal(signupTrialTriggerMatches("identity", "bootstrap"), false);
  });
});

describe("evaluateSignupTrialGrant", () => {
  const user = { id: "u1", projectId: "p1", status: "active" };
  const plan = { id: "plan1", projectId: "p1", enabled: true };

  it("skips when setting is disabled", () => {
    const out = evaluateSignupTrialGrant({
      enabled: false,
      trigger: "verified_email",
      event: "verified_email",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: false, reason: "disabled" });
  });

  it("skips when trigger does not match the event", () => {
    const out = evaluateSignupTrialGrant({
      enabled: true,
      trigger: "verified_email",
      event: "bootstrap",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: false, reason: "trigger_mismatch" });
  });

  it("skips when plan id is empty", () => {
    const out = evaluateSignupTrialGrant({
      enabled: true,
      trigger: "verified_email",
      event: "verified_email",
      planId: "  ",
      user,
      plan: null,
    });
    assert.deepEqual(out, { ok: false, reason: "no_plan" });
  });

  it("skips disabled user or mismatched plan", () => {
    assert.equal(
      evaluateSignupTrialGrant({
        enabled: true,
        trigger: "verified_email",
        event: "verified_email",
        planId: "plan1",
        user: { ...user, status: "disabled" },
        plan,
      }).ok,
      false,
    );
    assert.equal(
      evaluateSignupTrialGrant({
        enabled: true,
        trigger: "verified_email",
        event: "verified_email",
        planId: "plan1",
        user,
        plan: { ...plan, projectId: "other" },
      }).ok,
      false,
    );
  });

  it("allows grant when config, user, and plan line up", () => {
    const out = evaluateSignupTrialGrant({
      enabled: true,
      trigger: "identity",
      event: "telegram_bind",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: true, planId: "plan1" });
  });

  it("treats already-owned as a skip at the grant layer (idempotent key + unique slot)", () => {
    assert.equal(
      evaluateSignupTrialGrant({
        enabled: true,
        trigger: "verified_email",
        event: "verified_email",
        planId: "plan1",
        user,
        plan,
      }).ok,
      true,
    );
  });
});
