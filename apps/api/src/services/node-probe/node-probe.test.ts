import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProbeDigest } from "./alerts-format.js";
import { clashNameFor, targetFingerprint, truncateError } from "./fingerprint.js";
import {
  classifyOverall,
  classifyRegion,
  consecutiveFailCount,
  percentile,
  successRate,
} from "./logic.js";
import { parseNodeProbeValue } from "./settings.js";
import {
  buildHistoryString,
  classifyHistoryDay,
} from "./history.js";

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

describe("node-probe telegram digest", () => {
  const regionName = (c: string) => (c === "HK" ? "香港" : c === "US" ? "美国" : c);

  it("keeps a single item as one message", () => {
    const s = formatProbeDigest({
      emoji: "🐢",
      title: "测速异常",
      items: [{ region: "HK", line: "HK1 / vless · 1.2 Mbps" }],
      regionName,
    });
    assert.match(s, /测速异常/);
    assert.match(s, /香港/);
    assert.match(s, /1\.2 Mbps/);
    assert.doesNotMatch(s, /已合并/);
  });

  it("merges speed alerts into one message grouped by region", () => {
    const s = formatProbeDigest({
      emoji: "🐢",
      title: "测速异常",
      items: [
        { region: "HK", line: "HK1 / vless · 1.2 Mbps" },
        { region: "HK", line: "HK2 / hysteria2 · 0.8 Mbps" },
        { region: "US", line: "US1 / vless · 2.0 Mbps" },
      ],
      regionName,
    });
    assert.match(s, /共 3 条/);
    assert.match(s, /已合并/);
    assert.match(s, /香港/);
    assert.match(s, /美国/);
    assert.match(s, /HK1/);
    assert.match(s, /US1/);
  });

  it("collapses a region when many nodes fail", () => {
    const s = formatProbeDigest({
      emoji: "⚠️",
      title: "节点 Down",
      items: [
        { region: "HK", line: "a" },
        { region: "HK", line: "b" },
        { region: "HK", line: "c" },
      ],
      regionName,
      collapseRegionAt: 3,
    });
    assert.match(s, /香港.*3 条/);
    assert.doesNotMatch(s, /· a/);
  });
});

describe("node-probe history bar", () => {
  it("classifies a day from ok/fail counts", () => {
    assert.equal(classifyHistoryDay(0, 0), "-");
    assert.equal(classifyHistoryDay(10, 0), "g");
    assert.equal(classifyHistoryDay(0, 4), "r");
    assert.equal(classifyHistoryDay(9, 1), "y");
    assert.equal(classifyHistoryDay(19, 1), "g");
    assert.equal(classifyHistoryDay(6, 4), "y");
    assert.equal(classifyHistoryDay(2, 8), "r");
  });

  it("builds 90 cells oldest to newest", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const s = buildHistoryString(
      [
        { hour: new Date("2026-08-26T01:00:00.000Z"), okCount: 10, failCount: 0 },
        { hour: new Date("2026-08-25T01:00:00.000Z"), okCount: 0, failCount: 5 },
      ],
      90,
      now,
    );
    assert.equal(s.length, 90);
    assert.equal(s.endsWith("rg"), true);
    assert.equal(s.slice(0, 88), "-".repeat(88));
  });
});
