import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { grantRetryDelayMs, parseGrantPayload } from "./upstream-grant-queue.js";

describe("grantRetryDelayMs", () => {
  it("backs off 1m / 5m / 15m", () => {
    assert.equal(grantRetryDelayMs(1), 60_000);
    assert.equal(grantRetryDelayMs(2), 5 * 60_000);
    assert.equal(grantRetryDelayMs(3), 15 * 60_000);
    assert.equal(grantRetryDelayMs(10), 15 * 60_000);
  });
});

describe("parseGrantPayload", () => {
  it("accepts create_slot and grant_duration", () => {
    assert.equal(parseGrantPayload({ op: "create_slot", planId: "p1" })?.op, "create_slot");
    assert.equal(
      parseGrantPayload({ op: "grant_duration", seconds: 3600 })?.op,
      "grant_duration",
    );
    assert.equal(parseGrantPayload({ op: "nope" }), null);
    assert.equal(parseGrantPayload(null), null);
  });
});
