import type { SupportChannel, SupportMessageSource } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { deleteMessage, sendMessage, sendPhoto } from "../telegram/api.js";
import { getBotTokenForProject } from "../telegram/bot-config.js";
import { redactUnsafeSupportText } from "./content-safety.js";
import {
  clientMetaToJson,
  guestProfileView,
  type SupportClientMeta,
} from "./meta.js";
import { assertOwnSupportMediaUrl } from "./upload.js";

/** TG private-chat event sources that map into support_messages. */
export type TelegramRecordSource =
  | "user"
  | "welcome"
  | "auto_reply"
  | "admin"
  | "invite_notify";

const ADMIN_RECALL_MAX_AGE_MS = 48 * 3600_000;
const USER_RECALL_MAX_AGE_MS = 30 * 60_000;

const supportUserProfileSelect = {
  id: true,
  uid: true,
  email: true,
  status: true,
  inviteCode: true,
  createdAt: true,
  adminRemark: true,
  promoGroup: { select: { id: true, name: true, code: true } },
  promoWallet: {
    select: { availableCents: true, pendingCents: true },
  },
  upstreams: {
    select: {
      id: true,
      status: true,
      expiresAt: true,
      plan: { select: { name: true, code: true } },
    },
    orderBy: { expiresAt: "desc" as const },
  },
} as const;

type SupportUserProfile = {
  id: string;
  uid: number;
  email: string | null;
  status: string;
  inviteCode: string;
  createdAt: Date;
  adminRemark: string | null;
  promoGroup: { id: string; name: string; code: string } | null;
  promoWallet: { availableCents: number; pendingCents: number } | null;
  upstreams: Array<{
    id: string;
    status: string;
    expiresAt: Date | null;
    plan: { name: string; code: string } | null;
  }>;
};

function supportUserProfileView(user: SupportUserProfile) {
  const now = Date.now();
  const subscriptions = user.upstreams.map((s) => {
    const expired = s.expiresAt ? s.expiresAt.getTime() < now : false;
    const active = s.status === "active" && !expired;
    return {
      id: s.id,
      plan_name: s.plan?.name ?? null,
      plan_code: s.plan?.code ?? null,
      status: s.status,
      expires_at: s.expiresAt,
      expired,
      active,
    };
  });
  const activeSubs = subscriptions.filter((s) => s.active);
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    status: user.status,
    invite_code: user.inviteCode,
    created_at: user.createdAt,
    admin_remark: user.adminRemark,
    promo_group: user.promoGroup,
    wallet: {
      available_cents: user.promoWallet?.availableCents ?? 0,
      pending_cents: user.promoWallet?.pendingCents ?? 0,
    },
    subscription_count: subscriptions.length,
    active_subscription_count: activeSubs.length,
    latest_subscription: activeSubs[0] || subscriptions[0] || null,
    subscriptions,
  };
}

function previewOf(
  text: string | null | undefined,
  contentType?: string | null,
  mediaUrl?: string | null,
): string {
  if (contentType === "image" || contentType === "photo" || mediaUrl) {
    const t = (text || "").trim();
    return t ? `[图片] ${t}`.slice(0, 200) : "[图片]";
  }
  const t = (text || "").trim();
  return t ? t.slice(0, 200) : "[消息]";
}

export function messageView(
  m: {
    id: string;
    direction: "inbound" | "outbound";
    source: SupportMessageSource;
    contentType: string;
    text: string | null;
    mediaUrl?: string | null;
    externalMessageId: string | null;
    adminUsername: string | null;
    recalledAt: Date | null;
    clientMeta: unknown;
    createdAt: Date;
    conversation?: { channel: SupportChannel };
  },
  opts: { viewer?: "admin" | "user" } = {},
) {
  const recalled = Boolean(m.recalledAt);
  const ageMs = Date.now() - m.createdAt.getTime();
  const channel = m.conversation?.channel;
  const viewer = opts.viewer || "admin";

  let recallable = false;
  if (viewer === "user") {
    // User may soft-recall own web messages within 30 minutes
    recallable =
      !recalled &&
      channel === "web" &&
      m.direction === "inbound" &&
      m.source === "user" &&
      ageMs <= USER_RECALL_MAX_AGE_MS;
  } else {
    // Admin: web soft-recall / telegram deleteMessage; 48h window
    recallable =
      !recalled &&
      m.direction === "outbound" &&
      m.source === "admin" &&
      ageMs <= ADMIN_RECALL_MAX_AGE_MS &&
      (channel === "web" ||
        (channel === "telegram" && !!m.externalMessageId));
  }

  return {
    id: m.id,
    direction: m.direction,
    source: m.source,
    content_type: m.contentType,
    text: recalled ? null : m.text,
    media_url: recalled ? null : m.mediaUrl ?? null,
    external_message_id: m.externalMessageId,
    admin_username: m.adminUsername,
    recalled_at: m.recalledAt,
    recallable,
    client_meta: m.clientMeta ?? null,
    created_at: m.createdAt,
  };
}

/** Ensure web conversation for guest (and optional bound user). */
export async function ensureWebConversation(input: {
  projectId: string;
  guestId: string;
  userId?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
}) {
  const existing = await prisma.supportConversation.findUnique({
    where: {
      projectId_guestId: {
        projectId: input.projectId,
        guestId: input.guestId,
      },
    },
  });
  if (existing) {
    return prisma.supportConversation.update({
      where: { id: existing.id },
      data: {
        status: "open",
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.languageCode !== undefined
          ? { languageCode: input.languageCode }
          : {}),
      },
    });
  }
  return prisma.supportConversation.create({
    data: {
      projectId: input.projectId,
      channel: "web",
      guestId: input.guestId,
      userId: input.userId ?? null,
      displayName: input.displayName ?? null,
      languageCode: input.languageCode ?? null,
    },
  });
}

/** Dual-write / ensure telegram conversation linked to subscriber. */
export async function ensureTelegramConversation(input: {
  projectId: string;
  telegramSubscriberId: string;
  userId?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
}) {
  const existing = await prisma.supportConversation.findUnique({
    where: {
      projectId_telegramSubscriberId: {
        projectId: input.projectId,
        telegramSubscriberId: input.telegramSubscriberId,
      },
    },
  });
  if (existing) {
    // Prefer non-null: TG bind may land after conversation creation.
    const nextUserId = input.userId || existing.userId || null;
    return prisma.supportConversation.update({
      where: { id: existing.id },
      data: {
        status: "open",
        ...(nextUserId && nextUserId !== existing.userId
          ? { userId: nextUserId }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.languageCode !== undefined
          ? { languageCode: input.languageCode }
          : {}),
      },
    });
  }
  return prisma.supportConversation.create({
    data: {
      projectId: input.projectId,
      channel: "telegram",
      telegramSubscriberId: input.telegramSubscriberId,
      userId: input.userId ?? null,
      displayName: input.displayName ?? null,
      languageCode: input.languageCode ?? null,
    },
  });
}

export async function appendSupportMessage(input: {
  conversationId: string;
  projectId: string;
  direction: "inbound" | "outbound";
  source: SupportMessageSource;
  text?: string | null;
  contentType?: string;
  mediaUrl?: string | null;
  externalMessageId?: string | null;
  adminUsername?: string | null;
  clientMeta?: SupportClientMeta | null;
  bumpUnread?: boolean;
}) {
  const now = new Date();
  const contentType =
    input.contentType || (input.mediaUrl ? "image" : "text");
  const mediaUrl = input.mediaUrl
    ? await assertOwnSupportMediaUrl(input.projectId, input.mediaUrl)
    : null;
  // Defense-in-depth for user inbound (web rejects earlier; Telegram redacts here).
  const text =
    input.direction === "inbound" && input.source === "user"
      ? redactUnsafeSupportText(input.text)
      : (input.text ?? null);
  const preview = previewOf(text, contentType, mediaUrl);
  const [msg] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        conversationId: input.conversationId,
        projectId: input.projectId,
        direction: input.direction,
        source: input.source,
        contentType,
        text,
        mediaUrl,
        externalMessageId:
          input.externalMessageId != null
            ? String(input.externalMessageId)
            : null,
        adminUsername: input.adminUsername ?? null,
        clientMeta: input.clientMeta
          ? clientMetaToJson(input.clientMeta)
          : undefined,
        createdAt: now,
      },
    }),
    prisma.supportConversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: now,
        lastMessagePreview: preview,
        status: "open",
        ...(input.bumpUnread ? { unreadCount: { increment: 1 } } : {}),
      },
    }),
  ]);
  return msg;
}

export function mapTelegramSource(
  source: TelegramRecordSource,
): SupportMessageSource {
  if (source === "admin") return "admin";
  if (source === "welcome") return "welcome";
  if (source === "auto_reply") return "auto_reply";
  if (source === "invite_notify") return "system";
  return "user";
}

/** Write Telegram private-chat traffic into the unified support desk. */
export async function dualWriteTelegramMessage(input: {
  projectId: string;
  subscriberId: string;
  userId?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
  direction: "inbound" | "outbound";
  source: TelegramRecordSource;
  text?: string | null;
  contentType?: string;
  telegramMessageId?: string | number | null;
  adminUsername?: string | null;
}) {
  try {
    const sub = await prisma.telegramSubscriber.findFirst({
      where: { id: input.subscriberId, projectId: input.projectId },
      select: {
        userId: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
        telegramUserId: true,
      },
    });
    const nameFromSub = sub
      ? sub.username
        ? `@${sub.username}`
        : [sub.firstName, sub.lastName].filter(Boolean).join(" ") ||
          sub.telegramUserId
      : null;
    const conv = await ensureTelegramConversation({
      projectId: input.projectId,
      telegramSubscriberId: input.subscriberId,
      userId: input.userId ?? sub?.userId ?? null,
      displayName: input.displayName ?? nameFromSub,
      languageCode: input.languageCode ?? sub?.languageCode ?? null,
    });
    await appendSupportMessage({
      conversationId: conv.id,
      projectId: input.projectId,
      direction: input.direction,
      source: mapTelegramSource(input.source),
      text: input.text,
      contentType: input.contentType,
      externalMessageId:
        input.telegramMessageId != null
          ? String(input.telegramMessageId)
          : null,
      adminUsername: input.adminUsername,
      bumpUnread: input.direction === "inbound" && input.source === "user",
    });
  } catch (err) {
    console.warn("[support.dual_write]", err instanceof Error ? err.message : err);
  }
}

export async function listSupportConversations(
  projectId: string,
  opts: {
    channel?: SupportChannel;
    /** web entry: h5 (site widget) | app (in-app WebView); only applies with channel=web */
    clientSource?: "h5" | "app";
    unreadOnly?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(opts.limit || 50, 200);
  const offset = opts.offset || 0;
  const where: Record<string, unknown> = {
    projectId,
    lastMessageAt: { not: null },
  };
  if (opts.channel) where.channel = opts.channel;
  if (opts.clientSource === "app") {
    where.channel = "web";
    where.guest = { ...(where.guest as object), clientSource: "app" };
  } else if (opts.clientSource === "h5") {
    where.channel = "web";
    where.guest = {
      ...(where.guest as object),
      OR: [{ clientSource: null }, { clientSource: "h5" }],
    };
  }
  if (opts.unreadOnly) where.unreadCount = { gt: 0 };
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { displayName: { contains: q } },
      { lastMessagePreview: { contains: q } },
      { guest: { ip: { contains: q } } },
      { user: { email: { contains: q } } },
    ];
    const uid = Number(q);
    if (Number.isInteger(uid) && uid > 0 && String(uid) === q) {
      (where.OR as unknown[]).push({ user: { uid } });
    }
  }

  const [total, unreadTotal, items] = await Promise.all([
    prisma.supportConversation.count({ where }),
    prisma.supportConversation.count({
      where: { projectId, unreadCount: { gt: 0 } },
    }),
    prisma.supportConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        guest: true,
        user: { select: { id: true, uid: true, email: true, status: true } },
        telegramSubscriber: {
          select: {
            id: true,
            telegramUserId: true,
            username: true,
            firstName: true,
            lastName: true,
            languageCode: true,
            isPremium: true,
            canDm: true,
            blocked: true,
            userId: true,
            user: {
              select: { id: true, uid: true, email: true, status: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    total,
    unread_total: unreadTotal,
    items: items.map((c) => {
      // Fall back to TG subscriber bind (same source as old Telegram inbox).
      const user = c.user || c.telegramSubscriber?.user || null;
      return {
        id: c.id,
        channel: c.channel,
        status: c.status,
        display_name: c.displayName,
        language_code: c.languageCode,
        unread_count: c.unreadCount,
        last_message_at: c.lastMessageAt,
        last_message_preview: c.lastMessagePreview,
        user: user
          ? {
              id: user.id,
              uid: user.uid,
              email: user.email,
              status: user.status,
            }
          : null,
        guest: c.guest ? guestProfileView(c.guest) : null,
        telegram: c.telegramSubscriber
          ? {
              subscriber_id: c.telegramSubscriber.id,
              telegram_user_id: c.telegramSubscriber.telegramUserId,
              username: c.telegramSubscriber.username,
              first_name: c.telegramSubscriber.firstName,
              last_name: c.telegramSubscriber.lastName,
              language_code: c.telegramSubscriber.languageCode,
              is_premium: c.telegramSubscriber.isPremium,
              can_dm: c.telegramSubscriber.canDm,
              blocked: c.telegramSubscriber.blocked,
            }
          : null,
      };
    }),
  };
}

/** Lightweight poll path for web widget (no heavy profile joins). */
export async function listWebGuestMessages(
  projectId: string,
  guestId: string,
  opts: { after?: string; limit?: number } = {},
) {
  const conv = await prisma.supportConversation.findUnique({
    where: {
      projectId_guestId: { projectId, guestId },
    },
    select: { id: true, channel: true },
  });
  if (!conv) return null;

  // Hard cap; effective N comes from support.client_message_window policy.
  const limit = Math.min(Math.max(1, opts.limit || 100), 500);
  const afterAt = opts.after ? new Date(opts.after) : null;
  // Always take the latest matching window (desc + reverse). Asc+take would
  // return the oldest slice and hide newer admin replies once past N.
  const where = {
    conversationId: conv.id,
    projectId,
    ...(afterAt
      ? {
          OR: [
            { createdAt: { gt: afterAt } },
            // Soft-recall updates recalledAt without changing createdAt
            { recalledAt: { gt: afterAt } },
          ],
        }
      : {}),
  };
  const latest = await prisma.supportMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const messages = latest.reverse();

  return {
    conversation_id: conv.id,
    items: messages.map((m) =>
      messageView(
        { ...m, conversation: { channel: conv.channel } },
        { viewer: "user" },
      ),
    ),
  };
}

export async function getSupportThread(
  projectId: string,
  conversationId: string,
  opts: { limit?: number; after?: string } = {},
) {
  const conv = await prisma.supportConversation.findFirst({
    where: { id: conversationId, projectId },
    include: {
      guest: true,
      user: { select: supportUserProfileSelect },
      telegramSubscriber: {
        include: {
          user: { select: supportUserProfileSelect },
        },
      },
    },
  });
  if (!conv) {
    throw Object.assign(new Error("support.conversation_not_found"), {
      statusCode: 404,
    });
  }

  // Prefer conversation.userId; fall back to TG subscriber bind (old inbox source).
  const linkedUser =
    (conv.user as SupportUserProfile | null) ||
    (conv.telegramSubscriber?.user as SupportUserProfile | null) ||
    null;
  const linkedUserId =
    conv.userId ||
    conv.telegramSubscriber?.userId ||
    conv.telegramSubscriber?.user?.id ||
    null;
  if (linkedUserId && linkedUserId !== conv.userId) {
    void prisma.supportConversation
      .update({
        where: { id: conv.id },
        data: { userId: linkedUserId },
      })
      .catch(() => {});
  }

  const limit = Math.min(opts.limit || 100, 200);
  // Inbox needs the latest window. `asc + take` would return the oldest N and
  // hide new messages once a thread exceeds the limit (left preview still updates).
  let messages;
  if (opts.after) {
    messages = await prisma.supportMessage.findMany({
      where: {
        conversationId,
        projectId,
        OR: [
          { createdAt: { gt: new Date(opts.after) } },
          { recalledAt: { gt: new Date(opts.after) } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  } else {
    const latest = await prisma.supportMessage.findMany({
      where: { conversationId, projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    messages = latest.reverse();
  }

  if (conv.unreadCount > 0 && !opts.after) {
    await prisma.supportConversation.update({
      where: { id: conv.id },
      data: { unreadCount: 0 },
    });
  }

  return {
    conversation: {
      id: conv.id,
      channel: conv.channel,
      status: conv.status,
      display_name: conv.displayName,
      language_code: conv.languageCode,
      unread_count: 0,
      guest: conv.guest ? guestProfileView(conv.guest) : null,
      user: linkedUser ? supportUserProfileView(linkedUser) : null,
      telegram: conv.telegramSubscriber
        ? {
            subscriber_id: conv.telegramSubscriber.id,
            telegram_user_id: conv.telegramSubscriber.telegramUserId,
            username: conv.telegramSubscriber.username,
            first_name: conv.telegramSubscriber.firstName,
            last_name: conv.telegramSubscriber.lastName,
            language_code: conv.telegramSubscriber.languageCode,
            is_premium: conv.telegramSubscriber.isPremium,
            is_bot: conv.telegramSubscriber.isBot,
            allows_write_to_pm: conv.telegramSubscriber.allowsWriteToPm,
            photo_url: conv.telegramSubscriber.photoUrl,
            can_dm: conv.telegramSubscriber.canDm,
            blocked: conv.telegramSubscriber.blocked,
            started_at: conv.telegramSubscriber.startedAt,
            last_seen_at: conv.telegramSubscriber.lastSeenAt,
          }
        : null,
    },
    items: messages.map((m) =>
      messageView({ ...m, conversation: { channel: conv.channel } }),
    ),
  };
}

export async function adminReplySupport(input: {
  projectId: string;
  conversationId: string;
  text?: string | null;
  mediaUrl?: string | null;
  adminUsername?: string | null;
}) {
  const text = (input.text || "").trim();
  const mediaUrl = input.mediaUrl
    ? await assertOwnSupportMediaUrl(input.projectId, input.mediaUrl)
    : null;
  if (!text && !mediaUrl) {
    throw Object.assign(new Error("support.empty_reply"), { statusCode: 400 });
  }
  const contentType = mediaUrl ? "image" : "text";
  const conv = await prisma.supportConversation.findFirst({
    where: { id: input.conversationId, projectId: input.projectId },
    include: { telegramSubscriber: true },
  });
  if (!conv) {
    throw Object.assign(new Error("support.conversation_not_found"), {
      statusCode: 404,
    });
  }

  let externalId: string | null = null;
  if (conv.channel === "telegram") {
    const sub = conv.telegramSubscriber;
    if (!sub || sub.blocked || !sub.canDm) {
      throw Object.assign(new Error("telegram.cannot_dm"), { statusCode: 400 });
    }
    const token = await getBotTokenForProject(input.projectId);
    if (!token) {
      throw Object.assign(new Error("telegram.bot_not_configured"), {
        statusCode: 400,
      });
    }
    if (mediaUrl) {
      const sent = await sendPhoto(token, {
        chat_id: sub.chatId,
        photo: mediaUrl,
        caption: text || undefined,
      });
      externalId = sent.message_id != null ? String(sent.message_id) : null;
    } else {
      const sent = await sendMessage(token, {
        chat_id: sub.chatId,
        text,
        disable_web_page_preview: true,
      });
      externalId = sent.message_id != null ? String(sent.message_id) : null;
    }

  }

  const msg = await appendSupportMessage({
    conversationId: conv.id,
    projectId: input.projectId,
    direction: "outbound",
    source: "admin",
    text: text || null,
    contentType,
    mediaUrl,
    externalMessageId: externalId,
    adminUsername: input.adminUsername,
  });
  return messageView({ ...msg, conversation: { channel: conv.channel } });
}

export async function adminRecallSupportMessage(input: {
  projectId: string;
  conversationId: string;
  messageId: string;
}) {
  const msg = await prisma.supportMessage.findFirst({
    where: {
      id: input.messageId,
      conversationId: input.conversationId,
      projectId: input.projectId,
    },
    include: {
      conversation: {
        include: { telegramSubscriber: true },
      },
    },
  });
  if (!msg) {
    throw Object.assign(new Error("support.message_not_found"), {
      statusCode: 404,
    });
  }
  if (msg.recalledAt) {
    return messageView({
      ...msg,
      conversation: { channel: msg.conversation.channel },
    });
  }
  if (msg.direction !== "outbound" || msg.source !== "admin") {
    throw Object.assign(new Error("support.recall_not_allowed"), {
      statusCode: 400,
    });
  }
  if (Date.now() - msg.createdAt.getTime() > ADMIN_RECALL_MAX_AGE_MS) {
    throw Object.assign(new Error("support.recall_expired"), {
      statusCode: 400,
    });
  }
  if (
    msg.conversation.channel === "telegram" &&
    !msg.externalMessageId
  ) {
    throw Object.assign(new Error("support.recall_not_allowed"), {
      statusCode: 400,
    });
  }

  if (msg.conversation.channel === "telegram" && msg.externalMessageId) {
    const sub = msg.conversation.telegramSubscriber;
    const token = await getBotTokenForProject(input.projectId);
    if (token && sub) {
      try {
        await deleteMessage(token, {
          chat_id: sub.chatId,
          message_id: msg.externalMessageId,
        });
      } catch (err) {
        const code = (err as { telegramCode?: number }).telegramCode;
        if (code !== 400) throw err;
      }
    }
  }

  const updated = await prisma.supportMessage.update({
    where: { id: msg.id },
    data: { recalledAt: new Date() },
  });
  return messageView({
    ...updated,
    conversation: { channel: msg.conversation.channel },
  });
}

/** Web guest/user recalls their own inbound message (30 minutes). */
export async function userRecallSupportMessage(input: {
  projectId: string;
  guestId: string;
  messageId: string;
}) {
  const msg = await prisma.supportMessage.findFirst({
    where: {
      id: input.messageId,
      projectId: input.projectId,
    },
    include: {
      conversation: true,
    },
  });
  if (!msg) {
    throw Object.assign(new Error("support.message_not_found"), {
      statusCode: 404,
    });
  }
  if (
    msg.conversation.channel !== "web" ||
    msg.conversation.guestId !== input.guestId
  ) {
    throw Object.assign(new Error("support.recall_forbidden"), {
      statusCode: 403,
    });
  }
  if (msg.recalledAt) {
    return messageView(
      { ...msg, conversation: { channel: msg.conversation.channel } },
      { viewer: "user" },
    );
  }
  if (msg.direction !== "inbound" || msg.source !== "user") {
    throw Object.assign(new Error("support.recall_not_allowed"), {
      statusCode: 400,
    });
  }
  if (Date.now() - msg.createdAt.getTime() > USER_RECALL_MAX_AGE_MS) {
    throw Object.assign(new Error("support.recall_expired"), {
      statusCode: 400,
    });
  }

  const updated = await prisma.supportMessage.update({
    where: { id: msg.id },
    data: { recalledAt: new Date() },
  });
  return messageView(
    { ...updated, conversation: { channel: msg.conversation.channel } },
    { viewer: "user" },
  );
}
