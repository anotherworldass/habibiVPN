import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalEmail, emailCredentialData, normalizeEmail } from "./email-canonical.js";

describe("canonicalEmail", () => {
  it("collapses Gmail dots, plus tags, and googlemail.com", () => {
    assert.equal(canonicalEmail("aaaa@gmail.com"), "aaaa@gmail.com");
    assert.equal(canonicalEmail("aaa.a@gmail.com"), "aaaa@gmail.com");
    assert.equal(canonicalEmail("a.a.a.a@Gmail.Com"), "aaaa@gmail.com");
    assert.equal(canonicalEmail("aaaa+promo@gmail.com"), "aaaa@gmail.com");
    assert.equal(canonicalEmail("aaa.a+x@googlemail.com"), "aaaa@gmail.com");
  });

  it("does not strip dots on non-Gmail domains", () => {
    assert.equal(canonicalEmail("aaa.a@outlook.com"), "aaa.a@outlook.com");
    assert.equal(canonicalEmail("aaaa+tag@example.com"), "aaaa+tag@example.com");
  });
});

describe("emailCredentialData", () => {
  it("stores lowercase email and Gmail canonical", () => {
    assert.deepEqual(emailCredentialData("Aaa.A@Gmail.com"), {
      email: "aaa.a@gmail.com",
      emailCanonical: "aaaa@gmail.com",
    });
    assert.deepEqual(emailCredentialData(null), {
      email: null,
      emailCanonical: null,
    });
    assert.equal(normalizeEmail("  A@B.COM "), "a@b.com");
  });
});
