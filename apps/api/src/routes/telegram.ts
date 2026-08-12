import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { bindTelegramFromInitData } from "../services/telegram/bind.js";
import { getBotPublicView } from "../services/telegram/bot-config.js";
import { handleTelegramWebhook } from "../services/telegram/webhook.js";
import { resolveSource, sourceHintsFromRequest } from "../services/project.js";

export const telegramRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${USER_API_PREFIX}/telegram`;

  /**
   * Mini App public config (no auth): channel join guide URL, bot username.
   * GET /api/v1/telegram/config
   */
  app.get(`${prefix}/config`, async (req, reply) => {
    try {
      const source = await resolveSource(sourceHintsFromRequest(req));
      const bot = await getBotPublicView(source.projectId);
      return {
        project_id: source.projectId,
        enabled: bot.enabled,
        bot_username: bot.bot_username,
        channel_url: bot.channel_url,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /**
   * BotFather webhook. No auth — secured by path webhookSecret.
   * POST /api/v1/telegram/webhook/:projectCode/:webhookSecret
   */
  app.post(`${prefix}/webhook/:projectCode/:webhookSecret`, async (req, reply) => {
    const params = req.params as { projectCode: string; webhookSecret: string };
      try {
      const result = await handleTelegramWebhook({
        projectCode: params.projectCode,
        webhookSecret: params.webhookSecret,
        update: (req.body || {}) as Parameters<
          typeof handleTelegramWebhook
        >[0]["update"],
      });
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /**
   * Mini App: bind Telegram identity to current session + optional write access.
   * Body: { init_data, write_access? }
   */
  app.post(`${prefix}/bind`, { preHandler: [app.requireUser] }, async (req, reply) => {
    const parsed = z
      .object({
        init_data: z.string().min(10).max(8192),
        write_access: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const hints = sourceHintsFromRequest(req);
      // Prefer user's project; hints only matter for future multi-bot edge cases
      void hints;
      return await bindTelegramFromInitData({
        userId: req.user!.sub,
        initData: parsed.data.init_data,
        writeAccess: parsed.data.write_access,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
