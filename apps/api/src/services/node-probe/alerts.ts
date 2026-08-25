import { prisma } from "../../lib/prisma.js";
import { regionZhName } from "../../lib/regions.js";
import { sendMessage } from "../telegram/api.js";
import { getBotTokenForProject } from "../telegram/bot-config.js";
import { escapeHtml, formatProbeDigest } from "./alerts-format.js";
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

type PendingKind = "down" | "unstable" | "slow" | "recovery";

type PendingAlert = {
  incidentId: string | null;
  kind: PendingKind;
  region: string;
  line: string;
};

async function openOrTouchIncident(input: {
  targetId: string;
  region: string;
  kind: string;
  summary: string;
}): Promise<{ id: string; openedNow: boolean }> {
  const existing = await prisma.nodeProbeIncident.findFirst({
    where: { targetId: input.targetId, kind: input.kind, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  if (existing) {
    await prisma.nodeProbeIncident.update({
      where: { id: existing.id },
      data: { summary: input.summary },
    });
    return { id: existing.id, openedNow: false };
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
  return { id: row.id, openedNow: true };
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

  const pending: PendingAlert[] = [];

  for (const item of input.round) {
    const label = `${escapeHtml(item.name)} / ${escapeHtml(item.protocol)}`;
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
      if (canSend && inc.openedNow) {
        pending.push({
          incidentId: inc.id,
          kind: "down",
          region: item.region,
          line: `${label} · 连续 ${fails} 次探测失败`,
        });
      }
    } else if (item.ok) {
      const closed = await closeIncident(item.targetId, "down");
      if (closed && canSend) {
        pending.push({
          incidentId: null,
          kind: "recovery",
          region: item.region,
          line: `${label} · 延迟 ${item.delayMs ?? "—"} ms`,
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
        if (canSend && inc.openedNow) {
          pending.push({
            incidentId: inc.id,
            kind: "unstable",
            region: item.region,
            line: `${label} · 成功率 ${(rate * 100).toFixed(0)}%${p95 != null ? ` · p95 ${p95}ms` : ""}`,
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
        if (canSend && inc.openedNow) {
          pending.push({
            incidentId: inc.id,
            kind: "slow",
            region: item.region,
            line: `${label} · ${item.downloadMbps} Mbps（阈值 ${input.cfg.slowMbps}）`,
          });
        }
      } else if (item.downloadMbps >= input.cfg.slowMbps) {
        await closeIncident(item.targetId, "slow");
      }
    }
  }

  if (!canSend || !pending.length) return;

  const groups: Array<{
    kind: PendingKind;
    emoji: string;
    title: string;
    collapseRegionAt?: number;
  }> = [
    {
      kind: "down",
      emoji: "⚠️",
      title: "节点 Down",
      collapseRegionAt: input.cfg.regionDigestMin,
    },
    { kind: "unstable", emoji: "🟠", title: "节点不稳" },
    { kind: "slow", emoji: "🐢", title: "测速异常" },
    { kind: "recovery", emoji: "✅", title: "节点恢复" },
  ];

  for (const g of groups) {
    const items = pending.filter((p) => p.kind === g.kind);
    if (!items.length) continue;
    const text = formatProbeDigest({
      emoji: g.emoji,
      title: g.title,
      items: items.map((p) => ({ region: p.region, line: p.line })),
      regionName: regionZhName,
      collapseRegionAt: g.collapseRegionAt,
    });
    try {
      const sent = await sendMessage(token!, {
        chat_id: chatId!,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      for (const p of items) {
        if (p.incidentId) {
          await markAlerted(p.incidentId, String(sent.message_id));
        }
      }
    } catch (err) {
      input.log?.warn?.(
        { err: err instanceof Error ? err.message : String(err), kind: g.kind },
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
