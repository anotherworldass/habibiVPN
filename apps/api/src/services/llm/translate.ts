import { APP_COPY_LOCALES } from "@habibi/shared";
import { z } from "zod";
import type { LlmProfile } from "./profiles.js";

const localeCodes = APP_COPY_LOCALES.map((locale) => locale.code);
const localeLabels = Object.fromEntries(
  APP_COPY_LOCALES.map((locale) => [locale.code, locale.label]),
);

export const translateCopyInputSchema = z.object({
  source_locale: z.literal("zh"),
  target_locales: z
    .array(z.string())
    .min(1)
    .max(Math.max(1, localeCodes.length - 1))
    .refine(
      (items) =>
        new Set(items).size === items.length &&
        items.every((item) => item !== "zh" && localeCodes.includes(item as never)),
      "invalid_target_locales",
    ),
  fields: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
      z.string().trim().min(1).max(8000),
    )
    .refine((value) => Object.keys(value).length <= 10, "too_many_fields"),
  context: z
    .enum(["plan_group", "plan", "announcement", "campaign", "release"])
    .optional(),
});

export type TranslateCopyInput = z.infer<typeof translateCopyInputSchema>;
export type TranslateCopyResult = Record<string, Record<string, string>>;

type ChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

function completionUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

async function upstreamErrorMessage(response: Response): Promise<string> {
  const text = (await response.text()).slice(0, 2000);
  try {
    const body = JSON.parse(text) as {
      error?: { message?: unknown } | string;
      message?: unknown;
      detail?: unknown;
    };
    const value =
      typeof body.error === "object" && body.error
        ? body.error.message
        : typeof body.error === "string"
          ? body.error
          : body.message ?? body.detail;
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 500);
    }
  } catch {
    // Non-JSON response, usually a proxy 404/502 page.
  }
  return text.trim().replace(/\s+/g, " ").slice(0, 200) || "无错误详情";
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    throw Object.assign(new Error("llm.invalid_json_response"), {
      statusCode: 502,
    });
  }
}

export function validateTranslationResult(
  raw: unknown,
  input: TranslateCopyInput,
): TranslateCopyResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Object.assign(new Error("llm.invalid_translation_response"), {
      statusCode: 502,
    });
  }
  const sourceFields = Object.keys(input.fields);
  const allowedFields = new Set(sourceFields);
  const rootKeys = Object.keys(raw as Record<string, unknown>);
  if (
    rootKeys.length !== sourceFields.length ||
    rootKeys.some((field) => !allowedFields.has(field))
  ) {
    throw Object.assign(new Error("llm.translation_fields_mismatch"), {
      statusCode: 502,
    });
  }

  const result: TranslateCopyResult = {};
  for (const field of sourceFields) {
    const translations = (raw as Record<string, unknown>)[field];
    if (
      !translations ||
      typeof translations !== "object" ||
      Array.isArray(translations)
    ) {
      throw Object.assign(new Error("llm.invalid_translation_response"), {
        statusCode: 502,
      });
    }
    const map = translations as Record<string, unknown>;
    if (
      Object.keys(map).length !== input.target_locales.length ||
      input.target_locales.some(
        (locale) => typeof map[locale] !== "string" || !map[locale]?.trim(),
      )
    ) {
      throw Object.assign(new Error("llm.translation_locales_mismatch"), {
        statusCode: 502,
      });
    }
    result[field] = Object.fromEntries(
      input.target_locales.map((locale) => [
        locale,
        (map[locale] as string).trim().slice(0, 8000),
      ]),
    );
  }
  return result;
}

export async function translateCopyWithProfile(
  profile: LlmProfile & { apiKey: string },
  input: TranslateCopyInput,
): Promise<TranslateCopyResult> {
  const targetDescription = input.target_locales
    .map((locale) => `${locale} (${localeLabels[locale] || locale})`)
    .join(", ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(completionUrl(profile.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: profile.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a professional internet product copy translator. Keep every translation concise, natural, user-friendly, and consistent with common internet product UI copywriting conventions; avoid literal translation, unnecessary explanation, and verbose wording. Preserve placeholders, URLs, Markdown, line breaks, version numbers and product names. Return only strict JSON. The root keys must exactly match the input field names. Each field value must be an object whose keys exactly match the requested locale codes.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Translate Simplified Chinese product copy",
              context: input.context || "general",
              source_locale: input.source_locale,
              target_locales: targetDescription,
              required_shape: Object.fromEntries(
                Object.keys(input.fields).map((field) => [
                  field,
                  Object.fromEntries(
                    input.target_locales.map((locale) => [locale, "translation"]),
                  ),
                ]),
              ),
              source_fields: input.fields,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await upstreamErrorMessage(response);
      throw Object.assign(new Error("llm.upstream_error"), {
        statusCode: 502,
        upstreamStatus: response.status,
        publicMessage: `上游返回 ${response.status}：${detail}`,
      });
    }
    const body = (await response.json()) as ChatResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw Object.assign(new Error("llm.empty_response"), { statusCode: 502 });
    }
    return validateTranslationResult(parseJsonContent(content), input);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw Object.assign(new Error("llm.timeout"), { statusCode: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function testLlmProfile(
  profile: LlmProfile & { apiKey: string },
) {
  return translateCopyWithProfile(profile, {
    source_locale: "zh",
    target_locales: ["en"],
    fields: { test: "连接成功" },
    context: "plan",
  });
}
