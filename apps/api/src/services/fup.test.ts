import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertFupResetPolicy,
  desiredBandwidthPlanRef,
  gbToBytes,
  normalizeFupTiersInput,
  pickFupTier,
  planSpansMultipleMonths,
} from "./fup.js";

const tiers = [
  { afterBytes: 0, bandwidthPlanRef: "mbp_full" },
  { afterBytes: gbToBytes(5), bandwidthPlanRef: "mbp_mid" },
  { afterBytes: gbToBytes(20), bandwidthPlanRef: "mbp_slow" },
];

describe("pickFupTier / desiredBandwidthPlanRef", () => {
  it("uses full speed at 0 and below first threshold", () => {
    assert.equal(desiredBandwidthPlanRef(0, tiers), "mbp_full");
    assert.equal(desiredBandwidthPlanRef(gbToBytes(4.9), tiers), "mbp_full");
  });

  it("switches at exact threshold", () => {
    assert.equal(desiredBandwidthPlanRef(gbToBytes(5), tiers), "mbp_mid");
    assert.equal(desiredBandwidthPlanRef(gbToBytes(8), tiers), "mbp_mid");
  });

  it("uses the last matching tier", () => {
    assert.equal(desiredBandwidthPlanRef(gbToBytes(20), tiers), "mbp_slow");
    assert.equal(desiredBandwidthPlanRef(gbToBytes(100), tiers), "mbp_slow");
  });

  it("restores full speed after used drops (monthly reset)", () => {
    assert.equal(pickFupTier(gbToBytes(30), tiers)?.bandwidthPlanRef, "mbp_slow");
    assert.equal(desiredBandwidthPlanRef(0, tiers), "mbp_full");
  });
});

describe("normalizeFupTiersInput", () => {
  it("accepts afterGb ladder with zero first", () => {
    const out = normalizeFupTiersInput([
      { afterGb: 5, bandwidthPlanRef: "mbp_mid" },
      { afterGb: 0, bandwidthPlanRef: "mbp_full" },
      { afterGb: 20, bandwidthPlanRef: "mbp_slow" },
    ]);
    assert.equal(out?.[0]?.afterBytes, 0);
    assert.equal(out?.[1]?.afterBytes, gbToBytes(5));
    assert.equal(out?.[2]?.bandwidthPlanRef, "mbp_slow");
  });

  it("treats empty as disabled", () => {
    assert.equal(normalizeFupTiersInput(null), null);
    assert.equal(normalizeFupTiersInput([]), null);
  });

  it("rejects a single tier", () => {
    assert.throws(
      () =>
        normalizeFupTiersInput([{ afterGb: 0, bandwidthPlanRef: "mbp_full" }]),
      /fup_tiers_min_two/,
    );
  });

  it("rejects missing zero tier", () => {
    assert.throws(
      () =>
        normalizeFupTiersInput([
          { afterGb: 5, bandwidthPlanRef: "a" },
          { afterGb: 10, bandwidthPlanRef: "b" },
        ]),
      /fup_tiers_need_zero/,
    );
  });
});

describe("assertFupResetPolicy", () => {
  it("blocks no_reset on multi-month plans", () => {
    assert.throws(
      () =>
        assertFupResetPolicy({
          tiers,
          resetPolicy: "no_reset",
          validityCalendarMonths: 12,
        }),
      /fup_requires_traffic_reset/,
    );
  });

  it("allows month reset on yearly plans", () => {
    assertFupResetPolicy({
      tiers,
      resetPolicy: "month",
      validityCalendarMonths: 12,
    });
  });

  it("allows no_reset when FUP is off", () => {
    assertFupResetPolicy({
      tiers: null,
      resetPolicy: "no_reset",
      validityCalendarMonths: 12,
    });
  });
});

describe("planSpansMultipleMonths", () => {
  it("detects calendar months and long seconds", () => {
    assert.equal(planSpansMultipleMonths({ validityCalendarMonths: 1 }), false);
    assert.equal(planSpansMultipleMonths({ validityCalendarMonths: 3 }), true);
    assert.equal(
      planSpansMultipleMonths({ validitySeconds: 30 * 86400 }),
      false,
    );
    assert.equal(planSpansMultipleMonths({ validitySeconds: 90 * 86400 }), true);
  });
});
