import { prisma } from "../../lib/prisma.js";
import {
  SETTING_KEYS,
  getProjectSetting,
  getTelegramWebhookOriginOverride,
  upsertProjectSetting,
} from "../system-settings.js";
import { env } from "../../config.js";
import {
  decryptSecret,
  encryptSecret,
  newWebhookSecret,
} from "../telegram/crypto.js";
import {
  deleteWebhook,
  downloadTelegramFile,
  getFile,
  getMe,
  sendMessage,
  sendPhoto,
  setWebhook,
} from "../telegram/api.js";
import { parseImageDataUrlOrBase64, saveSupportImage } from "./upload.js";

const SECRET_MASK = "********";
const CACHE_TTL_MS = 30_000;
const TG_CAPTION_MAX = 1024;
const TG_TEXT_MAX = 4000;

export type SupportTelegramForwardValue = {
  botTokenEnc: string | null;
  botUsername: string | null;
  webhookSecret: string;
  chatId: string | null;
  chatType: string | null;
  chatTitle: string | null;
};

export type SupportTelegramForwardPublic = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  bot_username: string | null;
  has_token: boolean;
  webhook_secret: string;
  webhook_url: string | null;
  webhook_origin_effective: string;
  chat_id: string | null;
  chat_type: string | null;
  chat_title: string | null;
  bound: boolean;
};

export type SupportTelegramForwardRuntime = {
  enabled: boolean;
  token: string;
  botUsername: string | null;
  webhookSecret: string;
  chatId: string;
  chatType: string | null;
  chatTitle: string | null;
};

const cache = new Map<
  string,
  { enabled: boolean; value: SupportTelegramForwardValue; at: number }
>();

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function emptyValue(): SupportTelegramForwardValue {
  return {
    botTokenEnc: null,
    botUsername: null,
    webhookSecret: newWebhookSecret(),
    chatId: null,
    chatType: null,
    chatTitle: null,
  };
}

export function parseSupportTelegramForwardValue(
  raw: unknown,
): SupportTelegramForwardValue {
  const o = asObject(raw);
  const secret =
    typeof o.webhookSecret === "string" && o.webhookSecret.trim()
      ? o.webhookSecret.trim()
      : newWebhookSecret();
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    botTokenEnc: str(o.botTokenEnc),
    botUsername: str(o.botUsername)?.replace(/^@/, "") || null,
    webhookSecret: secret,
    chatId: str(o.chatId),
    chatType: str(o.chatType),
    chatTitle: str(o.chatTitle),
  };
}

function defaultWebhookOrigin(): string {
  return env.API_PUBLIC_ORIGIN.replace(/\/$/, "");
}

async function resolveWebhookOrigin(projectId: string): Promise<string> {
  const override = await getTelegramWebhookOriginOverride(projectId);
  return (override || defaultWebhookOrigin()).replace(/\/$/, "");
}

export function supportTelegramForwardWebhookUrl(
  origin: string,
  projectCode: string,
  secret: string,
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/v1/support/telegram-forward/webhook/${encodeURIComponent(projectCode)}/${encodeURIComponent(secret)}`;
}

function primeCache(
  projectId: string,
  enabled: boolean,
  value: SupportTelegramForwardValue,
) {
  cache.set(projectId, { enabled, value, at: Date.now() });
}

export function invalidateSupportTelegramForwardCache(projectId: string) {
  cache.delete(projectId);
}

export async function getSupportTelegramForwardConfig(projectId: string): Promise<{
  enabled: boolean;
  value: SupportTelegramForwardValue;
  remark: string | null;
}> {
  let row = await getProjectSetting(
    projectId,
    SETTING_KEYS.SUPPORT_TELEGRAM_FORWARD,
  );
  if (!row) {
    const value = emptyValue();
    row = await upsertProjectSetting({
      projectId,
      key: SETTING_KEYS.SUPPORT_TELEGRAM_FORWARD,
      value,
      enabled: false,
      remark: null,
    });
    primeCache(projectId, false, value);
    return { enabled: false, value, remark: null };
  }
  const value = parseSupportTelegramForwardValue(row.value);
  primeCache(projectId, row.enabled, value);
  return { enabled: row.enabled, value, remark: row.remark };
}

export async function getSupportTelegramForwardPublic(
  projectId: string,
): Promise<SupportTelegramForwardPublic> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, code: true },
  });
  const cfg = await getSupportTelegramForwardConfig(projectId);
  const origin = await resolveWebhookOrigin(projectId);
  const hasToken = Boolean(cfg.value.botTokenEnc);
  return {
    project_id: project.id,
    key: SETTING_KEYS.SUPPORT_TELEGRAM_FORWARD,
    enabled: cfg.enabled,
    remark: cfg.remark,
    bot_username: cfg.value.botUsername,
    has_token: hasToken,
    webhook_secret: cfg.value.webhookSecret,
    webhook_url: hasToken
      ? supportTelegramForwardWebhookUrl(
          origin,
          project.code,
          cfg.value.webhookSecret,
        )
      : null,
    webhook_origin_effective: origin,
    chat_id: cfg.value.chatId,
    chat_type: cfg.value.chatType,
    chat_title: cfg.value.chatTitle,
    bound: Boolean(cfg.value.chatId),
  };
}

export async function getSupportTelegramForwardRuntime(
  projectId: string,
): Promise<SupportTelegramForwardRuntime | null> {
  const hit = cache.get(projectId);
  const now = Date.now();
  let enabled: boolean;
  let value: SupportTelegramForwardValue;
  if (hit && now - hit.at < CACHE_TTL_MS) {
    enabled = hit.enabled;
    value = hit.value;
  } else {
    const cfg = await getSupportTelegramForwardConfig(projectId);
    enabled = cfg.enabled;
    value = cfg.value;
  }
  if (!enabled || !value.botTokenEnc || !value.chatId) return null;
  const token = decryptSecret(value.botTokenEnc);
  if (!token) return null;
  return {
    enabled: true,
    token,
    botUsername: value.botUsername,
    webhookSecret: value.webhookSecret,
    chatId: value.chatId,
    chatType: value.chatType,
    chatTitle: value.chatTitle,
  };
}

export async function persistSupportTelegramForward(input: {
  projectId: string;
  enabled: boolean;
  value: SupportTelegramForwardValue;
  remark?: string | null;
}) {
  await upsertProjectSetting({
    projectId: input.projectId,
    key: SETTING_KEYS.SUPPORT_TELEGRAM_FORWARD,
    value: input.value,
    enabled: input.enabled,
    remark: input.remark ?? null,
  });
  primeCache(input.projectId, input.enabled, input.value);
}

export async function upsertSupportTelegramForward(input: {
  projectId: string;
  enabled: boolean;
  botToken?: string | null;
  clearBind?: boolean;
  registerWebhook?: boolean;
  remark?: string | null;
}): Promise<SupportTelegramForwardPublic> {
  const cfg = await getSupportTelegramForwardConfig(input.projectId);
  const value = { ...cfg.value };

  if (input.botToken !== undefined) {
    const raw = (input.botToken || "").trim();
    if (raw && raw !== SECRET_MASK) {
      const me = await getMe(raw);
      value.botTokenEnc = encryptSecret(raw);
      value.botUsername = me.username || value.botUsername;
    }
  }
  if (input.clearBind) {
    value.chatId = null;
    value.chatType = null;
    value.chatTitle = null;
  }

  await persistSupportTelegramForward({
    projectId: input.projectId,
    enabled: input.enabled,
    value,
    remark: input.remark,
  });

  if (input.registerWebhook !== false && value.botTokenEnc) {
    const token = decryptSecret(value.botTokenEnc);
    if (token) {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { code: true },
      });
      const origin = await resolveWebhookOrigin(input.projectId);
      const url = supportTelegramForwardWebhookUrl(
        origin,
        project.code,
        value.webhookSecret,
      );
      if (input.enabled) {
        await setWebhook(token, url);
      } else {
        await deleteWebhook(token).catch(() => {});
      }
    }
  }

  return getSupportTelegramForwardPublic(input.projectId);
}

export async function bindSupportTelegramForwardChat(input: {
  projectId: string;
  chatId: string | number;
  chatType?: string | null;
  chatTitle?: string | null;
}): Promise<{ ok: true; already: boolean } | { ok: false; reason: "already_bound" }> {
  const cfg = await getSupportTelegramForwardConfig(input.projectId);
  const chatId = String(input.chatId);
  if (cfg.value.chatId && cfg.value.chatId !== chatId) {
    return { ok: false, reason: "already_bound" };
  }
  const already = cfg.value.chatId === chatId;
  if (!already) {
    await persistSupportTelegramForward({
      projectId: input.projectId,
      enabled: cfg.enabled,
      value: {
        ...cfg.value,
        chatId,
        chatType: input.chatType?.trim() || cfg.value.chatType,
        chatTitle: input.chatTitle?.trim() || cfg.value.chatTitle,
      },
      remark: cfg.remark,
    });
  }
  return { ok: true, already };
}

export async function clearSupportTelegramForwardBind(projectId: string) {
  const cfg = await getSupportTelegramForwardConfig(projectId);
  await persistSupportTelegramForward({
    projectId,
    enabled: cfg.enabled,
    value: {
      ...cfg.value,
      chatId: null,
      chatType: null,
      chatTitle: null,
    },
    remark: cfg.remark,
  });
}

export async function sendSupportTelegramForwardTest(projectId: string) {
  const runtime = await getSupportTelegramForwardRuntime(projectId);
  if (!runtime) {
    throw Object.assign(new Error("support.telegram_forward_not_ready"), {
      statusCode: 400,
    });
  }
  await sendMessage(runtime.token, {
    chat_id: runtime.chatId,
    text: "Habibi 客服转发测试：绑定正常。客户消息会发到这里，回复该消息即可回给客户。",
    disable_web_page_preview: true,
  });
  return { ok: true, chat_id: runtime.chatId };
}

function channelLabel(
  channel: string,
  clientSource?: string | null,
): string {
  if (channel === "telegram") return "Telegram";
  if (clientSource === "app") return "App";
  return "Web";
}

async function buildForwardHeader(input: {
  conversationId: string;
  projectId: string;
  isAdminReply: boolean;
  adminUsername?: string | null;
}): Promise<string> {
  const conv = await prisma.supportConversation.findFirst({
    where: { id: input.conversationId, projectId: input.projectId },
    include: {
      user: { select: { uid: true, email: true } },
      guest: { select: { clientSource: true, userId: true } },
      telegramSubscriber: {
        select: {
          username: true,
          firstName: true,
          lastName: true,
          telegramUserId: true,
          user: { select: { uid: true, email: true } },
        },
      },
    },
  });
  if (!conv) return input.isAdminReply ? "💬 客服回复" : "📩 客服";

  const user = conv.user || conv.telegramSubscriber?.user || null;
  const parts: string[] = [];
  const channel = channelLabel(conv.channel, conv.guest?.clientSource);
  if (user?.uid) parts.push(`UID ${user.uid}`);
  else if (conv.channel === "web") parts.push("访客");
  if (user?.email) parts.push(user.email);
  if (conv.telegramSubscriber) {
    const tg = conv.telegramSubscriber.username
      ? `@${conv.telegramSubscriber.username}`
      : [conv.telegramSubscriber.firstName, conv.telegramSubscriber.lastName]
          .filter(Boolean)
          .join(" ") || conv.telegramSubscriber.telegramUserId;
    parts.push(tg);
  } else if (conv.displayName) {
    parts.push(conv.displayName);
  }

  const who = parts.length ? parts.join(" · ") : conv.id.slice(0, 8);
  const title = input.isAdminReply
    ? `💬 客服回复${input.adminUsername ? ` · ${input.adminUsername}` : ""}`
    : `📩 ${channel} · ${who}`;
  if (input.isAdminReply) {
    return `${title}\n📩 ${channel} · ${who}`;
  }
  return title;
}

export async function recordForwardMap(input: {
  projectId: string;
  conversationId: string;
  telegramChatId: string;
  telegramMessageId: string | number;
  supportMessageId?: string | null;
}) {
  const telegramMessageId = String(input.telegramMessageId);
  await prisma.supportTelegramForwardMap.upsert({
    where: {
      projectId_telegramChatId_telegramMessageId: {
        projectId: input.projectId,
        telegramChatId: String(input.telegramChatId),
        telegramMessageId,
      },
    },
    create: {
      projectId: input.projectId,
      conversationId: input.conversationId,
      supportMessageId: input.supportMessageId ?? null,
      telegramChatId: String(input.telegramChatId),
      telegramMessageId,
    },
    update: {
      conversationId: input.conversationId,
      supportMessageId: input.supportMessageId ?? null,
    },
  });
}

export async function findForwardConversation(input: {
  projectId: string;
  telegramChatId: string;
  telegramMessageId: string | number;
}): Promise<{ conversationId: string } | null> {
  const row = await prisma.supportTelegramForwardMap.findUnique({
    where: {
      projectId_telegramChatId_telegramMessageId: {
        projectId: input.projectId,
        telegramChatId: String(input.telegramChatId),
        telegramMessageId: String(input.telegramMessageId),
      },
    },
    select: { conversationId: true },
  });
  return row;
}

/** Fire-and-forget from the support desk. Failures must not block chat. */
export async function notifyStaffTelegramForward(input: {
  projectId: string;
  conversationId: string;
  supportMessageId: string;
  direction: "inbound" | "outbound";
  source: string;
  text?: string | null;
  mediaUrl?: string | null;
  contentType?: string | null;
  adminUsername?: string | null;
}) {
  const isUserInbound = input.direction === "inbound" && input.source === "user";
  const isAdminOutbound =
    input.direction === "outbound" && input.source === "admin";
  if (!isUserInbound && !isAdminOutbound) return;

  const runtime = await getSupportTelegramForwardRuntime(input.projectId);
  if (!runtime) return;

  const header = await buildForwardHeader({
    conversationId: input.conversationId,
    projectId: input.projectId,
    isAdminReply: isAdminOutbound,
    adminUsername: input.adminUsername,
  });
  const body = (input.text || "").trim();
  const hasImage = Boolean(
    input.mediaUrl &&
      (input.contentType === "image" ||
        input.contentType === "photo" ||
        input.mediaUrl),
  );

  try {
    let sentId: number | undefined;
    if (hasImage && input.mediaUrl) {
      const caption = [header, body].filter(Boolean).join("\n").slice(0, TG_CAPTION_MAX);
      const sent = await sendPhoto(runtime.token, {
        chat_id: runtime.chatId,
        photo: input.mediaUrl,
        caption: caption || undefined,
      });
      sentId = sent.message_id;
    } else {
      const text = [header, body ? `────────\n${body}` : ""]
        .filter(Boolean)
        .join("\n")
        .slice(0, TG_TEXT_MAX);
      const sent = await sendMessage(runtime.token, {
        chat_id: runtime.chatId,
        text: text || header,
        disable_web_page_preview: true,
      });
      sentId = sent.message_id;
    }
    if (sentId != null) {
      await recordForwardMap({
        projectId: input.projectId,
        conversationId: input.conversationId,
        telegramChatId: runtime.chatId,
        telegramMessageId: sentId,
        supportMessageId: input.supportMessageId,
      });
    }
  } catch (err) {
    console.warn(
      "[support.telegram_forward]",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function downloadStaffTelegramImage(input: {
  token: string;
  fileId: string;
  projectId: string;
}): Promise<string> {
  const file = await getFile(input.token, input.fileId);
  if (!file.file_path) {
    throw Object.assign(new Error("telegram.file_missing"), { statusCode: 502 });
  }
  const buffer = await downloadTelegramFile(input.token, file.file_path);
  const { mime } = parseImageDataUrlOrBase64({
    data: buffer.toString("base64"),
    mime: null,
  });
  const saved = await saveSupportImage({
    projectId: input.projectId,
    buffer,
    mime,
  });
  return saved.mediaUrl;
}

export function staffDisplayName(from?: {
  username?: string;
  first_name?: string;
  last_name?: string;
  id?: number;
} | null): string {
  if (!from) return "tg";
  if (from.username) return `@${from.username}`;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  if (name) return name;
  return from.id != null ? `tg:${from.id}` : "tg";
}

export { SECRET_MASK as SUPPORT_TELEGRAM_FORWARD_TOKEN_MASK };
