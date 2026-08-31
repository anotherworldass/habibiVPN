import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlanResetPolicy } from "@prisma/client";
import {
  plansCompatibleForRenew,
  slotAllowsRenewWithPlan,
  slotIsExpired,
  slotStatusAllowsRenew,
  subscriptionCanRenewWithPaidPlans,
  type RenewPlanSpec,
} from "./renew-compat.js";

function spec(partial: Partial<RenewPlanSpec> = {}): RenewPlanSpec {
  return {
    dataLimitBytes: BigInt(100),
    deviceSlots: 1,
    resetPolicy: "no_reset" as PlanResetPolicy,
    customResetInterval: null,
    upstreamPlanRef: "wr_a",
    fupTiers: null,
    ...partial,
  };
}

describe("plansCompatibleForRenew", () => {
  it("allows campaign slots with no plan", () => {
    assert.equal(plansCompatibleForRenew(null, spec({})), true);
  });

  it("allows same spec with different duration-only fields omitted", () => {
    const a = spec({ dataLimitBytes: BigInt(50) });
    const b = spec({ dataLimitBytes: BigInt(50) });
    assert.equal(plansCompatibleForRenew(a, b), true);
  });

  it("rejects different data limits", () => {
    assert.equal(
      plansCompatibleForRenew(
        spec({ dataLimitBytes: BigInt(50) }),
        spec({ dataLimitBytes: BigInt(100) }),
      ),
      false,
    );
  });

  it("rejects different device slots", () => {
    assert.equal(
      plansCompatibleForRenew(spec({ deviceSlots: 1 }), spec({ deviceSlots: 3 })),
      false,
    );
  });
});

describe("subscriptionCanRenewWithPaidPlans", () => {
  it("blocks disabled slots", () => {
    assert.equal(
      slotStatusAllowsRenew("disabled"),
      false,
    );
    assert.equal(
      subscriptionCanRenewWithPaidPlans(
        { status: "disabled", planId: "p1", plan: spec({}) },
        [spec({})],
      ),
      false,
    );
  });

  it("lets campaign slots renew with any paid plan", () => {
    assert.equal(
      subscriptionCanRenewWithPaidPlans(
        { status: "active", planId: null, plan: null },
        [spec({})],
      ),
      true,
    );
  });

  it("lets expired slots renew with any paid plan even if spec differs", () => {
    assert.equal(
      subscriptionCanRenewWithPaidPlans(
        {
          status: "active",
          planId: "p1",
          plan: spec({ dataLimitBytes: BigInt(50), deviceSlots: 1 }),
          expiresAt: new Date(Date.now() - 60_000),
        },
        [spec({ dataLimitBytes: BigInt(100), deviceSlots: 3 })],
      ),
      true,
    );
    assert.equal(
      subscriptionCanRenewWithPaidPlans(
        {
          status: "expired",
          planId: "p1",
          plan: spec({ deviceSlots: 1 }),
        },
        [spec({ deviceSlots: 5 })],
      ),
      true,
    );
  });

  it("still requires matching spec for unexpired slots", () => {
    assert.equal(
      subscriptionCanRenewWithPaidPlans(
        {
          status: "active",
          planId: "p1",
          plan: spec({ dataLimitBytes: BigInt(50) }),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        [spec({ dataLimitBytes: BigInt(100) })],
      ),
      false,
    );
  });
});

describe("slotIsExpired / slotAllowsRenewWithPlan", () => {
  it("treats expired status or past expiresAt as expired", () => {
    assert.equal(slotIsExpired({ status: "expired" }), true);
    assert.equal(
      slotIsExpired({ status: "active", expiresAt: new Date(Date.now() - 1) }),
      true,
    );
    assert.equal(slotIsExpired({ status: "active" }), false);
    assert.equal(
      slotIsExpired({
        status: "active",
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      false,
    );
  });

  it("allows expired slots to change entitlement spec", () => {
    assert.equal(
      slotAllowsRenewWithPlan(
        {
          status: "active",
          expiresAt: new Date(Date.now() - 1),
          plan: spec({ dataLimitBytes: BigInt(50), deviceSlots: 1 }),
        },
        spec({ dataLimitBytes: BigInt(200), deviceSlots: 3 }),
      ),
      true,
    );
  });

  it("rejects unexpired slots with a different spec", () => {
    assert.equal(
      slotAllowsRenewWithPlan(
        {
          status: "active",
          expiresAt: new Date(Date.now() + 86_400_000),
          plan: spec({ dataLimitBytes: BigInt(50) }),
        },
        spec({ dataLimitBytes: BigInt(200) }),
      ),
      false,
    );
  });

  it("rejects disabled slots even when expired", () => {
    assert.equal(
      slotAllowsRenewWithPlan(
        {
          status: "disabled",
          expiresAt: new Date(Date.now() - 1),
          plan: spec({}),
        },
        spec({}),
      ),
      false,
    );
  });
});
