import { prisma } from "../../lib/prisma.js";
import { getReferralConfig } from "../referral/config.js";
import { sendMessage } from "./api.js";
import { getBotTokenForProject } from "./bot-config.js";
import { recordMessage } from "./messages.js";
import { markSubscriberBlocked } from "./subscribers.js";

/** Exact-match commands (case-insensitive for ascii; trim). */
export const INVITE_NOTIFY_MUTE_CMD = "屏蔽邀请通知";
export const INVITE_NOTIFY_UNMUTE_CMD = "开启邀请通知";

function normalizeCmd(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

export function matchInviteNotifyCommand(
  text: string,
): "mute" | "unmute" | null {
  const t = normalizeCmd(text);
  if (!t) return null;
  if (t === INVITE_NOTIFY_MUTE_CMD || t === "/mute_invite" || t === "/invite_off") {
    return "mute";
  }
  if (
    t === INVITE_NOTIFY_UNMUTE_CMD ||
    t === "/unmute_invite" ||
    t === "/invite_on"
  ) {
    return "unmute";
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Unicode-safe nickname mask: 张三→张* · 李小明→李*明 · John→J*** */
export function maskTgDisplayName(raw: string): string {
  const chars = [...raw.trim()];
  if (!chars.length) return "";
  if (chars.length === 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  if (chars.length === 3) return `${chars[0]}*${chars[2]}`;
  const mid = Math.min(chars.length - 2, 3);
  return `${chars[0]}${"*".repeat(mid)}${chars[chars.length - 1]}`;
}

/** @username → @ab***c */
export function maskTgUsername(raw: string): string {
  const s = raw.trim().replace(/^@/, "");
  if (!s) return "";
  if (s.length <= 2) return `@${s[0]}*`;
  if (s.length <= 4) return `@${s[0]}***`;
  return `@${s.slice(0, 2)}***${s.slice(-1)}`;
}

/** Telegram user id → ***1234 (last 4) */
export function maskTgUserId(raw: string | number): string {
  const s = String(raw).trim();
  if (!s) return "新好友";
  if (s.length <= 4) return `***${s}`;
  return `***${s.slice(-4)}`;
}

/** Prefer TG nickname → @username → TG id (never Habibi UID). */
export function friendLabelFromTelegram(input: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  telegramUserId?: string | number | null;
}): string {
  const first = (input.firstName || "").trim();
  const last = (input.lastName || "").trim();
  if (first) {
    if (last) {
      const glued =
        /^[\u4e00-\u9fff]+$/.test(first) && /^[\u4e00-\u9fff]+$/.test(last);
      return maskTgDisplayName(glued ? `${first}${last}` : `${first} ${last}`);
    }
    return maskTgDisplayName(first);
  }
  if (last) return maskTgDisplayName(last);
  if (input.username?.trim()) return maskTgUsername(input.username);
  if (input.telegramUserId != null && String(input.telegramUserId).trim()) {
    return maskTgUserId(input.telegramUserId);
  }
  return "新好友";
}

function buildJoinText(friend: string, maxLevel: number): string {
  return [
    `🎉 ${friend} 好友已加入！`,
    `好友付费成功即可享受 ${maxLevel} 层佣金。`,
    "",
    `回复「${INVITE_NOTIFY_MUTE_CMD}」可关闭此类通知；`,
    `回复「${INVITE_NOTIFY_UNMUTE_CMD}」可重新开启。`,
  ].join("\n");
}

/**
 * After invite bind commits: DM the direct inviter (if they have a linked TG subscriber).
 * Fire-and-forget; never throws to callers.
 */
export async function notifyInviterOnInviteeJoined(input: {
  inviteeId: string;
  inviterId: string;
  /** When true, wait briefly for Mini App telegram bind to land nickname. */
  waitForTelegram?: boolean;
}): Promise<void> {
  try {
    if (input.waitForTelegram) {
      for (const ms of [800, 1500, 3000]) {
        await sleep(ms);
        const ready = await prisma.telegramSubscriber.findFirst({
          where: { userId: input.inviteeId },
          select: { id: true, firstName: true, username: true, telegramUserId: true },
        });
        if (ready?.telegramUserId) break;
      }
    }

    const [invitee, inviter] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.inviteeId },
        select: {
          id: true,
          projectId: true,
          invitedById: true,
          inviteJoinNotifiedAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: input.inviterId },
        select: {
          id: true,
          projectId: true,
          promoEnabled: true,
          status: true,
          promoGroup: { select: { maxLevel: true } },
        },
      }),
    ]);
    if (!invitee || !inviter) return;
    if (invitee.inviteJoinNotifiedAt) return;
    if (invitee.invitedById !== input.inviterId) return;
    if (inviter.status !== "active" || !inviter.promoEnabled) return;
    if (invitee.projectId !== inviter.projectId) return;

    const sub = await prisma.telegramSubscriber.findFirst({
      where: {
        projectId: inviter.projectId,
        userId: inviter.id,
        canDm: true,
        blocked: false,
        inviteNotifyEnabled: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });
    if (!sub) return;

    const inviteeTg = await prisma.telegramSubscriber.findFirst({
      where: { projectId: invitee.projectId, userId: invitee.id },
      select: {
        firstName: true,
        lastName: true,
        username: true,
        telegramUserId: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    // Prefer sending once we have TG identity; if still missing and waiting path,
    // fall through with "新好友" only after waits above.
    const friend = friendLabelFromTelegram({
      firstName: inviteeTg?.firstName,
      lastName: inviteeTg?.lastName,
      username: inviteeTg?.username,
      telegramUserId: inviteeTg?.telegramUserId,
    });

    const config = await getReferralConfig(inviter.projectId);
    const maxLevel = inviter.promoGroup?.maxLevel ?? config.maxLevel;
    const text = buildJoinText(friend, maxLevel);

    const token = await getBotTokenForProject(inviter.projectId);
    if (!token) return;

    // Claim right before send to avoid double DM
    const claimed = await prisma.user.updateMany({
      where: {
        id: input.inviteeId,
        invitedById: input.inviterId,
        inviteJoinNotifiedAt: null,
      },
      data: { inviteJoinNotifiedAt: new Date() },
    });
    if (claimed.count === 0) return;

    try {
      const sent = await sendMessage(token, {
        chat_id: sub.chatId,
        text,
        disable_web_page_preview: true,
      });

      await recordMessage({
        projectId: inviter.projectId,
        botId: sub.botId,
        subscriberId: sub.id,
        direction: "outbound",
        source: "invite_notify",
        contentType: "text",
        text,
        telegramMessageId: sent.message_id,
      }).catch(() => {});
    } catch (sendErr) {
      // Allow retry later (e.g. bind arrives with nickname)
      await prisma.user
        .update({
          where: { id: input.inviteeId },
          data: { inviteJoinNotifiedAt: null },
        })
        .catch(() => {});
      throw sendErr;
    }
  } catch (err) {
    const code = (err as { telegramCode?: number }).telegramCode;
    if (code === 403) {
      try {
        const blockedSub = await prisma.telegramSubscriber.findFirst({
          where: { userId: input.inviterId, canDm: true },
          select: { botId: true, telegramUserId: true },
        });
        if (blockedSub) {
          await markSubscriberBlocked(blockedSub.botId, blockedSub.telegramUserId);
        }
      } catch {
        /* ignore */
      }
    }
    console.warn(
      "[telegram.invite-notify] send failed",
      input.inviterId,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Handle mute/unmute text from webhook. Returns reply text if handled. */
export async function applyInviteNotifyCommand(input: {
  subscriberId: string;
  text: string;
}): Promise<{ reply: string } | null> {
  const cmd = matchInviteNotifyCommand(input.text);
  if (!cmd) return null;

  const enabled = cmd === "unmute";
  await prisma.telegramSubscriber.update({
    where: { id: input.subscriberId },
    data: { inviteNotifyEnabled: enabled },
  });

  if (enabled) {
    return {
      reply: `已开启邀请通知。有好友通过你的邀请加入时，我会私信提醒你。\n回复「${INVITE_NOTIFY_MUTE_CMD}」可关闭。`,
    };
  }
  return {
    reply: `已屏蔽邀请通知。\n回复「${INVITE_NOTIFY_UNMUTE_CMD}」可重新开启。`,
  };
}

/** Schedule notify outside request critical path (waits for TG nickname when possible). */
export function scheduleInviterJoinNotify(input: {
  inviteeId: string;
  inviterId: string | null | undefined;
  waitForTelegram?: boolean;
}) {
  if (!input.inviterId) return;
  void notifyInviterOnInviteeJoined({
    inviteeId: input.inviteeId,
    inviterId: input.inviterId,
    waitForTelegram: input.waitForTelegram ?? true,
  });
}
