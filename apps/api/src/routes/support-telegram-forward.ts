import type { FastifyPluginAsync } from "fastify";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { adminReplySupport } from "../services/support/conversations.js";
import {
  bindSupportTelegramForwardChat,
  clearSupportTelegramForwardBind,
  downloadStaffTelegramImage,
  findForwardConversation,
  getSupportTelegramForwardConfig,
  recordForwardMap,
  staffDisplayName,
} from "../services/support/telegram-forward.js";
import { decryptSecret } from "../services/telegram/crypto.js";
import { sendMessage } from "../services/telegram/api.js";

type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_bot?: boolean;
};

type TgChat = {
  id: number;
  type?: string;
  title?: string;
  first_name?: string;
  username?: string;
};

type TgPhoto = { file_id: string; width?: number; height?: number };

type TgMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  photo?: TgPhoto[];
  chat?: TgChat;
  from?: TgUser;
  reply_to_message?: { message_id?: number };
};

type TgUpdate = {
  message?: TgMessage;
  my_chat_member?: {
    chat?: TgChat;
    new_chat_member?: { status?: string; user?: TgUser };
  };
};

function chatTitleOf(chat?: TgChat | null): string | null {
  if (!chat) return null;
  return (
    chat.title ||
    [chat.first_name].filter(Boolean).join(" ") ||
    (chat.username ? `@${chat.username}` : null) ||
    null
  );
}

function commandName(text: string): string | null {
  const first = text.trim().split(/\s+/)[0] || "";
  if (!first.startsWith("/")) return null;
  return first.slice(1).split("@")[0]?.toLowerCase() || null;
}

function largestPhotoId(photos?: TgPhoto[]): string | null {
  if (!photos?.length) return null;
  const last = photos[photos.length - 1];
  return last?.file_id || null;
}

export const supportTelegramForwardRoutes: FastifyPluginAsync = async (
  app,
) => {
  const path = `${USER_API_PREFIX}/support/telegram-forward/webhook/:projectCode/:webhookSecret`;

  app.post(path, async (req, reply) => {
    const params = req.params as {
      projectCode: string;
      webhookSecret: string;
    };
    try {
      const result = await handleStaffForwardWebhook({
        projectCode: params.projectCode,
        webhookSecret: params.webhookSecret,
        update: (req.body || {}) as TgUpdate,
      });
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};

async function handleStaffForwardWebhook(input: {
  projectCode: string;
  webhookSecret: string;
  update: TgUpdate;
}) {
  const project = await prisma.project.findUnique({
    where: { code: input.projectCode },
    select: { id: true, code: true },
  });
  if (!project) {
    throw Object.assign(new Error("project.not_found"), { statusCode: 404 });
  }

  const cfg = await getSupportTelegramForwardConfig(project.id);
  if (cfg.value.webhookSecret !== input.webhookSecret) {
    throw Object.assign(new Error("telegram.webhook_forbidden"), {
      statusCode: 403,
    });
  }
  if (!cfg.value.botTokenEnc) {
    return { ok: true, skipped: true, reason: "no_token" };
  }
  const token = decryptSecret(cfg.value.botTokenEnc);
  if (!token) return { ok: true, skipped: true, reason: "no_token" };

  const member = input.update.my_chat_member;
  if (member?.chat && member.new_chat_member) {
    const status = member.new_chat_member.status;
    const chatId = String(member.chat.id);
    if (status === "left" || status === "kicked") {
      if (cfg.value.chatId && cfg.value.chatId === chatId) {
        await clearSupportTelegramForwardBind(project.id);
        return { ok: true, unbound: true };
      }
      return { ok: true, skipped: true, reason: "left_unbound" };
    }
    if (
      (status === "member" || status === "administrator") &&
      !cfg.value.chatId
    ) {
      await sendMessage(token, {
        chat_id: member.chat.id,
        text: "已加入此会话。发送 /bind 将这里设为客服转发目标。",
        disable_web_page_preview: true,
      }).catch(() => {});
      return { ok: true, hint: true };
    }
    return { ok: true };
  }

  const msg = input.update.message;
  if (!msg?.from || !msg.chat || msg.from.is_bot) {
    return { ok: true };
  }

  const textRaw = (msg.text || msg.caption || "").trim();
  const cmd = commandName(textRaw);

  if (cmd === "bind" || cmd === "start") {
    if (cmd === "start") {
      await sendMessage(token, {
        chat_id: msg.chat.id,
        text: "这是客服转发 Bot。把我拉进员工群（或直接在这里），发送 /bind 后，客户消息会转发到此会话。回复转发消息即可回给客户。",
        disable_web_page_preview: true,
      }).catch(() => {});
      return { ok: true, start: true };
    }
    const bound = await bindSupportTelegramForwardChat({
      projectId: project.id,
      chatId: msg.chat.id,
      chatType: msg.chat.type || null,
      chatTitle: chatTitleOf(msg.chat),
    });
    if (!bound.ok) {
      await sendMessage(token, {
        chat_id: msg.chat.id,
        text: "已绑定其他会话。请先在后台客服设置里「清除绑定」，再重新 /bind。",
        disable_web_page_preview: true,
      }).catch(() => {});
      return { ok: true, already_bound: true };
    }
    await sendMessage(token, {
      chat_id: msg.chat.id,
      text: bound.already
        ? "已经绑定此会话，客户消息会发到这里。"
        : "绑定成功。客户消息会转发到这里；回复那条转发消息即可回给客户。",
      disable_web_page_preview: true,
    }).catch(() => {});
    return { ok: true, bound: true, already: bound.already };
  }

  if (!cfg.enabled) {
    return { ok: true, skipped: true, reason: "disabled" };
  }
  if (!cfg.value.chatId || cfg.value.chatId !== String(msg.chat.id)) {
    return { ok: true, skipped: true, reason: "not_bound_chat" };
  }

  const replyId = msg.reply_to_message?.message_id;
  if (replyId == null) {
    return { ok: true, skipped: true, reason: "no_reply" };
  }

  const mapped = await findForwardConversation({
    projectId: project.id,
    telegramChatId: String(msg.chat.id),
    telegramMessageId: replyId,
  });
  if (!mapped) {
    await sendMessage(token, {
      chat_id: msg.chat.id,
      text: "无法对应会话，请直接回复客户那条转发消息。",
      disable_web_page_preview: true,
      // Telegram reply_parameters would be nicer but sendMessage has no field yet
    }).catch(() => {});
    return { ok: true, unmatched: true };
  }

  const photoId = largestPhotoId(msg.photo);
  let mediaUrl: string | null = null;
  if (photoId) {
    try {
      mediaUrl = await downloadStaffTelegramImage({
        token,
        fileId: photoId,
        projectId: project.id,
      });
    } catch (err) {
      console.warn(
        "[support.telegram_forward.photo]",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const text = textRaw || null;
  if (!text && !mediaUrl) {
    return { ok: true, skipped: true, reason: "empty" };
  }

  const saved = await adminReplySupport({
    projectId: project.id,
    conversationId: mapped.conversationId,
    text,
    mediaUrl,
    adminUsername: staffDisplayName(msg.from),
    viaStaffTelegram: true,
  });

  if (msg.message_id != null) {
    await recordForwardMap({
      projectId: project.id,
      conversationId: mapped.conversationId,
      telegramChatId: String(msg.chat.id),
      telegramMessageId: msg.message_id,
      supportMessageId: saved.id,
    });
  }

  return { ok: true, replied: true, conversation_id: mapped.conversationId };
}
