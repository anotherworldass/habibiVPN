import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlanResetPolicy } from "@prisma/client";
import {
  plansCompatibleForRenew,
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
});
