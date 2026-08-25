import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { writeAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { sendProbeTelegramTest } from "../services/node-probe/alerts.js";
import { getProbeLastRun, runNodeProbeRound } from "../services/node-probe/job.js";
import {
  getNodeProbeConfig,
  maskNodeProbeValue,
  upsertNodeProbeConfig,
} from "../services/node-probe/settings.js";

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

const settingsPatch = z
  .object({
    enabled: z.boolean(),
    remark: z.string().max(255).nullable().optional(),
    probeSlotId: z.string().max(64).nullable().optional(),
    delayIntervalSec: z.number().int().optional(),
    speedIntervalSec: z.number().int().optional(),
    delayUrl: z.string().max(500).optional(),
    speedUrl: z.string().max(500).optional(),
    speedBytes: z.number().int().optional(),
    speedEnabled: z.boolean().optional(),
    delayTimeoutMs: z.number().int().optional(),
    speedTimeoutMs: z.number().int().optional(),
    delayConcurrency: z.number().int().optional(),
    downFailStreak: z.number().int().optional(),
    unstableWindowMin: z.number().int().optional(),
    unstableSuccessRate: z.number().optional(),
    delayP95Ms: z.number().int().optional(),
    slowMbps: z.number().optional(),
    slowStreak: z.number().int().optional(),
    alertCooldownSec: z.number().int().optional(),
    regionDigestMin: z.number().int().optional(),
    mihomoApiUrl: z.string().max(200).optional(),
    mihomoSecret: z.string().max(128).optional(),
    mixedPort: z.number().int().optional(),
    telegramChatId: z.string().max(64).nullable().optional(),
  })
  .strip();

export const adminNodeProbeRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/node-probe`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/settings`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getNodeProbeConfig(projectId);
      const lastRun = await getProbeLastRun();
      return {
        project_id: projectId,
        enabled: cfg.enabled,
        remark: cfg.remark,
        last_run: lastRun,
        ...maskNodeProbeValue(cfg.value),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.put(`${prefix}/settings`, async (req, reply) => {
    const parsed = settingsPatch.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const { enabled, remark, ...patch } = parsed.data;
      if (patch.probeSlotId) {
        const slot = await prisma.userUpstream.findUnique({
          where: { id: patch.probeSlotId },
          select: { id: true },
        });
        if (!slot) {
          return reply.code(400).send({ error: "node_probe.slot_not_found" });
        }
      }
      const saved = await upsertNodeProbeConfig({
        projectId,
        enabled,
        remark,
        patch,
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "settings.node_probe.upsert",
        targetType: "project",
        targetId: projectId,
        meta: { enabled: saved.enabled },
      });
      return {
        project_id: projectId,
        enabled: saved.enabled,
        remark: saved.remark,
        ...maskNodeProbeValue(saved.value),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/test-telegram`, async (req, reply) => {
    const body = z
      .object({ chat_id: z.string().min(1).max(64).optional() })
      .safeParse(req.body ?? {});
    try {
      const projectId = await resolveAdminProjectId(req);
      const cfg = await getNodeProbeConfig(projectId);
      const chatId = body.success
        ? body.data.chat_id || cfg.value.telegramChatId
        : cfg.value.telegramChatId;
      if (!chatId) {
        return reply.code(400).send({ error: "node_probe.telegram_chat_missing" });
      }
      return await sendProbeTelegramTest(projectId, chatId);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${prefix}/run`, async (req, reply) => {
    const body = z
      .object({ include_speed: z.boolean().optional() })
      .safeParse(req.body ?? {});
    try {
      const projectId = await resolveAdminProjectId(req);
      const run = await runNodeProbeRound({
        force: true,
        includeSpeed: body.success ? Boolean(body.data.include_speed) : false,
        projectId,
        log: req.log,
      });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "node_probe.run",
        targetType: "project",
        targetId: projectId,
        meta: { include_speed: body.success ? body.data.include_speed : false },
      });
      return run;
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/targets`, async (req, reply) => {
    try {
      await resolveAdminProjectId(req);
      const q = req.query as { region?: string };
      const rows = await prisma.nodeProbeTarget.findMany({
        where: q.region ? { region: q.region.toUpperCase() } : undefined,
        orderBy: [{ region: "asc" }, { name: "asc" }],
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          fingerprint: r.fingerprint,
          name: r.name,
          region: r.region,
          protocol: r.protocol,
          server: r.server,
          port: r.port,
          wireraw_name: r.wirerawName,
          last_seen_at: r.lastSeenAt.toISOString(),
          last_ok: r.lastOk,
          last_tcp_ms: r.lastTcpMs,
          last_delay_ms: r.lastDelayMs,
          last_download_mbps: r.lastDownloadMbps,
          last_error: r.lastError,
          last_probed_at: r.lastProbedAt?.toISOString() ?? null,
        })),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/targets/:id/samples`, async (req, reply) => {
    try {
      await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const q = req.query as { limit?: string };
      const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
      const rows = await prisma.nodeProbeSample.findMany({
        where: { targetId: id },
        orderBy: { probedAt: "desc" },
        take: limit,
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          probed_at: r.probedAt.toISOString(),
          ok: r.ok,
          tcp_ms: r.tcpMs,
          delay_ms: r.delayMs,
          download_mbps: r.downloadMbps,
          error: r.error,
        })),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(`${prefix}/incidents`, async (req, reply) => {
    try {
      await resolveAdminProjectId(req);
      const q = req.query as { open?: string };
      const openOnly = q.open === "1" || q.open === "true";
      const rows = await prisma.nodeProbeIncident.findMany({
        where: openOnly ? { closedAt: null } : undefined,
        orderBy: { openedAt: "desc" },
        take: 100,
        include: {
          target: { select: { name: true, protocol: true, region: true } },
        },
      });
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          region: r.region,
          summary: r.summary,
          opened_at: r.openedAt.toISOString(),
          closed_at: r.closedAt?.toISOString() ?? null,
          last_alert_at: r.lastAlertAt?.toISOString() ?? null,
          target: r.target
            ? {
                name: r.target.name,
                protocol: r.target.protocol,
                region: r.target.region,
              }
            : null,
        })),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
