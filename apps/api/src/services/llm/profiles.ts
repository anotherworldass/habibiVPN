import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../telegram/crypto.js";
import {
  getProjectSetting,
  SETTING_KEYS,
  upsertProjectSetting,
} from "../system-settings.js";

const profileSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  baseUrl: z.string().url().max(500),
  model: z.string().trim().min(1).max(128),
  apiKeyEnc: z.string().min(1).max(2000),
  enabled: z.boolean(),
  remark: z.string().trim().max(255).nullable(),
});

export const llmProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  baseUrl: z.string().url().max(500),
  model: z.string().trim().min(1).max(128),
  apiKey: z.string().max(1000).optional(),
  enabled: z.boolean().default(true),
  remark: z.string().trim().max(255).nullable().optional(),
});

const bundleSchema = z.object({
  profiles: z.array(profileSchema).max(20),
  defaultProfileId: z.string().max(64).nullable(),
});

export type LlmProfile = z.infer<typeof profileSchema>;
export type LlmProfileInput = z.infer<typeof llmProfileInputSchema>;
export type LlmProfileBundle = z.infer<typeof bundleSchema>;
export type LlmProfilePublic = Omit<LlmProfile, "apiKeyEnc"> & {
  hasApiKey: boolean;
};

const CACHE_TTL_MS = 30_000;
const activeCache = new Map<
  string,
  { profile: (LlmProfile & { apiKey: string }) | null; at: number }
>();

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function parseBundle(value: unknown): LlmProfileBundle {
  const parsed = bundleSchema.safeParse(value);
  if (!parsed.success) return { profiles: [], defaultProfileId: null };
  const ids = new Set(parsed.data.profiles.map((profile) => profile.id));
  return {
    profiles: parsed.data.profiles,
    defaultProfileId:
      parsed.data.defaultProfileId && ids.has(parsed.data.defaultProfileId)
        ? parsed.data.defaultProfileId
        : null,
  };
}

function publicProfile(profile: LlmProfile): LlmProfilePublic {
  const { apiKeyEnc, ...safe } = profile;
  return { ...safe, hasApiKey: Boolean(apiKeyEnc) };
}

export async function getLlmProfileBundle(
  projectId: string,
): Promise<LlmProfileBundle> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.LLM_PROVIDERS);
  return row ? parseBundle(row.value) : { profiles: [], defaultProfileId: null };
}

export async function listLlmProfilesPublic(projectId: string) {
  const bundle = await getLlmProfileBundle(projectId);
  return {
    profiles: bundle.profiles.map(publicProfile),
    defaultProfileId: bundle.defaultProfileId,
  };
}

async function persistBundle(projectId: string, bundle: LlmProfileBundle) {
  const value = bundleSchema.parse(bundle);
  await upsertProjectSetting({
    projectId,
    key: SETTING_KEYS.LLM_PROVIDERS,
    value: value as Prisma.InputJsonValue,
    enabled: value.profiles.some((profile) => profile.enabled),
    remark: "OpenAI-compatible model profiles",
  });
  activeCache.delete(projectId);
  return value;
}

export async function createLlmProfile(
  projectId: string,
  input: LlmProfileInput,
) {
  const data = llmProfileInputSchema.parse(input);
  if (!data.apiKey?.trim()) {
    throw Object.assign(new Error("llm.api_key_required"), { statusCode: 400 });
  }
  const bundle = await getLlmProfileBundle(projectId);
  if (bundle.profiles.some((profile) => profile.name === data.name)) {
    throw Object.assign(new Error("llm.name_conflict"), { statusCode: 409 });
  }
  const profile: LlmProfile = {
    id: randomUUID(),
    name: data.name,
    baseUrl: normalizeBaseUrl(data.baseUrl),
    model: data.model,
    apiKeyEnc: encryptSecret(data.apiKey.trim()),
    enabled: data.enabled,
    remark: data.remark || null,
  };
  const next = {
    profiles: [...bundle.profiles, profile],
    defaultProfileId:
      bundle.defaultProfileId || (profile.enabled ? profile.id : null),
  };
  await persistBundle(projectId, next);
  return publicProfile(profile);
}

export async function updateLlmProfile(
  projectId: string,
  profileId: string,
  patch: Partial<LlmProfileInput>,
) {
  const bundle = await getLlmProfileBundle(projectId);
  const index = bundle.profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) {
    throw Object.assign(new Error("llm.profile_not_found"), { statusCode: 404 });
  }
  const previous = bundle.profiles[index]!;
  const mergedInput = llmProfileInputSchema.parse({
    name: patch.name ?? previous.name,
    baseUrl: patch.baseUrl ?? previous.baseUrl,
    model: patch.model ?? previous.model,
    apiKey: patch.apiKey,
    enabled: patch.enabled ?? previous.enabled,
    remark: patch.remark !== undefined ? patch.remark : previous.remark,
  });
  if (
    bundle.profiles.some(
      (profile) =>
        profile.id !== profileId && profile.name === mergedInput.name,
    )
  ) {
    throw Object.assign(new Error("llm.name_conflict"), { statusCode: 409 });
  }
  const profile: LlmProfile = {
    ...previous,
    name: mergedInput.name,
    baseUrl: normalizeBaseUrl(mergedInput.baseUrl),
    model: mergedInput.model,
    apiKeyEnc: mergedInput.apiKey?.trim()
      ? encryptSecret(mergedInput.apiKey.trim())
      : previous.apiKeyEnc,
    enabled: mergedInput.enabled,
    remark: mergedInput.remark || null,
  };
  const profiles = bundle.profiles.slice();
  profiles[index] = profile;
  await persistBundle(projectId, { ...bundle, profiles });
  return publicProfile(profile);
}

export async function deleteLlmProfile(projectId: string, profileId: string) {
  const bundle = await getLlmProfileBundle(projectId);
  if (!bundle.profiles.some((profile) => profile.id === profileId)) {
    throw Object.assign(new Error("llm.profile_not_found"), { statusCode: 404 });
  }
  const profiles = bundle.profiles.filter((profile) => profile.id !== profileId);
  const defaultProfileId =
    bundle.defaultProfileId === profileId
      ? (profiles.find((profile) => profile.enabled)?.id ?? null)
      : bundle.defaultProfileId;
  await persistBundle(projectId, { profiles, defaultProfileId });
}

export async function setDefaultLlmProfile(
  projectId: string,
  profileId: string,
) {
  const bundle = await getLlmProfileBundle(projectId);
  const profile = bundle.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw Object.assign(new Error("llm.profile_not_found"), { statusCode: 404 });
  }
  if (!profile.enabled) {
    throw Object.assign(new Error("llm.profile_disabled"), { statusCode: 400 });
  }
  await persistBundle(projectId, { ...bundle, defaultProfileId: profileId });
}

export async function getActiveLlmProfile(
  projectId: string,
  profileId?: string,
): Promise<(LlmProfile & { apiKey: string }) | null> {
  if (!profileId) {
    const hit = activeCache.get(projectId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.profile;
  }
  const bundle = await getLlmProfileBundle(projectId);
  const id = profileId || bundle.defaultProfileId;
  const profile = bundle.profiles.find(
    (item) => item.id === id && item.enabled,
  );
  const apiKey = profile ? decryptSecret(profile.apiKeyEnc) : null;
  const result = profile && apiKey ? { ...profile, apiKey } : null;
  if (!profileId) activeCache.set(projectId, { profile: result, at: Date.now() });
  return result;
}
