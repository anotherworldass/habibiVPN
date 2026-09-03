import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WireRawError,
  isAbortOrNetworkError,
  isRetryableUpstreamError,
} from "./client.js";

describe("isRetryableUpstreamError", () => {
  it("retries 5xx / 429 / timeout codes", () => {
    assert.equal(
      isRetryableUpstreamError(new WireRawError(503, "upstream.unavailable", {})),
      true,
    );
    assert.equal(
      isRetryableUpstreamError(new WireRawError(504, "http.504", {})),
      true,
    );
    assert.equal(
      isRetryableUpstreamError(new WireRawError(429, "rate_limited", {})),
      true,
    );
    assert.equal(
      isRetryableUpstreamError(new WireRawError(408, "http.408", {})),
      true,
    );
  });

  it("does not retry business 4xx", () => {
    assert.equal(
      isRetryableUpstreamError(new WireRawError(409, "conflict", {})),
      false,
    );
    assert.equal(
      isRetryableUpstreamError(new WireRawError(400, "validation", {})),
      false,
    );
    assert.equal(
      isRetryableUpstreamError(new WireRawError(404, "not_found", {})),
      false,
    );
  });

  it("retries abort / network transport errors", () => {
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });
    assert.equal(isAbortOrNetworkError(timeout), true);
    assert.equal(isRetryableUpstreamError(timeout), true);

    const refused = Object.assign(new Error("connect"), {
      code: "ECONNREFUSED",
    });
    assert.equal(isRetryableUpstreamError(refused), true);
  });
});
