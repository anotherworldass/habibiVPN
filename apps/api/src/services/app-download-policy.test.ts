import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  downloadVersionBucket,
  resolveDownloadActionUrl,
  shanghaiDay,
  uniquePackagesByPlatform,
} from "./app-download-policy.js";

describe("download action URL", () => {
  it("uses the store URL for store clients", () => {
    assert.equal(
      resolveDownloadActionUrl(
        { client: "ios_appstore", storeUrl: "https://apps.example/default" },
        {
          downloadUrl: "https://cdn.example/app.ipa",
          storeUrl: "https://apps.example/release",
        },
      ),
      "https://apps.example/release",
    );
  });

  it("uses the release artifact for direct clients", () => {
    assert.equal(
      resolveDownloadActionUrl(
        { client: "android_direct", storeUrl: null },
        { downloadUrl: "https://cdn.example/app.apk", storeUrl: null },
      ),
      "https://cdn.example/app.apk",
    );
  });

  it("returns null when no redirect target exists", () => {
    assert.equal(
      resolveDownloadActionUrl(
        { client: "android_direct", storeUrl: null },
        { downloadUrl: null, storeUrl: null },
      ),
      null,
    );
  });
});

describe("download version buckets", () => {
  it("records a stable release id and version snapshot", () => {
    assert.deepEqual(
      downloadVersionBucket({ id: "release_1", versionName: "1.3.0", versionCode: 130 }),
      {
        releaseId: "release_1",
        versionKey: "release_1",
        versionName: "1.3.0",
        versionCode: 130,
      },
    );
  });

  it("uses one stable bucket when no release exists", () => {
    assert.deepEqual(downloadVersionBucket(null), {
      releaseId: null,
      versionKey: "unversioned",
      versionName: null,
      versionCode: null,
    });
  });
});

describe("website package selection", () => {
  it("keeps at most one listed package per platform", () => {
    const selected = uniquePackagesByPlatform([
      { id: "ios-primary", platform: "ios" },
      { id: "ios-duplicate", platform: "ios" },
      { id: "android", platform: "android" },
    ]);
    assert.deepEqual(
      selected.map((row) => row.id),
      ["ios-primary", "android"],
    );
  });
});

describe("download day buckets", () => {
  it("uses the Asia/Shanghai calendar day", () => {
    assert.equal(
      shanghaiDay(new Date("2026-08-19T16:30:00.000Z")).toISOString(),
      "2026-08-20T00:00:00.000Z",
    );
  });
});
