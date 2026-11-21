import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickGrowthSlotToReuse,
  selectVisibleSubscriptionSlots,
  type GrowthSlotRef,
} from "./growth-slot.js";

const NOW = Date.parse("2026-11-22T00:00:00.000Z");

function slot(partial: Partial<GrowthSlotRef> & Pick<GrowthSlotRef, "id">): GrowthSlotRef {
  return {
    planId: null,
    upstreamId: "up",
    status: "active",
    expiresAt: new Date(NOW - 86_400_000),
    createdAt: new Date(NOW - 86_400_000),
    ...partial,
  };
}

describe("pickGrowthSlotToReuse", () => {
  it("extends the latest still-valid activity slot", () => {
    const soon = slot({
      id: "soon",
      expiresAt: new Date(NOW + 3_600_000),
      createdAt: new Date(NOW - 10_000),
    });
    const later = slot({
      id: "later",
      expiresAt: new Date(NOW + 86_400_000),
      createdAt: new Date(NOW - 20_000),
    });
    const picked = pickGrowthSlotToReuse([soon, later], NOW);
    assert.equal(picked?.slot.id, "later");
    assert.equal(picked?.from, "expiry");
  });

  it("reuses the latest expired activity slot from now", () => {
    const older = slot({
      id: "older",
      expiresAt: new Date(NOW - 3 * 86_400_000),
      createdAt: new Date(NOW - 3 * 86_400_000),
    });
    const newer = slot({
      id: "newer",
      expiresAt: new Date(NOW - 86_400_000),
      createdAt: new Date(NOW - 86_400_000),
    });
    const picked = pickGrowthSlotToReuse([older, newer], NOW);
    assert.equal(picked?.slot.id, "newer");
    assert.equal(picked?.from, "now");
  });

  it("ignores paid plans and disabled activity slots", () => {
    const paid = slot({
      id: "paid",
      planId: "plan",
      expiresAt: new Date(NOW + 86_400_000),
    });
    const disabled = slot({ id: "off", status: "disabled" });
    assert.equal(pickGrowthSlotToReuse([paid, disabled], NOW), null);
  });
});

describe("selectVisibleSubscriptionSlots", () => {
  it("hides older expired activity slots but keeps expired paid plans", () => {
    const paid = slot({
      id: "paid",
      planId: "plan",
      expiresAt: new Date(NOW - 86_400_000),
    });
    const older = slot({
      id: "older",
      expiresAt: new Date(NOW - 3 * 86_400_000),
    });
    const newer = slot({
      id: "newer",
      expiresAt: new Date(NOW - 86_400_000),
    });
    const visible = selectVisibleSubscriptionSlots([paid, older, newer], NOW);
    assert.deepEqual(
      visible.map((s) => s.id),
      ["paid", "newer"],
    );
  });

  it("drops expired activity slots while another activity slot is still valid", () => {
    const live = slot({
      id: "live",
      expiresAt: new Date(NOW + 3_600_000),
    });
    const expired = slot({ id: "expired" });
    const visible = selectVisibleSubscriptionSlots([live, expired], NOW);
    assert.deepEqual(
      visible.map((s) => s.id),
      ["live"],
    );
  });
});
