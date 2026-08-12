import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import {
  getTelegramWebhookOriginOverride,
  upsertTelegramWebhookOrigin,
} from "../system-settings.js";
import { decryptSecret, encryptSecret, newWebhookSecret } from "./crypto.js";
import { deleteWebhook, getMe, setWebhook } from "./api.js";

export type TelegramBotPublicView = {
  project_id: string;
  enabled: boolean;
  bot_username: string | null;
  has_token: boolean;
  webhook_secret: string;
  webhook_url: string | null;
  /** Per-project override; null = use env.API_PUBLIC_ORIGIN */
  webhook_origin: string | null;
  /** Effective origin used to build webhook_url */
  webhook_origin_effective: string;
  mini_app_url: string | null;
  /** t.me deep-link base for invites, e.g. https://t.me/bot or https://t.me/bot/app */
  mini_app_direct_link: string | null;
  welcome_text: string | null;
  channel_url: string | null;
  updated_at: Date;
};

/** Accept @name / name / https://t.me/name → https://t.me/name (or null). */
export function normalizeChannelUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("@")) {
    const u = s.slice(1).trim();
    return u ? `https://t.me/${u}` : null;
  }
  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(s)) {
    return s.replace(/^http:\/\//i, "https://");
  }
  if (/^[A-Za-z0-9_]{4,64}$/.test(s)) {
    return `https://t.me/${s}`;
  }
  return s;
}

/**
 * Normalize Mini App t.me direct-link base used for invite shares.
 * Accepts: https://t.me/bot/app | t.me/bot/app | bot/app | @bot | bot
 * → https://t.me/bot or https://t.me/bot/app (no query).
 */
export function normalizeMiniAppDirectLink(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^@/, "");
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^(t\.me|telegram\.me)\//i, "");
  s = (s.split("?")[0] || "").split("#")[0] || "";
  s = s.replace(/\/+$/, "");
  // botusername or botusername/shortname
  if (!/^[A-Za-z0-9_]{4,64}(\/[A-Za-z0-9_]{3,30})?$/.test(s)) {
    throw Object.assign(new Error("telegram.mini_app_direct_link_invalid"), {
      statusCode: 400,
    });
  }
  return `https://t.me/${s}`;
}

/** Build shareable Mini App invite URL with startapp=inviteCode. */
export function buildTelegramInviteUrl(
  directLinkBase: string | null | undefined,
  botUsername: string | null | undefined,
  inviteCode: string,
): string | null {
  const base =
    (directLinkBase?.trim() || null) ||
    (botUsername?.replace(/^@/, "").trim()
      ? `https://t.me/${botUsername.replace(/^@/, "").trim()}`
      : null);
  if (!base) return null;
  const code = inviteCode.trim();
  if (!code) return null;
  return `${base.replace(/\/$/, "")}?startapp=${encodeURIComponent(code)}`;
}

function defaultWebhookOrigin(): string {
  return env.API_PUBLIC_ORIGIN.replace(/\/$/, "");
}

async function resolveWebhookOrigin(projectId: string): Promise<{
  override: string | null;
  effective: string;
}> {
  const override = await getTelegramWebhookOriginOverride(projectId);
  return {
    override,
    effective: override || defaultWebhookOrigin(),
  };
}

function webhookUrl(origin: string, projectCode: string, secret: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/v1/telegram/webhook/${encodeURIComponent(projectCode)}/${encodeURIComponent(secret)}`;
}

export async function getOrCreateBotRow(projectId: string) {
  const existing = await prisma.projectTelegramBot.findUnique({ where: { projectId } });
  if (existing) return existing;
  return prisma.projectTelegramBot.create({
    data: {
      projectId,
      webhookSecret: newWebhookSecret(),
      welcomeText:
        "欢迎使用！点下方按钮打开小程序领取套餐。发送 /start 可重新打开。",
    },
  });
}

export async function getBotPublicView(projectId: string): Promise<TelegramBotPublicView> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, code: true },
  });
  const bot = await getOrCreateBotRow(projectId);
  const { override, effective } = await resolveWebhookOrigin(projectId);
  return {
    project_id: project.id,
    enabled: bot.enabled,
    bot_username: bot.botUsername,
    has_token: Boolean(bot.botTokenEnc),
    webhook_secret: bot.webhookSecret,
    webhook_origin: override,
    webhook_origin_effective: effective,
    webhook_url: bot.botTokenEnc
      ? webhookUrl(effective, project.code, bot.webhookSecret)
      : null,
    mini_app_url: bot.miniAppUrl,
    mini_app_direct_link: bot.miniAppDirectLink,
    welcome_text: bot.welcomeText,
    channel_url: bot.channelUrl,
    updated_at: bot.updatedAt,
  };
}

export async function getBotTokenForProject(projectId: string): Promise<string | null> {
  const bot = await prisma.projectTelegramBot.findUnique({ where: { projectId } });
  if (!bot?.botTokenEnc) return null;
  return decryptSecret(bot.botTokenEnc);
}

export async function updateBotConfig(
  projectId: string,
  input: {
    enabled?: boolean;
    bot_token?: string | null;
    bot_username?: string | null;
    mini_app_url?: string | null;
    mini_app_direct_link?: string | null;
    welcome_text?: string | null;
    channel_url?: string | null;
    /** null / "" clears override and falls back to env */
    webhook_origin?: string | null;
    rotate_webhook_secret?: boolean;
    register_webhook?: boolean;
  },
): Promise<TelegramBotPublicView> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, code: true },
  });
  let bot = await getOrCreateBotRow(projectId);

  const data: {
    enabled?: boolean;
    botTokenEnc?: string | null;
    botUsername?: string | null;
    miniAppUrl?: string | null;
    miniAppDirectLink?: string | null;
    welcomeText?: string | null;
    channelUrl?: string | null;
    webhookSecret?: string;
  } = {};

  if (input.enabled != null) data.enabled = input.enabled;
  if (input.bot_username !== undefined) {
    data.botUsername = input.bot_username?.replace(/^@/, "").trim() || null;
  }
  if (input.mini_app_url !== undefined) {
    data.miniAppUrl = input.mini_app_url?.trim() || null;
  }
  if (input.mini_app_direct_link !== undefined) {
    data.miniAppDirectLink = normalizeMiniAppDirectLink(input.mini_app_direct_link);
  }
  if (input.welcome_text !== undefined) {
    data.welcomeText = input.welcome_text?.trim() || null;
  }
  if (input.channel_url !== undefined) {
    data.channelUrl = normalizeChannelUrl(input.channel_url);
  }
  if (input.rotate_webhook_secret) {
    data.webhookSecret = newWebhookSecret();
  }
  if (input.bot_token !== undefined) {
    const token = input.bot_token?.trim() || null;
    if (token) {
      const me = await getMe(token);
      data.botTokenEnc = encryptSecret(token);
      data.botUsername = me.username || data.botUsername || null;
    } else if (token === null || input.bot_token === "") {
      data.botTokenEnc = null;
    }
  }

  if (input.webhook_origin !== undefined) {
    await upsertTelegramWebhookOrigin(projectId, input.webhook_origin);
  }

  bot = await prisma.projectTelegramBot.update({
    where: { id: bot.id },
    data,
  });

  if (input.register_webhook && bot.botTokenEnc) {
    const token = decryptSecret(bot.botTokenEnc)!;
    const { effective } = await resolveWebhookOrigin(projectId);
    const url = webhookUrl(effective, project.code, bot.webhookSecret);
    if (bot.enabled) {
      await setWebhook(token, url);
    } else {
      await deleteWebhook(token).catch(() => {});
    }
  }

  return getBotPublicView(projectId);
}
