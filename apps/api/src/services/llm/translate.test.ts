import assert from "node:assert/strict";
import test from "node:test";
import { llmProfileInputSchema } from "./profiles.js";
import {
  translateCopyInputSchema,
  validateTranslationResult,
} from "./translate.js";

test("accepts an OpenAI-compatible profile input", () => {
  const parsed = llmProfileInputSchema.parse({
    name: "Default",
    baseUrl: "https://api.example.com/v1",
    model: "example-model",
    apiKey: "secret",
    enabled: true,
  });
  assert.equal(parsed.model, "example-model");
});

test("validates exact translation fields and locales", () => {
  const input = translateCopyInputSchema.parse({
    source_locale: "zh",
    target_locales: ["en"],
    fields: { name: "月度套餐", description: "适合日常使用" },
    context: "plan",
  });
  assert.deepEqual(
    validateTranslationResult(
      {
        name: { en: "Monthly plan" },
        description: { en: "Best for everyday use" },
      },
      input,
    ),
    {
      name: { en: "Monthly plan" },
      description: { en: "Best for everyday use" },
    },
  );
});

test("rejects extra fields returned by the model", () => {
  const input = translateCopyInputSchema.parse({
    source_locale: "zh",
    target_locales: ["en"],
    fields: { title: "新版本" },
    context: "release",
  });
  assert.throws(
    () =>
      validateTranslationResult(
        { title: { en: "New version" }, injected: { en: "bad" } },
        input,
      ),
    /llm\.translation_fields_mismatch/,
  );
});

test("rejects unsupported target locales", () => {
  assert.equal(
    translateCopyInputSchema.safeParse({
      source_locale: "zh",
      target_locales: ["fr"],
      fields: { title: "标题" },
    }).success,
    false,
  );
});
