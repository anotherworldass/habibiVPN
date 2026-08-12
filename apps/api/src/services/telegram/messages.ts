import {
  dualWriteTelegramMessage,
  type TelegramRecordSource,
} from "../support/conversations.js";

export type { TelegramRecordSource };

/**
 * Record a Telegram private-chat event into the unified support desk.
 * (Legacy telegram_messages table removed.)
 */
export async function recordMessage(input: {
  projectId: string;
  botId: string;
  subscriberId: string;
  direction: "inbound" | "outbound";
  source: TelegramRecordSource;
  contentType?: string;
  text?: string | null;
  telegramMessageId?: string | number | null;
  autoReplyRuleId?: string | null;
  adminUsername?: string | null;
  /** Kept for call-site compatibility; SupportConversation owns unread. */
  bumpUnread?: boolean;
}) {
  await dualWriteTelegramMessage({
    projectId: input.projectId,
    subscriberId: input.subscriberId,
    direction: input.direction,
    source: input.source,
    text: input.text,
    contentType: input.contentType,
    telegramMessageId: input.telegramMessageId,
    adminUsername: input.adminUsername,
  });
}

export function detectContentType(msg: {
  text?: string;
  photo?: unknown;
  sticker?: unknown;
  document?: unknown;
  voice?: unknown;
  video?: unknown;
}): { contentType: string; text: string | null } {
  if (msg.text?.trim()) return { contentType: "text", text: msg.text.trim() };
  if (msg.photo) return { contentType: "photo", text: null };
  if (msg.sticker) return { contentType: "sticker", text: null };
  if (msg.document) return { contentType: "document", text: null };
  if (msg.voice) return { contentType: "voice", text: null };
  if (msg.video) return { contentType: "video", text: null };
  return { contentType: "other", text: null };
}
