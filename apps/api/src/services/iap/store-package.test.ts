import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchAppleBundle,
  rejectForgedTicketIfLive,
  resolveAndroidPackage,
  type StorePackageRow,
} from "./store-package-match.js";

const titivpnIos: StorePackageRow = {
  projectId: "proj_titi",
  enabled: true,
  packageName: "com.titivpn",
  platform: "ios",
  client: "ios_appstore",
  isPrimary: true,
  createdAt: 1,
};

const otherBrandIos: StorePackageRow = {
  projectId: "proj_other",
  enabled: true,
  packageName: "com.other.vpn",
  platform: "ios",
  client: "ios_appstore",
  isPrimary: true,
  createdAt: 1,
};

const disabledIos: StorePackageRow = {
  ...titivpnIos,
  enabled: false,
  packageName: "com.titivpn.disabled",
};

const androidPlay: StorePackageRow = {
  projectId: "proj_titi",
  enabled: true,
  packageName: "com.titivpn",
  platform: "android",
  client: "android_play",
  isPrimary: true,
  createdAt: 1,
};

const androidDirect: StorePackageRow = {
  projectId: "proj_titi",
  enabled: true,
  packageName: "com.titivpn.direct",
  platform: "android",
  client: "android_direct",
  isPrimary: false,
  createdAt: 2,
};

const packages: StorePackageRow[] = [
  titivpnIos,
  otherBrandIos,
  disabledIos,
  androidPlay,
  androidDirect,
];

describe("rejectForgedTicketIfLive", () => {
  it("live rejects mock: and JSON tickets", () => {
    assert.throws(
      () => rejectForgedTicketIfLive("live", "mock:t_monthly_1:tx1"),
      (e: Error) => e.message === "iap.mock_not_allowed_in_live",
    );
    assert.throws(
      () => rejectForgedTicketIfLive("live", '{"productId":"t_monthly_1"}'),
      (e: Error) => e.message === "iap.mock_not_allowed_in_live",
    );
  });

  it("live allows a real JWS-looking string through (verify happens later)", () => {
    assert.doesNotThrow(() =>
      rejectForgedTicketIfLive("live", "eyJhbGciOiJFUzI1NiJ9.e30.sig"),
    );
  });

  it("mock still accepts forged tickets", () => {
    assert.doesNotThrow(() =>
      rejectForgedTicketIfLive("mock", "mock:t_monthly_1:tx1"),
    );
  });
});

describe("matchAppleBundle", () => {
  it("accepts the same-project enabled iOS 马甲", () => {
    const hit = matchAppleBundle(packages, "proj_titi", "com.titivpn");
    assert.equal(hit?.packageName, "com.titivpn");
  });

  it("rejects a bundle registered only on another project", () => {
    assert.equal(
      matchAppleBundle(packages, "proj_titi", "com.other.vpn"),
      null,
    );
  });

  it("rejects an unregistered bundle", () => {
    assert.equal(
      matchAppleBundle(packages, "proj_titi", "com.example.habibi"),
      null,
    );
  });

  it("rejects an empty bundle", () => {
    assert.equal(matchAppleBundle(packages, "proj_titi", "  "), null);
  });

  it("rejects a disabled 马甲", () => {
    assert.equal(
      matchAppleBundle(packages, "proj_titi", "com.titivpn.disabled"),
      null,
    );
  });
});

describe("resolveAndroidPackage", () => {
  it("uses the requested name when it belongs to the project", () => {
    const hit = resolveAndroidPackage(packages, "proj_titi", "com.titivpn");
    assert.deepEqual(hit, { packageName: "com.titivpn" });
  });

  it("rejects a package name from another project", () => {
    const hit = resolveAndroidPackage(packages, "proj_titi", "com.other.vpn");
    assert.deepEqual(hit, { error: "iap.package_mismatch" });
  });

  it("falls back to the primary Android / Play 马甲", () => {
    const hit = resolveAndroidPackage(packages, "proj_titi", null);
    assert.deepEqual(hit, { packageName: "com.titivpn" });
  });

  it("requires a 马甲 when the project has none", () => {
    const hit = resolveAndroidPackage(packages, "proj_empty", null);
    assert.deepEqual(hit, { error: "iap.package_name_required" });
  });
});
