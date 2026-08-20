import { prisma } from "../../lib/prisma.js";
import { sendMessage } from "./api.js";
import { loadEnabledAutoReplyRules, matchAutoReply } from "./auto-reply.js";
import { decryptSecret } from "./crypto.js";
import { applyInviteNotifyCommand } from "./invite-notify.js";
import { detectContentType, recordMessage } from "./messages.js";
import { markSubscriberBlocked, upsertSubscriber } from "./subscribers.js";

type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  is_premium?: boolean;
  is_bot?: boolean;
};

type TgUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    caption?: string;
    photo?: unknown;
    sticker?: unknown;
    document?: unknown;
    voice?: unknown;
    video?: unknown;
    chat?: { id: number; type?: string };
    from?: TgUser;
  };
  my_chat_member?: {
    chat?: { id: number };
    from?: TgUser;
    new_chat_member?: { status?: string; user?: TgUser };
  };
};

export async function handleTelegramWebhook(input: {
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

  const bot = await prisma.projectTelegramBot.findUnique({
    where: { projectId: project.id },
  });
  if (!bot || bot.webhookSecret !== input.webhookSecret) {
    throw Object.assign(new Error("telegram.webhook_forbidden"), { statusCode: 403 });
  }
  if (!bot.enabled || !bot.botTokenEnc) {
    return { ok: true, skipped: true };
  }

  const token = decryptSecret(bot.botTokenEnc);
  if (!token) return { ok: true, skipped: true };

  // Block / leave
  if (input.update.my_chat_member) {
    const status = input.update.my_chat_member.new_chat_member?.status;
    const from = input.update.my_chat_member.from;
    if (from && (status === "kicked" || status === "left")) {
      await markSubscriberBlocked(bot.id, from.id);
      return { ok: true, blocked: true };
    }
  }

  const msg = input.update.message;
  if (!msg?.from || !msg.chat) return { ok: true };
  // Only private chats for inbox / auto-reply
  if (msg.chat.type && msg.chat.type !== "private") {
    return { ok: true, skipped: true, reason: "not_private" };
  }

  const textRaw = (msg.text || msg.caption || "").trim();
  const isStart = textRaw === "/start" || textRaw.startsWith("/start ");

  const sub = await upsertSubscriber({
    projectId: project.id,
    botId: bot.id,
    telegramUserId: msg.from.id,
    chatId: msg.chat.id,
    username: msg.from.username,
    firstName: msg.from.first_name,
    lastName: msg.from.last_name,
    languageCode: msg.from.language_code,
    isPremium: msg.from.is_premium ?? null,
    isBot: msg.from.is_bot ?? false,
    canDm: true,
    blocked: false,
  });

  const detected = detectContentType({
    text: textRaw || undefined,
    photo: msg.photo,
    sticker: msg.sticker,
    document: msg.document,
    voice: msg.voice,
    video: msg.video,
  });

  // /start is a Mini App handshake, not a support ticket.
  if (!isStart) {
    await recordMessage({
      projectId: project.id,
      botId: bot.id,
      subscriberId: sub.id,
      direction: "inbound",
      source: "user",
      contentType: detected.contentType,
      text: detected.text,
      telegramMessageId: msg.message_id ?? null,
      bumpUnread: true,
    });
  }

  let welcomeSent = false;
  let autoReplied = false;

  if (isStart) {
    const welcome =
      bot.welcomeText ||
      "欢迎！点下方按钮打开小程序。";
    const replyMarkup = bot.miniAppUrl
      ? {
          inline_keyboard: [
            [
              {
                text: "打开小程序",
                web_app: { url: bot.miniAppUrl },
              },
            ],
          ],
        }
      : undefined;

    try {
      await sendMessage(token, {
        chat_id: msg.chat.id,
        text: welcome,
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
      welcomeSent = true;
    } catch (err) {
      console.warn(
        "[telegram.webhook] welcome send failed",
        msg.chat.id,
        err instanceof Error ? err.message : err,
      );
      return {
        ok: true,
        subscriber: true,
        welcome_sent: false,
        welcome_error: err instanceof Error ? err.message : "send_failed",
      };
    }
  } else if (detected.contentType === "text" && detected.text) {
    const notifyCmd = await applyInviteNotifyCommand({
      subscriberId: sub.id,
      text: detected.text,
    });
    if (notifyCmd) {
      try {
        const sent = await sendMessage(token, {
          chat_id: msg.chat.id,
          text: notifyCmd.reply,
          disable_web_page_preview: true,
        });
        autoReplied = true;
        await recordMessage({
          projectId: project.id,
          botId: bot.id,
          subscriberId: sub.id,
          direction: "outbound",
          source: "invite_notify",
          contentType: "text",
          text: notifyCmd.reply,
          telegramMessageId: sent.message_id,
        });
      } catch (err) {
        const code = (err as { telegramCode?: number }).telegramCode;
        if (code === 403) {
          await markSubscriberBlocked(bot.id, msg.from.id);
        }
        console.warn(
          "[telegram.webhook] invite-notify cmd failed",
          msg.chat.id,
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      const rules = await loadEnabledAutoReplyRules(bot.id);
      const hit = matchAutoReply(detected.text, rules);
      if (hit) {
        try {
          const sent = await sendMessage(token, {
            chat_id: msg.chat.id,
            text: hit.replyText,
            disable_web_page_preview: true,
          });
          autoReplied = true;
          await recordMessage({
            projectId: project.id,
            botId: bot.id,
            subscriberId: sub.id,
            direction: "outbound",
            source: "auto_reply",
            contentType: "text",
            text: hit.replyText,
            telegramMessageId: sent.message_id,
            autoReplyRuleId: hit.id,
          });
        } catch (err) {
          const code = (err as { telegramCode?: number }).telegramCode;
          if (code === 403) {
            await markSubscriberBlocked(bot.id, msg.from.id);
          }
          console.warn(
            "[telegram.webhook] auto-reply send failed",
            msg.chat.id,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  return {
    ok: true,
    subscriber: true,
    welcome_sent: welcomeSent,
    auto_replied: autoReplied,
  };
}
