import assert from "node:assert/strict";
import test from "node:test";
import {
  inferThirdPartyDownloadChannel,
  isHttpsUrl,
  parseThirdPartyClientsValue,
} from "./third-party-clients.js";

test("infers download channel from official hosts", () => {
  assert.equal(
    inferThirdPartyDownloadChannel(
      "https://apps.apple.com/app/shadowrocket/id932747118",
    ),
    "app_store",
  );
  assert.equal(
    inferThirdPartyDownloadChannel("https://play.google.com/store/apps/details?id=x"),
    "play",
  );
  assert.equal(
    inferThirdPartyDownloadChannel(
      "https://github.com/hiddify/hiddify-app/releases",
    ),
    "github",
  );
  assert.equal(
    inferThirdPartyDownloadChannel("https://nssurge.com/"),
    "website",
  );
});

test("rejects non-https download urls", () => {
  assert.equal(isHttpsUrl("http://example.com/app"), false);
  assert.equal(isHttpsUrl("https://example.com/app"), true);
  assert.equal(isHttpsUrl("not-a-url"), false);
});

test("parses a flat client row and drops empty platforms", () => {
  const parsed = parseThirdPartyClientsValue({
    clients: [
      {
        id: "ShadowRocket",
        enabled: true,
        featured: true,
        paid: true,
        sort: 1,
        import_key: "shadowrocket",
        name_i18n: { zh: "小火箭", en: "Shadowrocket" },
        summary_i18n: { zh: "iOS 客户端" },
        tip_i18n: { zh: "需美区" },
        urls: {
          ios: "https://apps.apple.com/app/shadowrocket/id932747118",
          android: "",
          windows: "ftp://bad.example/clash",
        },
      },
      {
        id: "",
        name_i18n: { zh: "空行应丢弃" },
      },
    ],
  });
  assert.equal(parsed.clients.length, 1);
  assert.equal(parsed.clients[0]?.id, "shadowrocket");
  assert.deepEqual(parsed.clients[0]?.urls, {
    ios: "https://apps.apple.com/app/shadowrocket/id932747118",
  });
});

test("dedupes ids and requires a Chinese name", () => {
  const parsed = parseThirdPartyClientsValue({
    clients: [
      {
        id: "hiddify",
        name_i18n: { zh: "Hiddify" },
        urls: { android: "https://github.com/hiddify/hiddify-app/releases" },
      },
      {
        id: "hiddify",
        name_i18n: { zh: "Hiddify 2" },
        urls: { windows: "https://github.com/hiddify/hiddify-app/releases" },
      },
      {
        id: "broken",
        name_i18n: { en: "No Chinese name" },
        urls: { linux: "https://example.com/app" },
      },
    ],
  });
  assert.equal(parsed.clients.length, 2);
  assert.deepEqual(
    parsed.clients.map((item) => item.id),
    ["hiddify", "hiddify-2"],
  );
});
