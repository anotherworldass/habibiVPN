import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import {
  createAutoReplyRule,
  deleteAutoReplyRule,
  listAutoReplyRules,
  updateAutoReplyRule,
} from "../services/telegram/auto-reply.js";
import { getBotPublicView, getOrCreateBotRow, updateBotConfig } from "../services/telegram/bot-config.js";
import {
  cancelBroadcastJob,
  countBroadcastAudience,
  createBroadcastJob,
  getBroadcastJob,
  listBroadcastJobs,
  pauseBroadcastJob,
  resumeBroadcastJob,
  startBroadcastRecall,
} from "../services/telegram/broadcast.js";
import { listSubscribers, subscriberStats } from "../services/telegram/subscribers.js";
import {
  getTelegramQuickReplies,
  telegramQuickReplyItemSchema,
  upsertTelegramQuickReplies,
} from "../services/system-settings.js";
import { randomUUID } from "node:crypto";

export const adminTelegramRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/telegram`;

  app.get(`${prefix}/bot`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return await getBotPublicView(projectId);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.patch(`${prefix}/bot`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        enabled: z.boolean().optional(),
        bot_token: z.string().max(200).nullable().optional(),
        bot_username: z.string().max(64).nullable().optional(),
        mini_app_url: z.string().max(500).nullable().optional(),
        mini_app_direct_link: z.string().max(500).nullable().optional(),
        welcome_text: z.string().max(2000).nullable().optional(),
        channel_url: z.string().max(500).nullable().optional(),
        invite_share_text: z.string().max(2000).nullable().optional(),
        /** null / "" clears override → env.API_PUBLIC_ORIGIN */
        webhook_origin: z.string().max(500).nullable().optional(),
        rotate_webhook_secret: z.boolean().optional(),
        register_webhook: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      return await updateBotConfig(projectId, parsed.data);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/subscribers`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as {
        can_dm?: string;
        q?: string;
        language?: string;
        limit?: string;
        offset?: string;
      };
      const [stats, list] = await Promise.all([
        subscriberStats(projectId),
        listSubscribers(projectId, {
          canDm:
            q.can_dm === "1" || q.can_dm === "true"
              ? true
              : q.can_dm === "0"
                ? false
                : undefined,
          q: q.q,
          language: q.language,
          limit: q.limit ? Number(q.limit) : undefined,
          offset: q.offset ? Number(q.offset) : undefined,
        }),
      ]);
      return { stats, ...list };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/auto-replies`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return await listAutoReplyRules(projectId);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(`${prefix}/auto-replies`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        keyword: z.string().min(1).max(100),
        match_mode: z.enum(["contains", "exact", "starts_with"]).optional(),
        reply_text: z.string().min(1).max(4000),
        enabled: z.boolean().optional(),
        priority: z.number().int().min(0).max(9999).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const bot = await getOrCreateBotRow(projectId);
      const row = await createAutoReplyRule(projectId, bot.id, {
        keyword: parsed.data.keyword,
        matchMode: parsed.data.match_mode,
        replyText: parsed.data.reply_text,
        enabled: parsed.data.enabled,
        priority: parsed.data.priority,
      });
      return reply.code(201).send(row);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.patch(`${prefix}/auto-replies/:id`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        keyword: z.string().min(1).max(100).optional(),
        match_mode: z.enum(["contains", "exact", "starts_with"]).optional(),
        reply_text: z.string().min(1).max(4000).optional(),
        enabled: z.boolean().optional(),
        priority: z.number().int().min(0).max(9999).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      return await updateAutoReplyRule(projectId, id, {
        keyword: parsed.data.keyword,
        matchMode: parsed.data.match_mode,
        replyText: parsed.data.reply_text,
        enabled: parsed.data.enabled,
        priority: parsed.data.priority,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.delete(`${prefix}/auto-replies/:id`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      return await deleteAutoReplyRule(projectId, id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /** Manual quick-reply templates (shared with support desk). */
  app.get(
    `${prefix}/quick-replies`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { items } = await getTelegramQuickReplies(projectId);
        return { items };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  app.put(
    `${prefix}/quick-replies`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      const itemInput = z.object({
        id: z.string().min(1).max(64).optional(),
        title: z.string().trim().min(1).max(80),
        text: z.string().trim().max(4000).optional().default(""),
        media_url: z
          .union([z.string().trim().max(2000), z.null()])
          .optional()
          .nullable(),
        lang: z.string().trim().min(2).max(16).optional(),
        sort: z.number().int().min(0).max(1_000_000).optional(),
        enabled: z.boolean().optional(),
      });
      const parsed = z
        .object({ items: z.array(itemInput).max(100) })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation.failed",
          details: parsed.error.flatten(),
        });
      }
      try {
        const projectId = await resolveAdminProjectId(req);
        const items = parsed.data.items.map((it) =>
          telegramQuickReplyItemSchema.parse({
            id: it.id?.trim() || randomUUID(),
            title: it.title,
            text: it.text ?? "",
            media_url: it.media_url ?? null,
            lang: it.lang ?? "zh",
            sort: it.sort ?? 100,
            enabled: it.enabled ?? true,
          }),
        );
        const saved = await upsertTelegramQuickReplies(projectId, items);
        return saved;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  /** Preview audience size before enqueue. */
  app.get(`${prefix}/broadcasts/audience`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { only_can_dm?: string };
      const onlyCanDm = q.only_can_dm !== "0" && q.only_can_dm !== "false";
      const count = await countBroadcastAudience(projectId, onlyCanDm);
      return { only_can_dm: onlyCanDm, count };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/broadcasts`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { limit?: string; offset?: string; status?: string };
      const status = q.status as
        | "queued"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
        | "failed"
        | "recalling"
        | "recalled"
        | undefined;
      return await listBroadcastJobs(projectId, {
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
        status,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(`${prefix}/broadcasts`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        text: z.string().min(1).max(4000),
        only_can_dm: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const job = await createBroadcastJob({
        projectId,
        text: parsed.data.text,
        onlyCanDm: parsed.data.only_can_dm,
        createdBy: req.admin?.username ?? null,
      });
      return reply.code(201).send(job);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/broadcasts/:id`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      return await getBroadcastJob(projectId, id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(
    `${prefix}/broadcasts/:id/pause`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        return await pauseBroadcastJob(projectId, id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  app.post(
    `${prefix}/broadcasts/:id/resume`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        return await resumeBroadcastJob(projectId, id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  app.post(
    `${prefix}/broadcasts/:id/cancel`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        return await cancelBroadcastJob(projectId, id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  /** Delete already-sent messages via Telegram deleteMessage (async batches). */
  app.post(
    `${prefix}/broadcasts/:id/recall`,
    { preHandler: [app.requireAdmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        return await startBroadcastRecall(projectId, id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  /** @deprecated Prefer POST /broadcasts (async job). Kept for compatibility. */
  app.post(`${prefix}/broadcast`, { preHandler: [app.requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        text: z.string().min(1).max(4000),
        only_can_dm: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      const job = await createBroadcastJob({
        projectId,
        text: parsed.data.text,
        onlyCanDm: parsed.data.only_can_dm,
        createdBy: req.admin?.username ?? null,
      });
      return reply.code(201).send({ job, async: true });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
