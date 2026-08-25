import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clashNameFor, targetFingerprint, truncateError } from "./fingerprint.js";
import {
  classifyOverall,
  classifyRegion,
  consecutiveFailCount,
  percentile,
  successRate,
} from "./logic.js";
import { parseNodeProbeValue } from "./settings.js";

describe("node-probe fingerprint", () => {
  it("is stable for the same inbound", () => {
    const a = targetFingerprint("vless", "VNHK002.example.com", 443);
    const b = targetFingerprint("vless", "vnhk002.example.com", 443);
    assert.equal(a, b);
    assert.equal(clashNameFor("vless", a), `vless-${a}`);
  });

  it("differs by port and protocol", () => {
    const a = targetFingerprint("vless", "1.2.3.4", 443);
    const b = targetFingerprint("hysteria2", "1.2.3.4", 443);
    const c = targetFingerprint("vless", "1.2.3.4", 8443);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it("includes fetch cause in truncateError", () => {
    const err = Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:19090"), {
        code: "ECONNREFUSED",
      }),
    });
    const s = truncateError(err);
    assert.match(s, /fetch failed/);
    assert.match(s, /ECONNREFUSED/);
  });
});

describe("node-probe logic", () => {
  it("counts consecutive failures from newest", () => {
    assert.equal(consecutiveFailCount([{ ok: false }, { ok: false }, { ok: true }]), 2);
    assert.equal(consecutiveFailCount([{ ok: true }, { ok: false }]), 0);
  });

  it("classifies overall and region health", () => {
    assert.equal(classifyOverall(10, 0), "operational");
    assert.equal(classifyOverall(8, 2), "degraded");
    assert.equal(classifyOverall(4, 6), "outage");
    assert.equal(classifyRegion(5, 0), "active");
    assert.equal(classifyRegion(3, 2), "partial");
    assert.equal(classifyRegion(0, 4), "offline");
  });

  it("computes p95 and success rate", () => {
    assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
    assert.equal(successRate(8, 2), 0.8);
    assert.equal(successRate(0, 0), null);
  });
});

describe("node-probe settings", () => {
  it("applies defaults and clamps speed interval", () => {
    const v = parseNodeProbeValue({
      delayUrl: "http://www.gstatic.com/generate_204",
      speedIntervalSec: 900,
    });
    assert.equal(v.delayIntervalSec, 120);
    assert.equal(v.mixedPort, 17890);
    assert.equal(v.probeSlotId, null);
  });

  it("rejects too-frequent speed tests", () => {
    assert.throws(() => parseNodeProbeValue({ speedIntervalSec: 60 }));
  });
});
