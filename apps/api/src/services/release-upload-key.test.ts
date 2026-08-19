import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashReleaseUploadKey,
  newReleaseUploadKey,
} from "./release-upload-key.js";

describe("release upload keys", () => {
  it("generates prefixed high-entropy keys", () => {
    const first = newReleaseUploadKey();
    const second = newReleaseUploadKey();
    assert.match(first, /^hb_upload_[A-Za-z0-9_-]{32}$/);
    assert.notEqual(first, second);
  });

  it("stores a deterministic SHA-256 hash instead of plaintext", () => {
    const plaintext = "hb_upload_example";
    const hash = hashReleaseUploadKey(plaintext);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.notEqual(hash, plaintext);
    assert.equal(hashReleaseUploadKey(plaintext), hash);
  });
});
