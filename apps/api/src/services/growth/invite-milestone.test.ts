import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextPerInviteGrants } from "./invite-milestone.js";
import { normalizeInviteRules } from "./types.js";

describe("normalizeInviteRules perInvitePlanId", () => {
  const base = {
    invite: {
      requiredCount: 3,
      grantMode: "auto" as const,
    },
  };

  it("treats missing or blank as off", () => {
    assert.equal(normalizeInviteRules(base)?.perInvitePlanId, null);
    assert.equal(
      normalizeInviteRules({
        invite: { ...base.invite, perInvitePlanId: "  " },
      })?.perInvitePlanId,
      null,
    );
    assert.equal(
      normalizeInviteRules({
        invite: { ...base.invite, perInvitePlanId: null },
      })?.perInvitePlanId,
      null,
    );
  });

  it("keeps a non-empty plan id", () => {
    assert.equal(
      normalizeInviteRules({
        invite: { ...base.invite, perInvitePlanId: " plan_per " },
      })?.perInvitePlanId,
      "plan_per",
    );
  });
});

describe("nextPerInviteGrants", () => {
  it("grants nothing without a per-invite cap (N=1)", () => {
    assert.deepEqual(
      nextPerInviteGrants({
        qualifiedIds: ["a", "b"],
        requiredCount: 1,
        existing: [],
      }),
      [],
    );
  });

  it("grants the first N-1 qualified invites", () => {
    assert.deepEqual(
      nextPerInviteGrants({
        qualifiedIds: ["a", "b"],
        requiredCount: 3,
        existing: [],
      }),
      [
        { inviteeId: "a", attemptIndex: 1 },
        { inviteeId: "b", attemptIndex: 2 },
      ],
    );
  });

  it("does not grant the Nth invite a per-invite reward", () => {
    assert.deepEqual(
      nextPerInviteGrants({
        qualifiedIds: ["a", "b", "c"],
        requiredCount: 3,
        existing: [],
      }),
      [
        { inviteeId: "a", attemptIndex: 1 },
        { inviteeId: "b", attemptIndex: 2 },
      ],
    );
  });

  it("skips invitees already granted", () => {
    assert.deepEqual(
      nextPerInviteGrants({
        qualifiedIds: ["a", "b", "c"],
        requiredCount: 3,
        existing: [{ inviteeId: "a", attemptIndex: 1 }],
      }),
      [{ inviteeId: "b", attemptIndex: 2 }],
    );
  });

  it("does not grant the same invitee twice", () => {
    const first = nextPerInviteGrants({
      qualifiedIds: ["a"],
      requiredCount: 3,
      existing: [],
    });
    assert.deepEqual(first, [{ inviteeId: "a", attemptIndex: 1 }]);
    assert.deepEqual(
      nextPerInviteGrants({
        qualifiedIds: ["a", "b"],
        requiredCount: 3,
        existing: first,
      }),
      [{ inviteeId: "b", attemptIndex: 2 }],
    );
  });

  it("leaves milestone eligibility independent of per-invite claims", () => {
    const perInvite = nextPerInviteGrants({
      qualifiedIds: ["a", "b", "c"],
      requiredCount: 3,
      existing: [],
    });
    assert.equal(perInvite.length, 2);
    const stillPendingNth = perInvite.every((g) => g.inviteeId !== "c");
    assert.equal(stillPendingNth, true);
  });
});
