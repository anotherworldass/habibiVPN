import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatOrderNo, shanghaiDayKey } from "./order-no.js";

describe("shanghaiDayKey", () => {
  it("uses Asia/Shanghai calendar day, not UTC", () => {
    assert.equal(shanghaiDayKey(new Date("2026-08-23T16:00:00.000Z")), "20260824");
    assert.equal(shanghaiDayKey(new Date("2026-08-23T15:59:59.000Z")), "20260823");
  });
});

describe("formatOrderNo", () => {
  it("pads to 13 digits", () => {
    assert.equal(formatOrderNo("20260824", 7), "2026082400007");
    assert.equal(formatOrderNo("20260824", 1), "2026082400001");
    assert.equal(formatOrderNo("20260824", 99999), "2026082499999");
  });

  it("rejects a sequence that does not fit 5 digits", () => {
    assert.throws(() => formatOrderNo("20260824", 100000), /order\.no_exhausted/);
    assert.throws(() => formatOrderNo("20260824", 0), /order\.no_exhausted/);
  });
});
