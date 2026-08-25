import { prisma } from "../../lib/prisma.js";
import { regionZhName } from "../../lib/regions.js";
import { sendMessage } from "../telegram/api.js";
import { getBotTokenForProject } from "../telegram/bot-config.js";
import { consecutiveFailCount, percentile } from "./logic.js";
import type { NodeProbeValue } from "./settings.js";

export type ProbeRoundSample = {
  targetId: string;
  region: string;
  name: string;
  protocol: string;
  ok: boolean;
  delayMs: number | null;
  downloadMbps: number | null;
};

type LogFn = {
  info: (o: unknown, msg?: string) => void;
  warn?: (o: unknown, msg?: string) => void;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cooldownOk(last: Date | null, sec: number): boolean {
  if (!last) return true;
  return Date.now() - last.getTime() >= sec * 1000;
}

async function openOrTouchIncident(input: {
  targetId: string;
  region: string;
  kind: string;
  summary: string;
}): Promise<{ id: string; lastAlertAt: Date | null; openedNow: boolean }> {
  const existing = await prisma.nodeProbeIncident.findFirst({
    where: { targetId: input.targetId, kind: input.kind, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  if (existing) {
    await prisma.nodeProbeIncident.update({
      where: { id: existing.id },
      data: { summary: input.summary },
    });
    return {
      id: existing.id,
      lastAlertAt: existing.lastAlertAt,
      openedNow: false,
    };
  }
  const row = await prisma.nodeProbeIncident.create({
    data: {
      targetId: input.targetId,
      region: input.region,
      kind: input.kind,
      summary: input.summary,
      openedAt: new Date(),
    },
  });
  return { id: row.id, lastAlertAt: null, openedNow: true };
}

async function closeIncident(targetId: string, kind: string): Promise<boolean> {
  const existing = await prisma.nodeProbeIncident.findFirst({
    where: { targetId, kind, closedAt: null },
  });
  if (!existing) return false;
  await prisma.nodeProbeIncident.update({
    where: { id: existing.id },
    data: { closedAt: new Date() },
  });
  return true;
}

async function markAlerted(id: string, telegramMessageId?: string | null) {
  await prisma.nodeProbeIncident.update({
    where: { id },
    data: {
      lastAlertAt: new Date(),
      ...(telegramMessageId ? { telegramMessageId } : {}),
    },
  });
}

export async function evaluateAndAlert(input: {
  projectId: string;
  cfg: NodeProbeValue;
  round: ProbeRoundSample[];
  log?: LogFn;
}): Promise<void> {
  const chatId = input.cfg.telegramChatId?.trim();
  const token = chatId ? await getBotTokenForProject(input.projectId) : null;
  const canSend = Boolean(chatId && token);

  const pendingMessages: Array<{
    incidentId: string;
    region: string;
    kind: string;
    text: string;
  }> = [];

  for (const item of input.round) {
    const recent = await prisma.nodeProbeSample.findMany({
      where: { targetId: item.targetId },
      orderBy: { probedAt: "desc" },
      take: Math.max(input.cfg.downFailStreak, 8),
      select: { ok: true, delayMs: true, downloadMbps: true, probedAt: true },
    });

    const fails = consecutiveFailCount(recent);
    if (fails >= input.cfg.downFailStreak) {
      const inc = await openOrTouchIncident({
        targetId: item.targetId,
        region: item.region,
        kind: "down",
        summary: `${item.name} / ${item.protocol} 连续 ${fails} 次 URL-test 失败`,
      });
      if (canSend && (inc.openedNow || cooldownOk(inc.lastAlertAt, input.cfg.alertCooldownSec))) {
        pendingMessages.push({
          incidentId: inc.id,
          region: item.region,
          kind: "down",
          text: `⚠️ <b>节点 Down</b> · ${escapeHtml(regionZhName(item.region))}\n${escapeHtml(item.name)} / ${escapeHtml(item.protocol)}\n连续 ${fails} 次探测失败`,
        });
      }
    } else if (item.ok) {
      const closed = await closeIncident(item.targetId, "down");
      if (closed && canSend) {
        pendingMessages.push({
          incidentId: `recovery:${item.targetId}`,
          region: item.region,
          kind: "recovery",
          text: `✅ <b>节点恢复</b> · ${escapeHtml(regionZhName(item.region))}\n${escapeHtml(item.name)} / ${escapeHtml(item.protocol)}\n延迟 ${item.delayMs ?? "—"} ms`,
        });
      }
    }

    const since = new Date(Date.now() - input.cfg.unstableWindowMin * 60_000);
    const window = await prisma.nodeProbeSample.findMany({
      where: { targetId: item.targetId, probedAt: { gte: since } },
      select: { ok: true, delayMs: true },
    });
    if (window.length >= 3 && item.ok) {
      const okN = window.filter((s) => s.ok).length;
      const rate = okN / window.length;
      const delays = window
        .map((s) => s.delayMs)
        .filter((n): n is number => n != null);
      const p95 = percentile(delays, 95);
      const unstable =
        rate < input.cfg.unstableSuccessRate ||
        (p95 != null && p95 > input.cfg.delayP95Ms);
      if (unstable && fails < input.cfg.downFailStreak) {
        const inc = await openOrTouchIncident({
          targetId: item.targetId,
          region: item.region,
          kind: "unstable",
          summary: `${item.name} 近 ${input.cfg.unstableWindowMin} 分钟成功率 ${(rate * 100).toFixed(0)}%${p95 != null ? `，p95 ${p95}ms` : ""}`,
        });
        if (canSend && (inc.openedNow || cooldownOk(inc.lastAlertAt, input.cfg.alertCooldownSec))) {
          pendingMessages.push({
            incidentId: inc.id,
            region: item.region,
            kind: "unstable",
            text: `🟠 <b>节点不稳</b> · ${escapeHtml(regionZhName(item.region))}\n${escapeHtml(item.name)} / ${escapeHtml(item.protocol)}\n成功率 ${(rate * 100).toFixed(0)}%${p95 != null ? ` · p95 ${p95}ms` : ""}`,
          });
        }
      } else if (!unstable) {
        await closeIncident(item.targetId, "unstable");
      }
    }

    if (item.ok && item.downloadMbps != null) {
      const speeds = recent
        .map((s) => s.downloadMbps)
        .filter((n): n is number => n != null)
        .slice(0, input.cfg.slowStreak);
      const slow =
        speeds.length >= input.cfg.slowStreak &&
        speeds.every((n) => n < input.cfg.slowMbps);
      if (slow) {
        const inc = await openOrTouchIncident({
          targetId: item.targetId,
          region: item.region,
          kind: "slow",
          summary: `${item.name} 连续 ${speeds.length} 次测速 < ${input.cfg.slowMbps} Mbps（最近 ${item.downloadMbps} Mbps）`,
        });
        if (canSend && (inc.openedNow || cooldownOk(inc.lastAlertAt, input.cfg.alertCooldownSec))) {
          pendingMessages.push({
            incidentId: inc.id,
            region: item.region,
            kind: "slow",
            text: `🐢 <b>速度异常</b> · ${escapeHtml(regionZhName(item.region))}\n${escapeHtml(item.name)} / ${escapeHtml(item.protocol)}\n${item.downloadMbps} Mbps（阈值 ${input.cfg.slowMbps}）`,
          });
        }
      } else if (item.downloadMbps >= input.cfg.slowMbps) {
        await closeIncident(item.targetId, "slow");
      }
    }
  }

  if (!canSend || !pendingMessages.length) return;

  const downs = pendingMessages.filter((m) => m.kind === "down");
  const byRegion = new Map<string, typeof downs>();
  for (const m of downs) {
    const list = byRegion.get(m.region) || [];
    list.push(m);
    byRegion.set(m.region, list);
  }

  const skipIds = new Set<string>();
  const digestTexts: string[] = [];
  for (const [region, list] of byRegion) {
    if (list.length >= input.cfg.regionDigestMin) {
      for (const m of list) skipIds.add(m.incidentId);
      digestTexts.push(
        `⚠️ <b>${escapeHtml(regionZhName(region))} 地区 ${list.length} 条入站探测失败</b>\n监测点：境外机房 · 已合并推送`,
      );
    }
  }

  const toSend = [
    ...digestTexts.map((text) => ({ incidentId: null as string | null, text })),
    ...pendingMessages
      .filter((m) => !skipIds.has(m.incidentId))
      .map((m) => ({ incidentId: m.incidentId.startsWith("recovery:") ? null : m.incidentId, text: m.text })),
  ];

  for (const msg of toSend) {
    try {
      const sent = await sendMessage(token!, {
        chat_id: chatId!,
        text: msg.text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      if (msg.incidentId) {
        await markAlerted(msg.incidentId, String(sent.message_id));
      }
      if (msg.text.includes("已合并推送")) {
        for (const id of skipIds) {
          await markAlerted(id, String(sent.message_id));
        }
      }
    } catch (err) {
      input.log?.warn?.(
        { err: err instanceof Error ? err.message : String(err) },
        "node-probe telegram send failed",
      );
    }
  }
}

export async function sendProbeTelegramTest(
  projectId: string,
  chatId: string,
): Promise<{ ok: true; chat_id: string }> {
  const token = await getBotTokenForProject(projectId);
  if (!token) {
    throw Object.assign(new Error("node_probe.telegram_bot_missing"), {
      statusCode: 400,
    });
  }
  const id = chatId.trim();
  if (!id) {
    throw Object.assign(new Error("node_probe.telegram_chat_missing"), {
      statusCode: 400,
    });
  }
  await sendMessage(token, {
    chat_id: id,
    text: "✅ 节点探测告警通道已接通（测试消息）\n监测点：境外机房",
    disable_web_page_preview: true,
  });
  return { ok: true, chat_id: id };
}
