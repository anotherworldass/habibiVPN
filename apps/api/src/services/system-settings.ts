import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const SETTING_KEYS = {
  MAIL_SES: "mail.ses",
  AUTH_EMAIL: "auth.email",
  MAIL_RATE_LIMIT: "mail.rate_limit",
  /** @deprecated legacy single bucket; migrated into STORAGE_S3_PROFILES on read/write */
  STORAGE_S3: "storage.s3",
  STORAGE_S3_PROFILES: "storage.s3.profiles",
  TELEGRAM_QUICK_REPLIES: "telegram.quick_replies",
  TELEGRAM_WEBHOOK_ORIGIN: "telegram.webhook_origin",
  /** User-facing support chat: latest N messages window. */
  SUPPORT_CLIENT_MESSAGE_WINDOW: "support.client_message_window",
  /** Staff Telegram bot that forwards support desk messages. */
  SUPPORT_TELEGRAM_FORWARD: "support.telegram_forward",
  /** Extra notice nodes prepended to converted subscriptions. */
  SUBSCRIPTION_NOTICE: "subscription.notice",
  /** How converted subscription node names are rewritten. */
  SUBSCRIPTION_NODE_NAME: "subscription.node_name",
  /** Public origins used to build /api/v1/sub client URLs. */
  SUBSCRIPTION_DOMAINS: "subscription.domains",
  /** OpenAI-compatible models available to admin translation tools. */
  LLM_PROVIDERS: "llm.providers",
  /** Auto-grant a trial plan after register / identity events. */
  SIGNUP_TRIAL: "signup.trial",
} as const;

/** Modules that can bind to a named S3 profile. */
export const STORAGE_S3_ROLES = ["support", "app_dist", "config"] as const;
export type StorageS3Role = (typeof STORAGE_S3_ROLES)[number];

/** Roles that fan-out to multiple buckets (backup / anti-censorship). */
export const STORAGE_S3_MULTI_ROLES = ["app_dist", "config"] as const;
export type StorageS3MultiRole = (typeof STORAGE_S3_MULTI_ROLES)[number];

export function isStorageS3MultiRole(
  role: StorageS3Role,
): role is StorageS3MultiRole {
  return (STORAGE_S3_MULTI_ROLES as readonly string[]).includes(role);
}

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Project auth/email policy (effective defaults when unset or disabled). */
export const authEmailValueSchema = z.object({
  /** Anonymous UID may bind email+password without OTP → unverified. */
  allowSoftBindWithoutCode: z.boolean(),
  /** Unverified email may log in with email+password. */
  allowUnverifiedPasswordLogin: z.boolean(),
  /** Verified register/bind may strip an unverified holder of the same email. */
  allowClaimUnverifiedEmail: z.boolean(),
  /** Treat Gmail dots / plus-tags / googlemail.com as the same mailbox. */
  blockGmailAliasVariants: z.boolean(),
});

export type AuthEmailValue = z.infer<typeof authEmailValueSchema>;

export const DEFAULT_AUTH_EMAIL_VALUE: AuthEmailValue = {
  allowSoftBindWithoutCode: true,
  allowUnverifiedPasswordLogin: false,
  allowClaimUnverifiedEmail: true,
  blockGmailAliasVariants: false,
};

export const SIGNUP_TRIAL_TRIGGERS = [
  "any_register",
  "verified_email",
  "bootstrap",
  "identity",
] as const;

export type SignupTrialTrigger = (typeof SIGNUP_TRIAL_TRIGGERS)[number];

export const signupTrialValueSchema = z.object({
  planId: z.string().max(64),
  trigger: z.enum(SIGNUP_TRIAL_TRIGGERS),
});

export type SignupTrialValue = z.infer<typeof signupTrialValueSchema>;

export const DEFAULT_SIGNUP_TRIAL_VALUE: SignupTrialValue = {
  planId: "",
  trigger: "any_register",
};

/** Mail OTP / reset send anti-abuse limits (Redis counters). */
export const mailRateLimitValueSchema = z.object({
  /** Same email + purpose cooldown between sends. */
  emailCooldownSeconds: z.number().int().min(0).max(3600),
  /** Max send attempts per email per hour. */
  emailPerHour: z.number().int().min(1).max(100),
  /** Max send attempts per IP per minute. */
  ipPerMinute: z.number().int().min(1).max(1000),
  /** Max send attempts per IP per hour. */
  ipPerHour: z.number().int().min(1).max(10_000),
  /** Max actual SES sends per project per minute. */
  projectPerMinute: z.number().int().min(1).max(10_000),
});

export type MailRateLimitValue = z.infer<typeof mailRateLimitValueSchema>;

export const DEFAULT_MAIL_RATE_LIMIT_VALUE: MailRateLimitValue = {
  emailCooldownSeconds: 60,
  emailPerHour: 5,
  ipPerMinute: 10,
  ipPerHour: 60,
  projectPerMinute: 120,
};

/** Soft TTL so other API instances pick up admin edits without restart. */
const MAIL_RATE_LIMIT_CACHE_TTL_MS = 30_000;
const mailRateLimitCache = new Map<
  string,
  { value: MailRateLimitValue; at: number }
>();

/** User chat widget / App WebView: how many latest messages to return. */
export const SUPPORT_CLIENT_MESSAGE_WINDOW_MIN = 20;
export const SUPPORT_CLIENT_MESSAGE_WINDOW_MAX = 500;

export const supportClientMessageWindowValueSchema = z.object({
  messageWindowSize: z
    .number()
    .int()
    .min(SUPPORT_CLIENT_MESSAGE_WINDOW_MIN)
    .max(SUPPORT_CLIENT_MESSAGE_WINDOW_MAX),
});

export type SupportClientMessageWindowValue = z.infer<
  typeof supportClientMessageWindowValueSchema
>;

export const DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE: SupportClientMessageWindowValue =
  {
    messageWindowSize: 100,
  };

const SUPPORT_CLIENT_MESSAGE_WINDOW_CACHE_TTL_MS = 30_000;
const supportClientMessageWindowCache = new Map<
  string,
  { value: SupportClientMessageWindowValue; at: number }
>();

/** Clients that can receive prepended notice nodes. */
export const SUBSCRIPTION_NOTICE_CLIENTS = [
  "shadowrocket",
  "clash",
  "hiddify",
  "v2ray",
  "surge",
  "quantumult_x",
] as const;

export type SubscriptionNoticeClient =
  (typeof SUBSCRIPTION_NOTICE_CLIENTS)[number];

export const SUBSCRIPTION_NOTICE_ITEM_MAX = 80;
export const SUBSCRIPTION_NOTICE_ITEMS_MAX = 15;
export const SUBSCRIPTION_PROFILE_TITLE_MAX = 80;

export const subscriptionNoticeClientBlockSchema = z.object({
  enabled: z.boolean(),
  items: z
    .array(z.string().trim().min(1).max(SUBSCRIPTION_NOTICE_ITEM_MAX))
    .max(SUBSCRIPTION_NOTICE_ITEMS_MAX),
  profile_title: z.string().trim().max(SUBSCRIPTION_PROFILE_TITLE_MAX),
});

export type SubscriptionNoticeClientBlock = z.infer<
  typeof subscriptionNoticeClientBlockSchema
>;

export const subscriptionNoticeValueSchema = z.object({
  by_client: z.object({
    shadowrocket: subscriptionNoticeClientBlockSchema,
    clash: subscriptionNoticeClientBlockSchema,
    hiddify: subscriptionNoticeClientBlockSchema,
    v2ray: subscriptionNoticeClientBlockSchema,
    surge: subscriptionNoticeClientBlockSchema,
    quantumult_x: subscriptionNoticeClientBlockSchema,
  }),
});

export type SubscriptionNoticeValue = z.infer<
  typeof subscriptionNoticeValueSchema
>;

function emptyNoticeClientBlock(): SubscriptionNoticeClientBlock {
  return { enabled: false, items: [], profile_title: "" };
}

export function emptySubscriptionNoticeByClient(): SubscriptionNoticeValue["by_client"] {
  return {
    shadowrocket: emptyNoticeClientBlock(),
    clash: emptyNoticeClientBlock(),
    hiddify: emptyNoticeClientBlock(),
    v2ray: emptyNoticeClientBlock(),
    surge: emptyNoticeClientBlock(),
    quantumult_x: emptyNoticeClientBlock(),
  };
}

export const DEFAULT_SUBSCRIPTION_NOTICE_VALUE: SubscriptionNoticeValue = {
  by_client: emptySubscriptionNoticeByClient(),
};

const SUBSCRIPTION_NOTICE_CACHE_TTL_MS = 30_000;
const subscriptionNoticeCache = new Map<
  string,
  { value: SubscriptionNoticeValue | null; at: number }
>();

const SECRET_MASK = "********";

export const mailSesValueSchema = z.object({
  region: z.string().min(1).max(64),
  accessKeyId: z.string().min(1).max(128),
  secretAccessKey: z.string().min(1).max(256),
  fromEmail: z.string().email().max(320),
  fromName: z.string().max(128).nullable().optional(),
  configurationSet: z.string().max(128).nullable().optional(),
});

export type MailSesValue = z.infer<typeof mailSesValueSchema>;

export type MailSesPublicValue = Omit<MailSesValue, "secretAccessKey"> & {
  secretAccessKey: typeof SECRET_MASK | "";
  secret_set: boolean;
};

const EMPTY_MAIL_SES_PUBLIC: MailSesPublicValue = {
  region: "ap-southeast-1",
  accessKeyId: "",
  secretAccessKey: "",
  fromEmail: "",
  fromName: null,
  configurationSet: null,
  secret_set: false,
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function maskMailSesValue(raw: unknown): MailSesPublicValue {
  const o = asObject(raw);
  const secret =
    typeof o.secretAccessKey === "string" ? o.secretAccessKey.trim() : "";
  return {
    region:
      typeof o.region === "string" && o.region.trim()
        ? o.region.trim()
        : EMPTY_MAIL_SES_PUBLIC.region,
    accessKeyId:
      typeof o.accessKeyId === "string" ? o.accessKeyId.trim() : "",
    secretAccessKey: secret ? SECRET_MASK : "",
    fromEmail: typeof o.fromEmail === "string" ? o.fromEmail.trim() : "",
    fromName:
      typeof o.fromName === "string" && o.fromName.trim()
        ? o.fromName.trim()
        : null,
    configurationSet:
      typeof o.configurationSet === "string" && o.configurationSet.trim()
        ? o.configurationSet.trim()
        : null,
    secret_set: !!secret,
  };
}

/** Merge admin patch; keep previous secret when mask / empty. */
export function mergeMailSesValue(
  previous: unknown,
  patch: Record<string, unknown>,
): MailSesValue {
  const prev = asObject(previous);
  const prevSecret =
    typeof prev.secretAccessKey === "string" ? prev.secretAccessKey : "";
  const incomingSecret =
    typeof patch.secretAccessKey === "string" ? patch.secretAccessKey : "";
  const keepSecret =
    !incomingSecret ||
    incomingSecret === SECRET_MASK ||
    incomingSecret === prevSecret;

  const merged = {
    region: patch.region ?? prev.region,
    accessKeyId: patch.accessKeyId ?? prev.accessKeyId,
    secretAccessKey: keepSecret ? prevSecret : incomingSecret,
    fromEmail: patch.fromEmail ?? prev.fromEmail,
    fromName:
      patch.fromName !== undefined ? patch.fromName : (prev.fromName ?? null),
    configurationSet:
      patch.configurationSet !== undefined
        ? patch.configurationSet
        : (prev.configurationSet ?? null),
  };

  const parsed = mailSesValueSchema.safeParse(merged);
  if (!parsed.success) {
    throw Object.assign(new Error("mail.ses.invalid"), {
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export async function getProjectSetting(projectId: string, key: SettingKey) {
  return prisma.systemSetting.findUnique({
    where: { projectId_key: { projectId, key } },
  });
}

export async function upsertProjectSetting(input: {
  projectId: string;
  key: SettingKey;
  value: Prisma.InputJsonValue;
  enabled: boolean;
  remark?: string | null;
}) {
  return prisma.systemSetting.upsert({
    where: {
      projectId_key: { projectId: input.projectId, key: input.key },
    },
    create: {
      projectId: input.projectId,
      key: input.key,
      value: input.value,
      enabled: input.enabled,
      remark: input.remark ?? null,
    },
    update: {
      value: input.value,
      enabled: input.enabled,
      ...(input.remark !== undefined ? { remark: input.remark } : {}),
    },
  });
}

export async function getMailSesConfig(projectId: string): Promise<{
  enabled: boolean;
  value: MailSesValue | null;
  publicValue: MailSesPublicValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.MAIL_SES);
  if (!row) {
    return {
      enabled: false,
      value: null,
      publicValue: EMPTY_MAIL_SES_PUBLIC,
      remark: null,
    };
  }
  const parsed = mailSesValueSchema.safeParse(row.value);
  return {
    enabled: row.enabled,
    value: parsed.success ? parsed.data : null,
    publicValue: maskMailSesValue(row.value),
    remark: row.remark,
  };
}

export function parseAuthEmailValue(raw: unknown): AuthEmailValue {
  const o = asObject(raw);
  const merged = {
    allowSoftBindWithoutCode:
      typeof o.allowSoftBindWithoutCode === "boolean"
        ? o.allowSoftBindWithoutCode
        : DEFAULT_AUTH_EMAIL_VALUE.allowSoftBindWithoutCode,
    allowUnverifiedPasswordLogin:
      typeof o.allowUnverifiedPasswordLogin === "boolean"
        ? o.allowUnverifiedPasswordLogin
        : DEFAULT_AUTH_EMAIL_VALUE.allowUnverifiedPasswordLogin,
    allowClaimUnverifiedEmail:
      typeof o.allowClaimUnverifiedEmail === "boolean"
        ? o.allowClaimUnverifiedEmail
        : DEFAULT_AUTH_EMAIL_VALUE.allowClaimUnverifiedEmail,
    blockGmailAliasVariants:
      typeof o.blockGmailAliasVariants === "boolean"
        ? o.blockGmailAliasVariants
        : DEFAULT_AUTH_EMAIL_VALUE.blockGmailAliasVariants,
  };
  return authEmailValueSchema.parse(merged);
}

/** Admin-facing row + stored value (may be partial until first save). */
export async function getAuthEmailConfig(projectId: string): Promise<{
  enabled: boolean;
  value: AuthEmailValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.AUTH_EMAIL);
  if (!row) {
    return {
      enabled: false,
      value: { ...DEFAULT_AUTH_EMAIL_VALUE },
      remark: null,
    };
  }
  return {
    enabled: row.enabled,
    value: parseAuthEmailValue(row.value),
    remark: row.remark,
  };
}

/**
 * Runtime policy: when the setting row is missing or disabled, use defaults.
 * When enabled, use stored value (with field-level defaults for missing keys).
 */
export async function getAuthEmailPolicy(
  projectId: string,
): Promise<AuthEmailValue> {
  const cfg = await getAuthEmailConfig(projectId);
  if (!cfg.enabled) return { ...DEFAULT_AUTH_EMAIL_VALUE };
  return cfg.value;
}

export function parseSignupTrialValue(raw: unknown): SignupTrialValue {
  const o = asObject(raw);
  const trigger = SIGNUP_TRIAL_TRIGGERS.includes(o.trigger as SignupTrialTrigger)
    ? (o.trigger as SignupTrialTrigger)
    : DEFAULT_SIGNUP_TRIAL_VALUE.trigger;
  const planId = typeof o.planId === "string" ? o.planId.trim() : "";
  return signupTrialValueSchema.parse({
    planId,
    trigger,
  });
}

export async function getSignupTrialConfig(projectId: string): Promise<{
  enabled: boolean;
  value: SignupTrialValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.SIGNUP_TRIAL);
  if (!row) {
    return {
      enabled: false,
      value: { ...DEFAULT_SIGNUP_TRIAL_VALUE },
      remark: null,
    };
  }
  return {
    enabled: row.enabled,
    value: parseSignupTrialValue(row.value),
    remark: row.remark,
  };
}

export function parseMailRateLimitValue(raw: unknown): MailRateLimitValue {
  const o = asObject(raw);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const merged = {
    emailCooldownSeconds: num(
      o.emailCooldownSeconds,
      DEFAULT_MAIL_RATE_LIMIT_VALUE.emailCooldownSeconds,
    ),
    emailPerHour: num(
      o.emailPerHour,
      DEFAULT_MAIL_RATE_LIMIT_VALUE.emailPerHour,
    ),
    ipPerMinute: num(
      o.ipPerMinute,
      DEFAULT_MAIL_RATE_LIMIT_VALUE.ipPerMinute,
    ),
    ipPerHour: num(o.ipPerHour, DEFAULT_MAIL_RATE_LIMIT_VALUE.ipPerHour),
    projectPerMinute: num(
      o.projectPerMinute,
      DEFAULT_MAIL_RATE_LIMIT_VALUE.projectPerMinute,
    ),
  };
  return mailRateLimitValueSchema.parse(merged);
}

export async function getMailRateLimitConfig(projectId: string): Promise<{
  enabled: boolean;
  value: MailRateLimitValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.MAIL_RATE_LIMIT);
  if (!row) {
    return {
      enabled: false,
      value: { ...DEFAULT_MAIL_RATE_LIMIT_VALUE },
      remark: null,
    };
  }
  return {
    enabled: row.enabled,
    value: parseMailRateLimitValue(row.value),
    remark: row.remark,
  };
}

/**
 * Effective policy for send paths. Cached in memory; invalidated on admin save.
 * Soft TTL covers multi-instance lag.
 */
export async function getMailRateLimitPolicy(
  projectId: string,
): Promise<MailRateLimitValue> {
  const hit = mailRateLimitCache.get(projectId);
  if (hit && Date.now() - hit.at < MAIL_RATE_LIMIT_CACHE_TTL_MS) {
    return hit.value;
  }
  const cfg = await getMailRateLimitConfig(projectId);
  const value = cfg.enabled
    ? cfg.value
    : { ...DEFAULT_MAIL_RATE_LIMIT_VALUE };
  mailRateLimitCache.set(projectId, { value, at: Date.now() });
  return value;
}

/** Call after admin upsert so this process uses new numbers immediately. */
export function invalidateMailRateLimitCache(projectId: string) {
  mailRateLimitCache.delete(projectId);
}

export function primeMailRateLimitCache(
  projectId: string,
  value: MailRateLimitValue,
) {
  mailRateLimitCache.set(projectId, { value, at: Date.now() });
}

export function parseSupportClientMessageWindowValue(
  raw: unknown,
): SupportClientMessageWindowValue {
  const o = asObject(raw);
  const n =
    typeof o.messageWindowSize === "number" &&
    Number.isFinite(o.messageWindowSize)
      ? Math.trunc(o.messageWindowSize)
      : DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE.messageWindowSize;
  return supportClientMessageWindowValueSchema.parse({
    messageWindowSize: Math.min(
      SUPPORT_CLIENT_MESSAGE_WINDOW_MAX,
      Math.max(SUPPORT_CLIENT_MESSAGE_WINDOW_MIN, n),
    ),
  });
}

export async function getSupportClientMessageWindowConfig(
  projectId: string,
): Promise<{
  enabled: boolean;
  value: SupportClientMessageWindowValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.SUPPORT_CLIENT_MESSAGE_WINDOW,
  );
  if (!row) {
    return {
      enabled: false,
      value: { ...DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE },
      remark: null,
    };
  }
  return {
    enabled: row.enabled,
    value: parseSupportClientMessageWindowValue(row.value),
    remark: row.remark,
  };
}

/**
 * Effective latest-N for user-facing support chat.
 * Disabled / unset → default 100.
 */
export async function getSupportClientMessageWindowPolicy(
  projectId: string,
): Promise<SupportClientMessageWindowValue> {
  const hit = supportClientMessageWindowCache.get(projectId);
  if (
    hit &&
    Date.now() - hit.at < SUPPORT_CLIENT_MESSAGE_WINDOW_CACHE_TTL_MS
  ) {
    return hit.value;
  }
  const cfg = await getSupportClientMessageWindowConfig(projectId);
  const value = cfg.enabled
    ? cfg.value
    : { ...DEFAULT_SUPPORT_CLIENT_MESSAGE_WINDOW_VALUE };
  supportClientMessageWindowCache.set(projectId, {
    value,
    at: Date.now(),
  });
  return value;
}

export function invalidateSupportClientMessageWindowCache(projectId: string) {
  supportClientMessageWindowCache.delete(projectId);
}

export function primeSupportClientMessageWindowCache(
  projectId: string,
  value: SupportClientMessageWindowValue,
) {
  supportClientMessageWindowCache.set(projectId, {
    value,
    at: Date.now(),
  });
}

function sanitizeNoticeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, SUBSCRIPTION_NOTICE_ITEM_MAX))
    .slice(0, SUBSCRIPTION_NOTICE_ITEMS_MAX);
}

export function parseSubscriptionNoticeValue(
  raw: unknown,
): SubscriptionNoticeValue {
  const o = asObject(raw);
  const byClient = emptySubscriptionNoticeByClient();
  const incoming = asObject(o.by_client);

  if (Object.keys(incoming).length) {
    for (const id of SUBSCRIPTION_NOTICE_CLIENTS) {
      const block = asObject(incoming[id]);
      byClient[id] = {
        enabled: block.enabled === true,
        items: sanitizeNoticeItems(block.items),
        profile_title:
          typeof block.profile_title === "string"
            ? block.profile_title.trim().slice(0, SUBSCRIPTION_PROFILE_TITLE_MAX)
            : "",
      };
    }
  } else {
    // Legacy: one shared list + selected clients.
    const items = sanitizeNoticeItems(o.items);
    const allow = new Set<string>(SUBSCRIPTION_NOTICE_CLIENTS);
    const selected = new Set(
      Array.isArray(o.clients)
        ? o.clients.filter(
            (x): x is SubscriptionNoticeClient =>
              typeof x === "string" && allow.has(x),
          )
        : [],
    );
    for (const id of SUBSCRIPTION_NOTICE_CLIENTS) {
      const on = selected.has(id);
      byClient[id] = {
        enabled: on && items.length > 0,
        items: on ? [...items] : [],
        profile_title: "",
      };
    }
  }

  return subscriptionNoticeValueSchema.parse({ by_client: byClient });
}

export async function getSubscriptionNoticeConfig(projectId: string): Promise<{
  enabled: boolean;
  value: SubscriptionNoticeValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.SUBSCRIPTION_NOTICE,
  );
  if (!row) {
    return {
      enabled: false,
      value: {
        by_client: emptySubscriptionNoticeByClient(),
      },
      remark: null,
    };
  }
  const value = parseSubscriptionNoticeValue(row.value);
  const raw = asObject(row.value);
  // Legacy shared list used the row-level switch; keep it off until re-saved.
  if (!raw.by_client && !row.enabled) {
    for (const id of SUBSCRIPTION_NOTICE_CLIENTS) {
      value.by_client[id].enabled = false;
    }
  }
  const anyEnabled = SUBSCRIPTION_NOTICE_CLIENTS.some(
    (id) => value.by_client[id].enabled && value.by_client[id].items.length > 0,
  );
  return {
    enabled: anyEnabled,
    value,
    remark: row.remark,
  };
}

async function loadSubscriptionNoticePolicy(
  projectId: string,
): Promise<SubscriptionNoticeValue | null> {
  const hit = subscriptionNoticeCache.get(projectId);
  const now = Date.now();
  if (hit && now - hit.at < SUBSCRIPTION_NOTICE_CACHE_TTL_MS) {
    return hit.value;
  }
  const cfg = await getSubscriptionNoticeConfig(projectId);
  subscriptionNoticeCache.set(projectId, { value: cfg.value, at: now });
  return cfg.value;
}

export async function getSubscriptionClientCopy(
  projectId: string,
  format: string,
): Promise<{ items: string[]; profileTitle: string }> {
  const policy = await loadSubscriptionNoticePolicy(projectId);
  const client = noticeClientForFormat(format);
  if (!client || !policy) return { items: [], profileTitle: "" };
  const block = policy.by_client[client];
  return {
    items: block?.enabled && block.items.length ? block.items : [],
    profileTitle: block?.profile_title?.trim() || "",
  };
}

/**
 * Effective notice lines for a convert format.
 * Per-client disabled / empty → [].
 */
export async function getSubscriptionNoticeLines(
  projectId: string,
  format: string,
): Promise<string[]> {
  const copy = await getSubscriptionClientCopy(projectId, format);
  return copy.items;
}

export function primeSubscriptionNoticeCache(
  projectId: string,
  value: SubscriptionNoticeValue | null,
) {
  subscriptionNoticeCache.set(projectId, { value, at: Date.now() });
}

export function invalidateSubscriptionNoticeCache(projectId: string) {
  subscriptionNoticeCache.delete(projectId);
}

/** Map /sub/:format aliases onto the admin client checkboxes. */
export function noticeClientForFormat(
  format: string,
): SubscriptionNoticeClient | null {
  switch (format) {
    case "shadowrocket":
      return "shadowrocket";
    case "clash":
    case "mihomo":
    case "clash_meta":
      return "clash";
    case "hiddify":
      return "hiddify";
    case "v2ray":
    case "xray":
    case "base64":
      return "v2ray";
    case "surge":
      return "surge";
    case "quantumult_x":
      return "quantumult_x";
    default:
      return null;
  }
}

export const SUBSCRIPTION_NODE_NAME_MODES = [
  "original",
  "zh_region",
  "code_region",
] as const;

export type SubscriptionNodeNameMode =
  (typeof SUBSCRIPTION_NODE_NAME_MODES)[number];

export const subscriptionNodeNameValueSchema = z.object({
  mode: z.enum(SUBSCRIPTION_NODE_NAME_MODES),
});

export type SubscriptionNodeNameValue = z.infer<
  typeof subscriptionNodeNameValueSchema
>;

export const DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE: SubscriptionNodeNameValue = {
  mode: "original",
};

const SUBSCRIPTION_NODE_NAME_CACHE_TTL_MS = 30_000;
const subscriptionNodeNameCache = new Map<
  string,
  { value: SubscriptionNodeNameValue; at: number }
>();

export function parseSubscriptionNodeNameValue(
  raw: unknown,
): SubscriptionNodeNameValue {
  const o = asObject(raw);
  const mode =
    typeof o.mode === "string" &&
    (SUBSCRIPTION_NODE_NAME_MODES as readonly string[]).includes(o.mode)
      ? (o.mode as SubscriptionNodeNameMode)
      : DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE.mode;
  return subscriptionNodeNameValueSchema.parse({ mode });
}

export async function getSubscriptionNodeNameConfig(
  projectId: string,
): Promise<{
  enabled: boolean;
  value: SubscriptionNodeNameValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.SUBSCRIPTION_NODE_NAME,
  );
  if (!row) {
    return {
      enabled: true,
      value: { ...DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE },
      remark: null,
    };
  }
  return {
    enabled: row.enabled,
    value: parseSubscriptionNodeNameValue(row.value),
    remark: row.remark,
  };
}

/** Effective rewrite mode. Missing / disabled → keep original names. */
export async function getSubscriptionNodeNameMode(
  projectId: string,
): Promise<SubscriptionNodeNameMode> {
  const hit = subscriptionNodeNameCache.get(projectId);
  if (
    hit &&
    Date.now() - hit.at < SUBSCRIPTION_NODE_NAME_CACHE_TTL_MS
  ) {
    return hit.value.mode;
  }
  const cfg = await getSubscriptionNodeNameConfig(projectId);
  const value =
    cfg.enabled === false
      ? { ...DEFAULT_SUBSCRIPTION_NODE_NAME_VALUE }
      : cfg.value;
  subscriptionNodeNameCache.set(projectId, { value, at: Date.now() });
  return value.mode;
}

export function primeSubscriptionNodeNameCache(
  projectId: string,
  value: SubscriptionNodeNameValue,
) {
  subscriptionNodeNameCache.set(projectId, { value, at: Date.now() });
}

export const SUBSCRIPTION_DOMAINS_MAX = 20;

export const subscriptionDomainsValueSchema = z.object({
  domains: z.array(z.string().min(1).max(500)).max(SUBSCRIPTION_DOMAINS_MAX),
});

export type SubscriptionDomainsValue = z.infer<
  typeof subscriptionDomainsValueSchema
>;

export const DEFAULT_SUBSCRIPTION_DOMAINS_VALUE: SubscriptionDomainsValue = {
  domains: [],
};

const SUBSCRIPTION_DOMAINS_CACHE_TTL_MS = 30_000;
const subscriptionDomainsCache = new Map<
  string,
  { value: SubscriptionDomainsValue; at: number }
>();

/** Origin only, e.g. https://sub.example.com. Bare host → https. */
export function normalizeSubscriptionPublicOrigin(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;
  return `${url.protocol}//${url.host}`;
}

export function parseSubscriptionDomainsValue(
  raw: unknown,
): SubscriptionDomainsValue {
  const o = asObject(raw);
  const list = Array.isArray(o.domains) ? o.domains : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const origin = normalizeSubscriptionPublicOrigin(item);
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
  }
  return subscriptionDomainsValueSchema.parse({
    domains: out.slice(0, SUBSCRIPTION_DOMAINS_MAX),
  });
}

export async function getSubscriptionDomainsConfig(projectId: string): Promise<{
  enabled: boolean;
  value: SubscriptionDomainsValue;
  remark: string | null;
}> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.SUBSCRIPTION_DOMAINS,
  );
  if (!row) {
    return {
      enabled: false,
      value: { ...DEFAULT_SUBSCRIPTION_DOMAINS_VALUE },
      remark: null,
    };
  }
  const value = parseSubscriptionDomainsValue(row.value);
  return {
    enabled: row.enabled && value.domains.length > 0,
    value,
    remark: row.remark,
  };
}

/** Configured public origins; empty → caller should fall back to API origin. */
export async function getSubscriptionPublicOrigins(
  projectId: string,
): Promise<string[]> {
  const hit = subscriptionDomainsCache.get(projectId);
  if (hit && Date.now() - hit.at < SUBSCRIPTION_DOMAINS_CACHE_TTL_MS) {
    return hit.value.domains;
  }
  const cfg = await getSubscriptionDomainsConfig(projectId);
  subscriptionDomainsCache.set(projectId, {
    value: cfg.value,
    at: Date.now(),
  });
  return cfg.value.domains;
}

export function primeSubscriptionDomainsCache(
  projectId: string,
  value: SubscriptionDomainsValue,
) {
  subscriptionDomainsCache.set(projectId, { value, at: Date.now() });
}

/** Normalize TG / ops language codes → short key used on quick replies. */
export function normalizeQuickReplyLang(
  code: string | null | undefined,
): string {
  if (!code?.trim()) return "zh";
  const c = code.trim().toLowerCase().replace(/_/g, "-");
  if (c.startsWith("zh")) return "zh";
  const base = c.split("-")[0] || "zh";
  return base.length >= 2 ? base : "zh";
}

/** Manual quick-reply templates for Telegram admin inbox (not auto-triggered). */
export const telegramQuickReplyItemSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().trim().min(1).max(80),
    /** Caption / body; may be empty when media_url is set. */
    text: z.string().trim().max(4000).default(""),
    /** Optional image URL (support media / project S3 public URL). */
    media_url: z
      .union([z.string().trim().max(2000), z.null()])
      .optional()
      .transform((v) => {
        if (v == null) return null;
        const s = v.trim();
        return s.length > 0 ? s : null;
      }),
    /** Language key, default Chinese. e.g. zh / en / ru */
    lang: z
      .string()
      .trim()
      .min(2)
      .max(16)
      .default("zh")
      .transform((v) => normalizeQuickReplyLang(v)),
    sort: z.number().int().min(0).max(1_000_000).default(100),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (!v.text.trim() && !v.media_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text_or_media_required",
        path: ["text"],
      });
    }
  });

export const telegramQuickRepliesValueSchema = z.object({
  items: z.array(telegramQuickReplyItemSchema).max(100),
});

export type TelegramQuickReplyItem = z.infer<typeof telegramQuickReplyItemSchema>;
export type TelegramQuickRepliesValue = z.infer<
  typeof telegramQuickRepliesValueSchema
>;

export function parseTelegramQuickRepliesValue(
  raw: unknown,
): TelegramQuickRepliesValue {
  const o = asObject(raw);
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items: TelegramQuickReplyItem[] = [];
  for (const row of itemsRaw) {
    const parsed = telegramQuickReplyItemSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
  }
  items.sort(
    (a, b) =>
      a.lang.localeCompare(b.lang) ||
      a.sort - b.sort ||
      a.title.localeCompare(b.title),
  );
  return { items };
}

export async function getTelegramQuickReplies(
  projectId: string,
): Promise<TelegramQuickRepliesValue> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.TELEGRAM_QUICK_REPLIES,
  );
  if (!row) return { items: [] };
  return parseTelegramQuickRepliesValue(row.value);
}

export async function upsertTelegramQuickReplies(
  projectId: string,
  items: TelegramQuickReplyItem[],
): Promise<TelegramQuickRepliesValue> {
  const value = telegramQuickRepliesValueSchema.parse({ items });
  value.items.sort(
    (a, b) =>
      a.lang.localeCompare(b.lang) ||
      a.sort - b.sort ||
      a.title.localeCompare(b.title),
  );
  await upsertProjectSetting({
    projectId,
    key: SETTING_KEYS.TELEGRAM_QUICK_REPLIES,
    value,
    enabled: true,
    remark: "Support desk quick replies",
  });
  return value;
}

/** Credentials + connectivity fields shared by every S3 profile. */
export const storageS3CredSchema = z.object({
  region: z.string().min(1).max(64),
  bucket: z.string().min(1).max(128),
  accessKeyId: z.string().min(1).max(128),
  secretAccessKey: z.string().min(1).max(256),
  /** Public base URL for objects, e.g. https://cdn.example.com */
  publicBaseUrl: z.string().url().max(500),
  /** Custom endpoint for R2 / MinIO / COS / OSS S3-compatible APIs. */
  endpoint: z.string().url().max(500).nullable().optional(),
  forcePathStyle: z.boolean().optional(),
  /** Object key prefix — trailing slash normalized. */
  keyPrefix: z.string().max(200).nullable().optional(),
});

export type StorageS3Value = z.infer<typeof storageS3CredSchema>;

/** @deprecated use storageS3CredSchema */
export const storageS3ValueSchema = storageS3CredSchema;

export const storageS3ProfileSchema = storageS3CredSchema.extend({
  id: z.string().min(1).max(64),
  /** Display name for vendor + purpose, e.g. "阿里云-国内配置". */
  name: z.string().min(1).max(64),
  enabled: z.boolean(),
  remark: z.string().max(255).nullable().optional(),
});

export type StorageS3Profile = z.infer<typeof storageS3ProfileSchema>;

/** Admin-facing profile; secret is returned in plaintext for copy/edit. */
export type StorageS3ProfilePublic = StorageS3Profile & {
  secret_set: boolean;
};

/**
 * Role → profile binding.
 * - support: single profile id (or null)
 * - app_dist / config: multiple profile ids (fan-out)
 */
export type StorageS3Bindings = {
  support: string | null;
  app_dist: string[];
  config: string[];
};

export type StorageS3BindingsPatch = {
  support?: string | null;
  app_dist?: string[] | string | null;
  config?: string[] | string | null;
};

export type StorageS3ProfilesBundle = {
  profiles: StorageS3Profile[];
  bindings: StorageS3Bindings;
};

const EMPTY_STORAGE_S3_CREDS: StorageS3Value = {
  region: "ap-southeast-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicBaseUrl: "",
  endpoint: null,
  forcePathStyle: false,
  keyPrefix: "download/",
};

const STORAGE_S3_CACHE_TTL_MS = 30_000;
const storageS3RoleCache = new Map<
  string,
  { value: StorageS3Value | null; at: number }
>();
const storageS3RoleListCache = new Map<
  string,
  { values: StorageS3Value[]; at: number }
>();

export function normalizeStorageKeyPrefix(raw: string | null | undefined): string {
  const s = (raw || "").trim().replace(/^\/+/, "");
  if (!s) return "";
  return s.endsWith("/") ? s : `${s}/`;
}

export function normalizePublicBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function normalizeEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().replace(/\/+$/, "");
}

function emptyBindings(): StorageS3Bindings {
  return { support: null, app_dist: [], config: [] };
}

function normalizeIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const id = item.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function credsFromUnknown(raw: unknown): Record<string, unknown> {
  const o = asObject(raw);
  return {
    region: o.region,
    bucket: o.bucket,
    accessKeyId: o.accessKeyId,
    secretAccessKey: o.secretAccessKey,
    publicBaseUrl:
      typeof o.publicBaseUrl === "string"
        ? normalizePublicBaseUrl(o.publicBaseUrl)
        : o.publicBaseUrl,
    endpoint: normalizeEndpoint(o.endpoint),
    forcePathStyle: o.forcePathStyle === true,
    keyPrefix: normalizeStorageKeyPrefix(
      typeof o.keyPrefix === "string" ? o.keyPrefix : null,
    ),
  };
}

export function maskStorageS3Profile(profile: StorageS3Profile): StorageS3ProfilePublic {
  const secret = profile.secretAccessKey?.trim() || "";
  return {
    ...profile,
    remark: profile.remark ?? null,
    endpoint: profile.endpoint ?? null,
    forcePathStyle: profile.forcePathStyle === true,
    keyPrefix: normalizeStorageKeyPrefix(profile.keyPrefix),
    // Admin needs plaintext to copy; keep secret_set for UI disable states.
    secretAccessKey: secret,
    secret_set: !!secret,
  };
}

/** Merge admin patch into previous credentials; keep secret when mask / empty. */
export function mergeStorageS3Value(
  previous: unknown,
  patch: Record<string, unknown>,
): StorageS3Value {
  const prev = asObject(previous);
  const prevSecret =
    typeof prev.secretAccessKey === "string" ? prev.secretAccessKey : "";
  const incomingSecret =
    typeof patch.secretAccessKey === "string" ? patch.secretAccessKey : "";
  const keepSecret =
    !incomingSecret ||
    incomingSecret === SECRET_MASK ||
    incomingSecret === prevSecret;

  const merged = {
    region: patch.region ?? prev.region,
    bucket: patch.bucket ?? prev.bucket,
    accessKeyId: patch.accessKeyId ?? prev.accessKeyId,
    secretAccessKey: keepSecret ? prevSecret : incomingSecret,
    publicBaseUrl: patch.publicBaseUrl ?? prev.publicBaseUrl,
    endpoint:
      patch.endpoint !== undefined ? patch.endpoint : (prev.endpoint ?? null),
    forcePathStyle:
      patch.forcePathStyle !== undefined
        ? patch.forcePathStyle
        : (prev.forcePathStyle ?? false),
    keyPrefix:
      patch.keyPrefix !== undefined
        ? patch.keyPrefix
        : (prev.keyPrefix ?? "support/"),
  };

  const parsed = storageS3CredSchema.safeParse({
    ...merged,
    publicBaseUrl:
      typeof merged.publicBaseUrl === "string"
        ? normalizePublicBaseUrl(merged.publicBaseUrl)
        : merged.publicBaseUrl,
    keyPrefix: normalizeStorageKeyPrefix(
      typeof merged.keyPrefix === "string" ? merged.keyPrefix : null,
    ),
    endpoint: normalizeEndpoint(merged.endpoint),
  });
  if (!parsed.success) {
    throw Object.assign(new Error("storage.s3.invalid"), {
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

function parseProfileRaw(raw: unknown): StorageS3Profile | null {
  const o = asObject(raw);
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!id || !name) return null;
  const creds = storageS3CredSchema.safeParse(credsFromUnknown(o));
  if (!creds.success) return null;
  const remark =
    typeof o.remark === "string" && o.remark.trim() ? o.remark.trim() : null;
  return {
    id,
    name,
    enabled: o.enabled !== false,
    remark,
    ...creds.data,
  };
}

function parseBindingsRaw(raw: unknown): StorageS3Bindings {
  const o = asObject(raw);
  return {
    support:
      typeof o.support === "string" && o.support.trim()
        ? o.support.trim()
        : null,
    // Accept legacy single string for app_dist / config.
    app_dist: normalizeIdList(o.app_dist),
    config: normalizeIdList(o.config),
  };
}

function bundleFromProfilesRow(value: unknown): StorageS3ProfilesBundle {
  const o = asObject(value);
  const list = Array.isArray(o.profiles) ? o.profiles : [];
  const profiles: StorageS3Profile[] = [];
  for (const item of list) {
    const p = parseProfileRaw(item);
    if (p) profiles.push(p);
  }
  return { profiles, bindings: parseBindingsRaw(o.bindings) };
}

function legacyBundleFromSingleRow(
  row: { enabled: boolean; value: unknown; remark: string | null },
): StorageS3ProfilesBundle {
  const creds = storageS3CredSchema.safeParse(credsFromUnknown(row.value));
  if (!creds.success) {
    return { profiles: [], bindings: emptyBindings() };
  }
  const name =
    (typeof row.remark === "string" && row.remark.trim()) || "默认 S3";
  const profile: StorageS3Profile = {
    id: "legacy",
    name: name.slice(0, 64),
    enabled: row.enabled,
    remark: row.remark,
    ...creds.data,
  };
  return {
    profiles: [profile],
    bindings: {
      support: row.enabled ? "legacy" : null,
      app_dist: [],
      config: [],
    },
  };
}

function toStoredBundle(bundle: StorageS3ProfilesBundle): Prisma.InputJsonValue {
  return {
    profiles: bundle.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      remark: p.remark ?? null,
      region: p.region,
      bucket: p.bucket,
      accessKeyId: p.accessKeyId,
      secretAccessKey: p.secretAccessKey,
      publicBaseUrl: p.publicBaseUrl,
      endpoint: p.endpoint ?? null,
      forcePathStyle: p.forcePathStyle === true,
      keyPrefix: normalizeStorageKeyPrefix(p.keyPrefix),
    })),
    bindings: {
      support: bundle.bindings.support ?? null,
      app_dist: bundle.bindings.app_dist ?? [],
      config: bundle.bindings.config ?? [],
    },
  };
}

function sanitizeBindings(
  profiles: StorageS3Profile[],
  bindings: StorageS3Bindings,
): StorageS3Bindings {
  const ids = new Set(profiles.map((p) => p.id));
  const support =
    bindings.support && ids.has(bindings.support) ? bindings.support : null;
  const appDist = (bindings.app_dist || []).filter((id) => ids.has(id));
  const config = (bindings.config || []).filter((id) => ids.has(id));
  return { support, app_dist: appDist, config };
}

export async function getStorageS3ProfilesBundle(
  projectId: string,
): Promise<StorageS3ProfilesBundle> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.STORAGE_S3_PROFILES,
  );
  if (row) {
    const bundle = bundleFromProfilesRow(row.value);
    return {
      profiles: bundle.profiles,
      bindings: sanitizeBindings(bundle.profiles, bundle.bindings),
    };
  }

  const legacy = await getProjectSetting(projectId, SETTING_KEYS.STORAGE_S3);
  if (!legacy) {
    return { profiles: [], bindings: emptyBindings() };
  }
  return legacyBundleFromSingleRow(legacy);
}

async function persistStorageS3ProfilesBundle(
  projectId: string,
  bundle: StorageS3ProfilesBundle,
) {
  const sanitized: StorageS3ProfilesBundle = {
    profiles: bundle.profiles,
    bindings: sanitizeBindings(bundle.profiles, bundle.bindings),
  };
  await upsertProjectSetting({
    projectId,
    key: SETTING_KEYS.STORAGE_S3_PROFILES,
    value: toStoredBundle(sanitized),
    enabled: sanitized.profiles.some((p) => p.enabled),
    remark: "Named S3 profiles + role bindings",
  });
  clearStorageS3Cache(projectId);
  return sanitized;
}

export function clearStorageS3Cache(projectId?: string) {
  if (!projectId) {
    storageS3RoleCache.clear();
    storageS3RoleListCache.clear();
    return;
  }
  for (const key of storageS3RoleCache.keys()) {
    if (key.startsWith(`${projectId}:`)) storageS3RoleCache.delete(key);
  }
  for (const key of storageS3RoleListCache.keys()) {
    if (key.startsWith(`${projectId}:`)) storageS3RoleListCache.delete(key);
  }
}

export async function listStorageS3ProfilesPublic(projectId: string): Promise<{
  profiles: StorageS3ProfilePublic[];
  bindings: StorageS3Bindings;
}> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  return {
    profiles: bundle.profiles.map(maskStorageS3Profile),
    bindings: bundle.bindings,
  };
}

export async function createStorageS3Profile(
  projectId: string,
  input: {
    id?: string;
    name: string;
    enabled: boolean;
    remark?: string | null;
  } & Record<string, unknown>,
): Promise<StorageS3ProfilesBundle> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  const name = input.name.trim();
  if (!name) {
    throw Object.assign(new Error("storage.s3.name_required"), {
      statusCode: 400,
    });
  }
  if (bundle.profiles.some((p) => p.name === name)) {
    throw Object.assign(new Error("storage.s3.name_conflict"), {
      statusCode: 409,
    });
  }
  const creds = mergeStorageS3Value(EMPTY_STORAGE_S3_CREDS, input);
  const id =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : randomUUID();
  if (bundle.profiles.some((p) => p.id === id)) {
    throw Object.assign(new Error("storage.s3.id_conflict"), {
      statusCode: 409,
    });
  }
  const profile: StorageS3Profile = {
    id,
    name: name.slice(0, 64),
    enabled: input.enabled !== false,
    remark:
      typeof input.remark === "string" && input.remark.trim()
        ? input.remark.trim().slice(0, 255)
        : null,
    ...creds,
  };
  const next: StorageS3ProfilesBundle = {
    profiles: [...bundle.profiles, profile],
    bindings: { ...bundle.bindings },
  };
  // First enabled profile auto-binds to support when unbound.
  if (profile.enabled && !next.bindings.support) {
    next.bindings.support = profile.id;
  }
  return persistStorageS3ProfilesBundle(projectId, next);
}

export async function updateStorageS3Profile(
  projectId: string,
  profileId: string,
  patch: {
    name?: string;
    enabled?: boolean;
    remark?: string | null;
  } & Record<string, unknown>,
): Promise<StorageS3ProfilesBundle> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  const idx = bundle.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) {
    throw Object.assign(new Error("storage.s3.not_found"), { statusCode: 404 });
  }
  const prev = bundle.profiles[idx]!;
  const name =
    typeof patch.name === "string" ? patch.name.trim() : prev.name;
  if (!name) {
    throw Object.assign(new Error("storage.s3.name_required"), {
      statusCode: 400,
    });
  }
  if (bundle.profiles.some((p) => p.id !== profileId && p.name === name)) {
    throw Object.assign(new Error("storage.s3.name_conflict"), {
      statusCode: 409,
    });
  }
  const creds = mergeStorageS3Value(prev, patch);
  const nextProfile: StorageS3Profile = {
    ...prev,
    ...creds,
    id: prev.id,
    name: name.slice(0, 64),
    enabled:
      typeof patch.enabled === "boolean" ? patch.enabled : prev.enabled,
    remark:
      patch.remark !== undefined
        ? typeof patch.remark === "string" && patch.remark.trim()
          ? patch.remark.trim().slice(0, 255)
          : null
        : (prev.remark ?? null),
  };
  const profiles = bundle.profiles.slice();
  profiles[idx] = nextProfile;
  return persistStorageS3ProfilesBundle(projectId, {
    profiles,
    bindings: bundle.bindings,
  });
}

export async function deleteStorageS3Profile(
  projectId: string,
  profileId: string,
): Promise<StorageS3ProfilesBundle> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  if (!bundle.profiles.some((p) => p.id === profileId)) {
    throw Object.assign(new Error("storage.s3.not_found"), { statusCode: 404 });
  }
  const profiles = bundle.profiles.filter((p) => p.id !== profileId);
  return persistStorageS3ProfilesBundle(projectId, {
    profiles,
    bindings: bundle.bindings,
  });
}

export async function updateStorageS3Bindings(
  projectId: string,
  patch: StorageS3BindingsPatch,
): Promise<StorageS3ProfilesBundle> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  const nextBindings: StorageS3Bindings = {
    support: bundle.bindings.support,
    app_dist: [...bundle.bindings.app_dist],
    config: [...bundle.bindings.config],
  };
  if ("support" in patch) {
    const v = patch.support;
    nextBindings.support =
      typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if ("app_dist" in patch) {
    nextBindings.app_dist = normalizeIdList(patch.app_dist);
  }
  if ("config" in patch) {
    nextBindings.config = normalizeIdList(patch.config);
  }
  return persistStorageS3ProfilesBundle(projectId, {
    profiles: bundle.profiles,
    bindings: nextBindings,
  });
}

function profileToCreds(profile: StorageS3Profile): StorageS3Value {
  return {
    region: profile.region,
    bucket: profile.bucket,
    accessKeyId: profile.accessKeyId,
    secretAccessKey: profile.secretAccessKey,
    publicBaseUrl: profile.publicBaseUrl,
    endpoint: profile.endpoint ?? null,
    forcePathStyle: profile.forcePathStyle === true,
    keyPrefix: normalizeStorageKeyPrefix(profile.keyPrefix),
  };
}

function boundIdsForRole(
  bindings: StorageS3Bindings,
  role: StorageS3Role,
): string[] {
  if (role === "config") return bindings.config || [];
  if (role === "app_dist") return bindings.app_dist || [];
  return bindings.support ? [bindings.support] : [];
}

/** Runtime: all enabled profiles bound to a role (config may be many). */
export async function getActiveStorageS3ListFor(
  projectId: string,
  role: StorageS3Role,
): Promise<StorageS3Value[]> {
  const cacheKey = `${projectId}:${role}`;
  const hit = storageS3RoleListCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STORAGE_S3_CACHE_TTL_MS) {
    return hit.values;
  }
  const bundle = await getStorageS3ProfilesBundle(projectId);
  const boundIds = boundIdsForRole(bundle.bindings, role);
  const values: StorageS3Value[] = [];
  for (const id of boundIds) {
    const profile = bundle.profiles.find((p) => p.id === id && p.enabled);
    if (profile) values.push(profileToCreds(profile));
  }
  storageS3RoleListCache.set(cacheKey, { values, at: Date.now() });
  return values;
}

/** Runtime: first enabled profile for a role (single-target helpers). */
export async function getActiveStorageS3For(
  projectId: string,
  role: StorageS3Role,
): Promise<StorageS3Value | null> {
  const cacheKey = `${projectId}:${role}:first`;
  const hit = storageS3RoleCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STORAGE_S3_CACHE_TTL_MS) {
    return hit.value;
  }
  const list = await getActiveStorageS3ListFor(projectId, role);
  const value = list[0] ?? null;
  storageS3RoleCache.set(cacheKey, { value, at: Date.now() });
  return value;
}

/** Convenience: support-media binding (legacy getActiveStorageS3). */
export async function getActiveStorageS3(
  projectId: string,
): Promise<StorageS3Value | null> {
  return getActiveStorageS3For(projectId, "support");
}

/** All public base URLs for this project (media URL allowlist). */
export async function listStorageS3PublicBaseUrls(
  projectId: string,
): Promise<string[]> {
  const bundle = await getStorageS3ProfilesBundle(projectId);
  const bases = new Set<string>();
  for (const p of bundle.profiles) {
    if (!p.publicBaseUrl) continue;
    bases.add(normalizePublicBaseUrl(p.publicBaseUrl) + "/");
  }
  return [...bases];
}

/** @deprecated cache priming no longer role-specific; clears project cache. */
export function primeStorageS3Cache(projectId: string) {
  clearStorageS3Cache(projectId);
}

/**
 * Per-project override for Telegram webhook public origin.
 * Empty / null → fall back to env.API_PUBLIC_ORIGIN.
 */
export const telegramWebhookOriginValueSchema = z.object({
  origin: z.string().url().max(500).nullable(),
});

export type TelegramWebhookOriginValue = z.infer<
  typeof telegramWebhookOriginValueSchema
>;

export function normalizeWebhookOrigin(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/\/+$/, "");
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw Object.assign(new Error("telegram.webhook_origin_invalid"), {
      statusCode: 400,
    });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("telegram.webhook_origin_invalid"), {
      statusCode: 400,
    });
  }
  // origin only — strip path/query
  return `${url.protocol}//${url.host}`;
}

export function parseTelegramWebhookOriginValue(
  raw: unknown,
): TelegramWebhookOriginValue {
  const o = asObject(raw);
  const originRaw = typeof o.origin === "string" ? o.origin : null;
  try {
    return { origin: normalizeWebhookOrigin(originRaw) };
  } catch {
    return { origin: null };
  }
}

/** Stored override only (null = use env). */
export async function getTelegramWebhookOriginOverride(
  projectId: string,
): Promise<string | null> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.TELEGRAM_WEBHOOK_ORIGIN,
  );
  if (!row?.enabled) return null;
  return parseTelegramWebhookOriginValue(row.value).origin;
}

export async function upsertTelegramWebhookOrigin(
  projectId: string,
  origin: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeWebhookOrigin(origin ?? null);
  await upsertProjectSetting({
    projectId,
    key: SETTING_KEYS.TELEGRAM_WEBHOOK_ORIGIN,
    value: { origin: normalized },
    enabled: Boolean(normalized),
    remark: "Telegram webhook public origin override",
  });
  return normalized;
}
