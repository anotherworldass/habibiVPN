import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateSignupTrialGrant,
  publicSignupTrialChannels,
  resolveSignupTrialSurface,
  signupTrialEventEnabled,
  signupTrialEventForAuth,
} from "./signup-trial-policy.js";
import { migrateSignupTrialTriggerToEvents, parseSignupTrialValue } from "./system-settings.js";

describe("migrateSignupTrialTriggerToEvents", () => {
  it("maps verified_email to email-verify scenes only", () => {
    assert.deepEqual(migrateSignupTrialTriggerToEvents("verified_email"), [
      "web_verified",
      "app_verified_bind",
      "telegram_verified_bind",
    ]);
  });

  it("maps bootstrap to App/TG anonymous create", () => {
    assert.deepEqual(migrateSignupTrialTriggerToEvents("bootstrap"), [
      "app_bootstrap",
      "telegram_bootstrap",
    ]);
  });

  it("maps identity to verified email + telegram bind", () => {
    assert.deepEqual(migrateSignupTrialTriggerToEvents("identity"), [
      "web_verified",
      "app_verified_bind",
      "telegram_verified_bind",
      "telegram_bind",
    ]);
  });

  it("maps any_register without unverified web / soft-bind", () => {
    const events = migrateSignupTrialTriggerToEvents("any_register");
    assert.equal(events.includes("web_unverified"), false);
    assert.equal(events.includes("app_soft_bind"), false);
    assert.equal(events.includes("web_verified"), true);
    assert.equal(events.includes("app_bootstrap"), true);
    assert.equal(events.includes("telegram_bind"), true);
  });
});

describe("parseSignupTrialValue", () => {
  it("prefers events over legacy trigger", () => {
    const value = parseSignupTrialValue({
      planId: "p1",
      trigger: "any_register",
      events: ["web_unverified"],
    });
    assert.deepEqual(value.events, ["web_unverified"]);
  });

  it("migrates legacy trigger when events are absent", () => {
    const value = parseSignupTrialValue({ planId: "p1", trigger: "bootstrap" });
    assert.deepEqual(value.events, ["app_bootstrap", "telegram_bootstrap"]);
  });
});

describe("signupTrialEventEnabled", () => {
  it("matches only listed scenes", () => {
    assert.equal(signupTrialEventEnabled(["web_verified"], "web_verified"), true);
    assert.equal(signupTrialEventEnabled(["web_verified"], "web_unverified"), false);
  });
});

describe("resolveSignupTrialSurface", () => {
  it("prefers Telegram shell over client", () => {
    assert.equal(
      resolveSignupTrialSurface({ shell: "telegram_mini_app", client: "h5" }),
      "telegram",
    );
  });

  it("treats native clients as app", () => {
    assert.equal(
      resolveSignupTrialSurface({ shell: null, client: "ios_appstore" }),
      "app",
    );
  });

  it("defaults to web", () => {
    assert.equal(resolveSignupTrialSurface({}), "web");
  });
});

describe("signupTrialEventForAuth", () => {
  it("does not grant on web bootstrap", () => {
    assert.equal(signupTrialEventForAuth("web", "bootstrap"), null);
  });

  it("maps unverified web register separately from App/TG bind", () => {
    assert.equal(signupTrialEventForAuth("web", "unverified_register"), "web_unverified");
    assert.equal(signupTrialEventForAuth("app", "unverified_bind"), "app_soft_bind");
    assert.equal(
      signupTrialEventForAuth("telegram", "unverified_bind"),
      "telegram_soft_bind",
    );
  });
});

describe("publicSignupTrialChannels", () => {
  it("web promo follows web scenes including unverified register", () => {
    assert.deepEqual(publicSignupTrialChannels(["web_unverified"]), {
      web: true,
      app: false,
      telegram: false,
    });
    assert.deepEqual(publicSignupTrialChannels(["web_verified"]), {
      web: true,
      app: false,
      telegram: false,
    });
  });

  it("app and telegram are independent", () => {
    assert.deepEqual(publicSignupTrialChannels(["app_bootstrap"]), {
      web: false,
      app: true,
      telegram: false,
    });
    assert.deepEqual(publicSignupTrialChannels(["telegram_bind"]), {
      web: false,
      app: false,
      telegram: true,
    });
  });
});

describe("evaluateSignupTrialGrant", () => {
  const user = { id: "u1", projectId: "p1", status: "active" };
  const plan = { id: "plan1", projectId: "p1", enabled: true };

  it("skips when setting is disabled", () => {
    const out = evaluateSignupTrialGrant({
      enabled: false,
      events: ["web_verified"],
      event: "web_verified",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: false, reason: "disabled" });
  });

  it("skips when the scene is not selected", () => {
    const out = evaluateSignupTrialGrant({
      enabled: true,
      events: ["web_verified"],
      event: "web_unverified",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: false, reason: "event_mismatch" });
  });

  it("skips when plan id is empty", () => {
    const out = evaluateSignupTrialGrant({
      enabled: true,
      events: ["web_verified"],
      event: "web_verified",
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
        events: ["web_verified"],
        event: "web_verified",
        planId: "plan1",
        user: { ...user, status: "disabled" },
        plan,
      }).ok,
      false,
    );
    assert.equal(
      evaluateSignupTrialGrant({
        enabled: true,
        events: ["web_verified"],
        event: "web_verified",
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
      events: ["telegram_bind"],
      event: "telegram_bind",
      planId: "plan1",
      user,
      plan,
    });
    assert.deepEqual(out, { ok: true, planId: "plan1" });
  });
});
