import { prisma } from "../../lib/prisma.js";
import { getBotTokenForProject } from "./bot-config.js";
import { parseWebAppUser, validateWebAppInitData } from "./crypto.js";
import { scheduleInviterJoinNotify } from "./invite-notify.js";
import { upsertSubscriber } from "./subscribers.js";
import { scheduleSignupTrialGrant } from "../signup-trial.js";

/**
 * Bind Mini App initData to Habibi user + upsert Telegram subscriber.
 * writeAccess=true means user allowed bot to DM (requestWriteAccess).
 */
export async function bindTelegramFromInitData(input: {
  userId: string;
  initData: string;
  writeAccess?: boolean;
  projectId?: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: {
      id: true,
      projectId: true,
      invitedById: true,
      inviteJoinNotifiedAt: true,
    },
  });
  const projectId = input.projectId || user.projectId;

  const bot = await prisma.projectTelegramBot.findUnique({ where: { projectId } });
  if (!bot?.enabled) {
    throw Object.assign(new Error("telegram.bot_disabled"), { statusCode: 400 });
  }
  const token = await getBotTokenForProject(projectId);
  if (!token) {
    throw Object.assign(new Error("telegram.bot_not_configured"), { statusCode: 400 });
  }

  const fields = validateWebAppInitData(input.initData, token);
  const tgUser = parseWebAppUser(fields.user);

  const sub = await upsertSubscriber({
    projectId,
    botId: bot.id,
    telegramUserId: tgUser.id,
    chatId: tgUser.id, // private chat id === user id
    userId: user.id,
    username: tgUser.username,
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
    languageCode: tgUser.language_code,
    isPremium: tgUser.is_premium ?? null,
    isBot: false,
    photoUrl: tgUser.photo_url ?? null,
    allowsWriteToPm:
      input.writeAccess === true
        ? true
        : input.writeAccess === false
          ? false
          : (tgUser.allows_write_to_pm ?? null),
    ...(input.writeAccess === true
      ? { canDm: true, blocked: false }
      : input.writeAccess === false
        ? { canDm: false }
        : {}),
  });

  // Keep unified support desk in sync with TG bind.
  void prisma.supportConversation
    .updateMany({
      where: {
        projectId,
        telegramSubscriberId: sub.id,
        OR: [{ userId: null }, { userId: { not: user.id } }],
      },
      data: { userId: user.id },
    })
    .catch(() => {});

  // After TG profile is on file: notify inviter with masked nickname (deduped).
  if (user.invitedById && !user.inviteJoinNotifiedAt) {
    scheduleInviterJoinNotify({
      inviteeId: user.id,
      inviterId: user.invitedById,
      waitForTelegram: false,
    });
  }

  scheduleSignupTrialGrant(user.id, "telegram_bind", tgUser.language_code ?? null);

  return {
    ok: true as const,
    telegram_user_id: String(tgUser.id),
    subscriber_id: sub.id,
    can_dm: sub.canDm,
    language_code: sub.languageCode,
    is_premium: sub.isPremium,
    bot_username: bot.botUsername,
  };
}
