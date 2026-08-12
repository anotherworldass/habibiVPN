import type { TelegramAutoReplyMatch } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type AutoReplyRuleView = {
  id: string;
  keyword: string;
  match_mode: TelegramAutoReplyMatch;
  reply_text: string;
  enabled: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
};

function toView(r: {
  id: string;
  keyword: string;
  matchMode: TelegramAutoReplyMatch;
  replyText: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}): AutoReplyRuleView {
  return {
    id: r.id,
    keyword: r.keyword,
    match_mode: r.matchMode,
    reply_text: r.replyText,
    enabled: r.enabled,
    priority: r.priority,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function matchAutoReply(
  text: string,
  rules: Array<{
    id: string;
    keyword: string;
    matchMode: TelegramAutoReplyMatch;
    replyText: string;
  }>,
): { id: string; replyText: string } | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  for (const r of rules) {
    const needle = r.keyword.trim().toLowerCase();
    if (!needle) continue;
    let ok = false;
    if (r.matchMode === "exact") ok = hay === needle;
    else if (r.matchMode === "starts_with") ok = hay.startsWith(needle);
    else ok = hay.includes(needle);
    if (ok) return { id: r.id, replyText: r.replyText };
  }
  return null;
}

export async function listAutoReplyRules(projectId: string) {
  const items = await prisma.telegramAutoReplyRule.findMany({
    where: { projectId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return { items: items.map(toView) };
}

export async function createAutoReplyRule(
  projectId: string,
  botId: string,
  input: {
    keyword: string;
    matchMode?: TelegramAutoReplyMatch;
    replyText: string;
    enabled?: boolean;
    priority?: number;
  },
) {
  const row = await prisma.telegramAutoReplyRule.create({
    data: {
      projectId,
      botId,
      keyword: input.keyword.trim(),
      matchMode: input.matchMode ?? "contains",
      replyText: input.replyText,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
    },
  });
  return toView(row);
}

export async function updateAutoReplyRule(
  projectId: string,
  id: string,
  input: {
    keyword?: string;
    matchMode?: TelegramAutoReplyMatch;
    replyText?: string;
    enabled?: boolean;
    priority?: number;
  },
) {
  const existing = await prisma.telegramAutoReplyRule.findFirst({
    where: { id, projectId },
  });
  if (!existing) {
    throw Object.assign(new Error("telegram.auto_reply_not_found"), { statusCode: 404 });
  }
  const row = await prisma.telegramAutoReplyRule.update({
    where: { id },
    data: {
      ...(input.keyword !== undefined ? { keyword: input.keyword.trim() } : {}),
      ...(input.matchMode !== undefined ? { matchMode: input.matchMode } : {}),
      ...(input.replyText !== undefined ? { replyText: input.replyText } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  });
  return toView(row);
}

export async function deleteAutoReplyRule(projectId: string, id: string) {
  const existing = await prisma.telegramAutoReplyRule.findFirst({
    where: { id, projectId },
  });
  if (!existing) {
    throw Object.assign(new Error("telegram.auto_reply_not_found"), { statusCode: 404 });
  }
  await prisma.telegramAutoReplyRule.delete({ where: { id } });
  return { ok: true as const };
}

export async function loadEnabledAutoReplyRules(botId: string) {
  return prisma.telegramAutoReplyRule.findMany({
    where: { botId, enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      keyword: true,
      matchMode: true,
      replyText: true,
    },
  });
}
