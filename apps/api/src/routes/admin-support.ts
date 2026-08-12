import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import {
  adminRecallSupportMessage,
  adminReplySupport,
  getSupportThread,
  listSupportConversations,
} from "../services/support/conversations.js";
import { getTelegramQuickReplies } from "../services/system-settings.js";
import {
  parseImageDataUrlOrBase64,
  saveSupportImage,
} from "../services/support/upload.js";

export const adminSupportRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/support`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/conversations`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as {
        channel?: string;
        unread?: string;
        q?: string;
        limit?: string;
        offset?: string;
      };
      // channel: all | web | app | telegram
      // app = web conversations from in-app WebView (guest.client_source=app)
      let channel: "web" | "telegram" | undefined;
      let clientSource: "h5" | "app" | undefined;
      if (q.channel === "telegram") {
        channel = "telegram";
      } else if (q.channel === "app") {
        clientSource = "app";
      } else if (q.channel === "web") {
        clientSource = "h5";
      }
      return await listSupportConversations(projectId, {
        channel,
        clientSource,
        unreadOnly: q.unread === "1" || q.unread === "true",
        q: q.q,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/conversations/:id`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const q = req.query as { limit?: string; after?: string };
      return await getSupportThread(projectId, id, {
        limit: q.limit ? Number(q.limit) : undefined,
        after: q.after,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(
    `${prefix}/upload`,
    { bodyLimit: 6 * 1024 * 1024 },
    async (req, reply) => {
      const parsed = z
        .object({
          image: z.string().min(1),
          mime: z.string().max(64).optional(),
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
        const { buffer, mime } = parseImageDataUrlOrBase64({
          data: parsed.data.image,
          mime: parsed.data.mime,
        });
        const saved = await saveSupportImage({ projectId, buffer, mime });
        return { media_url: saved.mediaUrl, mime: saved.mime };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  app.post(`${prefix}/conversations/:id/reply`, async (req, reply) => {
    const parsed = z
      .object({
        text: z.string().max(4000).optional(),
        media_url: z.string().url().optional(),
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
      const msg = await adminReplySupport({
        projectId,
        conversationId: id,
        text: parsed.data.text,
        mediaUrl: parsed.data.media_url,
        adminUsername: req.admin?.username ?? null,
      });
      return reply.code(201).send(msg);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(
    `${prefix}/conversations/:id/messages/:messageId/recall`,
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id, messageId } = req.params as {
          id: string;
          messageId: string;
        };
        return await adminRecallSupportMessage({
          projectId,
          conversationId: id,
          messageId,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  /** Reuse telegram quick replies store for support desk (shared). */
  app.get(`${prefix}/quick-replies`, async (req, reply) => {
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
  });
};
