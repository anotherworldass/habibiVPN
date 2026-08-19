import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareInviteEnvironment,
  isIgnoredIp,
  maskIp,
  uaStem,
  type AuthEnvRow,
} from "./invite-env.js";

function row(partial: Partial<AuthEnvRow>): AuthEnvRow {
  return {
    ip: null,
    deviceIdHash: null,
    timezone: null,
    locale: null,
    osName: null,
    userAgent: null,
    ...partial,
  };
}

describe("isIgnoredIp", () => {
  it("drops loopback and RFC1918", () => {
    assert.equal(isIgnoredIp("127.0.0.1"), true);
    assert.equal(isIgnoredIp("::1"), true);
    assert.equal(isIgnoredIp("10.0.0.8"), true);
    assert.equal(isIgnoredIp("192.168.1.20"), true);
    assert.equal(isIgnoredIp("172.16.0.1"), true);
    assert.equal(isIgnoredIp("172.31.255.1"), true);
    assert.equal(isIgnoredIp("::ffff:127.0.0.1"), true);
  });

  it("keeps public IPv4", () => {
    assert.equal(isIgnoredIp("91.132.10.4"), false);
    assert.equal(isIgnoredIp("8.8.8.8"), false);
    assert.equal(isIgnoredIp("172.32.0.1"), false);
  });
});

describe("uaStem / maskIp", () => {
  it("cuts UA at the first parenthesis", () => {
    assert.equal(uaStem("Dart/3.11 (dart:io)"), "dart/3.11");
    assert.equal(
      uaStem("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/"),
      "mozilla/5.0",
    );
  });

  it("masks IPv4 last two octets", () => {
    assert.equal(maskIp("91.132.10.4"), "91.132.*.*");
  });
});

describe("compareInviteEnvironment", () => {
  it("flags public same IP", () => {
    const r = compareInviteEnvironment(
      [row({ ip: "91.132.10.4" })],
      [row({ ip: "91.132.10.4" }), row({ ip: "8.8.8.8" })],
    );
    assert.deepEqual(r.flags, ["same_ip"]);
    assert.deepEqual(r.shared_ips, ["91.132.*.*"]);
  });

  it("ignores private IP overlap", () => {
    const r = compareInviteEnvironment(
      [row({ ip: "192.168.1.8" })],
      [row({ ip: "192.168.1.8" })],
    );
    assert.deepEqual(r.flags, []);
    assert.deepEqual(r.shared_ips, []);
  });

  it("flags same device hash", () => {
    const r = compareInviteEnvironment(
      [row({ deviceIdHash: "abc123", ip: "10.0.0.1" })],
      [row({ deviceIdHash: "abc123", ip: "10.0.0.1" })],
    );
    assert.deepEqual(r.flags, ["same_device"]);
    assert.equal(r.shared_device_count, 1);
  });

  it("does not flag similar env on timezone+locale+os without UA stem match", () => {
    const r = compareInviteEnvironment(
      [
        row({
          timezone: "+04",
          locale: "zh_Hans_AE",
          osName: "iOS",
          userAgent: "Dart/3.11 (dart:io)",
        }),
      ],
      [
        row({
          timezone: "+04",
          locale: "zh_Hans_AE",
          osName: "iOS",
          userAgent: "Mozilla/5.0 (iPhone) Safari",
        }),
      ],
    );
    assert.deepEqual(r.flags, []);
    assert.equal(r.similar, null);
  });

  it("flags similar env when tz+locale+os+UA stem match", () => {
    const a = row({
      timezone: "+04",
      locale: "zh_Hans_AE",
      osName: "iOS",
      userAgent: "Dart/3.11 (dart:io)",
    });
    const r = compareInviteEnvironment([a], [a]);
    assert.deepEqual(r.flags, ["similar_env"]);
    assert.equal(r.similar?.ua_stem, "dart/3.11");
  });

  it("does not add similar_env when same IP already matched", () => {
    const a = row({
      ip: "8.8.8.8",
      timezone: "+04",
      locale: "zh_Hans_AE",
      osName: "iOS",
      userAgent: "Dart/3.11 (dart:io)",
    });
    const r = compareInviteEnvironment([a], [a]);
    assert.deepEqual(r.flags, ["same_ip"]);
    assert.equal(r.similar, null);
  });

  it("handles empty events", () => {
    const r = compareInviteEnvironment([], [row({ ip: "8.8.8.8" })]);
    assert.deepEqual(r.flags, []);
    assert.equal(r.event_count_a, 0);
    assert.equal(r.event_count_b, 1);
  });
});
