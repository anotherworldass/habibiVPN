import { prisma } from "../../lib/prisma.js";

export type UpsertSubscriberInput = {
  projectId: string;
  botId: string;
  telegramUserId: string | number;
  chatId: string | number;
  userId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  isPremium?: boolean | null;
  isBot?: boolean | null;
  allowsWriteToPm?: boolean | null;
  photoUrl?: string | null;
  canDm?: boolean;
  blocked?: boolean;
};

export async function upsertSubscriber(input: UpsertSubscriberInput) {
  const telegramUserId = String(input.telegramUserId);
  const chatId = String(input.chatId);
  const now = new Date();

  return prisma.telegramSubscriber.upsert({
    where: {
      botId_telegramUserId: { botId: input.botId, telegramUserId },
    },
    create: {
      projectId: input.projectId,
      botId: input.botId,
      telegramUserId,
      chatId,
      userId: input.userId ?? null,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      languageCode: input.languageCode ?? null,
      isPremium: input.isPremium ?? null,
      isBot: input.isBot ?? false,
      allowsWriteToPm: input.allowsWriteToPm ?? null,
      photoUrl: input.photoUrl ?? null,
      canDm: input.canDm ?? true,
      blocked: input.blocked ?? false,
      startedAt: now,
      lastSeenAt: now,
    },
    update: {
      chatId,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
      ...(input.isPremium !== undefined ? { isPremium: input.isPremium } : {}),
      ...(input.isBot !== undefined ? { isBot: input.isBot ?? false } : {}),
      ...(input.allowsWriteToPm !== undefined
        ? { allowsWriteToPm: input.allowsWriteToPm }
        : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.canDm !== undefined ? { canDm: input.canDm } : {}),
      ...(input.blocked !== undefined ? { blocked: input.blocked } : {}),
      lastSeenAt: now,
    },
  });
}

export async function markSubscriberBlocked(botId: string, telegramUserId: string | number) {
  const id = String(telegramUserId);
  await prisma.telegramSubscriber.updateMany({
    where: { botId, telegramUserId: id },
    data: { blocked: true, canDm: false, lastSeenAt: new Date() },
  });
}

export async function listSubscribers(
  projectId: string,
  opts: {
    canDm?: boolean;
    q?: string;
    language?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(opts.limit || 50, 200);
  const offset = opts.offset || 0;
  const where: {
    projectId: string;
    canDm?: boolean;
    blocked?: boolean;
    languageCode?: { startsWith: string } | string;
    OR?: Array<Record<string, unknown>>;
  } = { projectId };
  if (opts.canDm != null) {
    where.canDm = opts.canDm;
    if (opts.canDm) where.blocked = false;
  }
  if (opts.language?.trim()) {
    const lang = opts.language.trim().toLowerCase();
    where.languageCode = { startsWith: lang };
  }
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { username: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { telegramUserId: { contains: q } },
      { userId: { contains: q } },
      { languageCode: { contains: q } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.telegramSubscriber.count({ where }),
    prisma.telegramSubscriber.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, uid: true, email: true } },
      },
    }),
  ]);

  return {
    total,
    items: items.map((s) => ({
      id: s.id,
      telegram_user_id: s.telegramUserId,
      chat_id: s.chatId,
      username: s.username,
      first_name: s.firstName,
      last_name: s.lastName,
      language_code: s.languageCode,
      is_premium: s.isPremium,
      is_bot: s.isBot,
      allows_write_to_pm: s.allowsWriteToPm,
      photo_url: s.photoUrl,
      can_dm: s.canDm,
      blocked: s.blocked,
      user_id: s.userId,
      user_uid: s.user?.uid ?? null,
      user_email: s.user?.email ?? null,
      started_at: s.startedAt,
      last_seen_at: s.lastSeenAt,
    })),
  };
}

export async function subscriberStats(projectId: string) {
  const [total, canDm, blocked, linked, premium] = await Promise.all([
    prisma.telegramSubscriber.count({ where: { projectId } }),
    prisma.telegramSubscriber.count({
      where: { projectId, canDm: true, blocked: false },
    }),
    prisma.telegramSubscriber.count({ where: { projectId, blocked: true } }),
    prisma.telegramSubscriber.count({
      where: { projectId, userId: { not: null } },
    }),
    prisma.telegramSubscriber.count({
      where: { projectId, isPremium: true },
    }),
  ]);
  return { total, can_dm: canDm, blocked, linked, premium };
}
