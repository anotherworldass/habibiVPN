import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { verifyUserToken } from "../lib/user-jwt.js";
import { DEFAULT_PROJECT_ID } from "../services/project.js";
import {
  appendSupportMessage,
  ensureWebConversation,
  listWebGuestMessages,
  messageView,
  userRecallSupportMessage,
} from "../services/support/conversations.js";
import {
  findGuestByToken,
  guestSetCookieHeader,
  parseGuestTokenFromRequest,
  upsertWebGuest,
} from "../services/support/guest.js";
import { extractSupportClientMeta } from "../services/support/meta.js";
import { assertSupportTextSafe } from "../services/support/content-safety.js";
import { assertSupportSendAllowed } from "../services/support/rate-limit.js";
import {
  assertOwnSupportMediaUrl,
  parseImageDataUrlOrBase64,
  readSupportImage,
  saveSupportImage,
} from "../services/support/upload.js";
import { getSupportClientMessageWindowPolicy } from "../services/system-settings.js";
import type { ClientMetaInput } from "../services/auth-events.js";

const clientMetaSchema = z
  .object({
    timezone: z.string().max(64).nullable().optional(),
    locale: z.string().max(32).nullable().optional(),
    os_name: z.string().max(64).nullable().optional(),
    os_version: z.string().max(64).nullable().optional(),
    app_version: z.string().max(64).nullable().optional(),
    device_id: z.string().max(128).nullable().optional(),
    shell: z.string().max(64).nullable().optional(),
    platform: z.string().max(64).nullable().optional(),
    /** h5 = website widget; app = in-app WebView */
    entry: z.enum(["h5", "app"]).nullable().optional(),
  })
  .optional();

async function optionalUserId(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<string | null> {
  const header = req.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw?.startsWith("Bearer ")) return null;
  try {
    const payload = await verifyUserToken(raw.slice(7));
    return payload.sub;
  } catch {
    return null;
  }
}

function projectIdFromReq(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: unknown;
}): string {
  const q = (req.query || {}) as { project_id?: string };
  const h = req.headers["x-habibi-project-id"];
  const raw = (Array.isArray(h) ? h[0] : h) || q.project_id || DEFAULT_PROJECT_ID;
  return String(raw).trim() || DEFAULT_PROJECT_ID;
}

export const supportWebRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${USER_API_PREFIX}/support/web`;
  const mediaPrefix = `${USER_API_PREFIX}/support/media`;

  /** Public image bytes (unguessable file names). */
  app.get(`${mediaPrefix}/:projectId/:fileName`, async (req, reply) => {
    const { projectId, fileName } = req.params as {
      projectId: string;
      fileName: string;
    };
    const file = await readSupportImage(projectId, fileName);
    if (!file) {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.type(file.mime).send(file.buffer);
  });

  app.post(`${prefix}/session`, async (req, reply) => {
    try {
      const body = z
        .object({ client_meta: clientMetaSchema })
        .safeParse(req.body ?? {});
      const projectId = projectIdFromReq(req);
      const userId = await optionalUserId(req);
      const meta = extractSupportClientMeta(
        req,
        (body.success ? body.data.client_meta : null) as ClientMetaInput | null,
      );
      const tokenIn = parseGuestTokenFromRequest(req.headers);
      const { guest, token, created } = await upsertWebGuest({
        projectId,
        token: tokenIn,
        userId,
        meta,
      });
      const conv = await ensureWebConversation({
        projectId,
        guestId: guest.id,
        userId: guest.userId,
        languageCode: meta.locale,
        displayName: userId ? null : `访客 ${guest.id.slice(-6)}`,
      });

      reply.header("set-cookie", guestSetCookieHeader(token));
      return {
        guest_token: token,
        created,
        conversation_id: conv.id,
        guest_id: guest.id,
        user_id: guest.userId,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${prefix}/messages`, async (req, reply) => {
    try {
      const projectId = projectIdFromReq(req);
      const q = req.query as { after?: string };
      const tokenIn = parseGuestTokenFromRequest(req.headers);
      const userId = await optionalUserId(req);
      const after = q.after?.trim() || undefined;
      // Server-enforced latest-N from 系统设置（忽略客户端 limit）.
      const { messageWindowSize: limit } =
        await getSupportClientMessageWindowPolicy(projectId);

      // Fast path for polling: existing guest → read-only queries only
      const existing = await findGuestByToken(projectId, tokenIn);
      if (existing) {
        if (userId && existing.userId !== userId) {
          await upsertWebGuest({
            projectId,
            token: tokenIn,
            userId,
            meta: extractSupportClientMeta(req, null),
          });
        }
        let thread = await listWebGuestMessages(projectId, existing.id, {
          after,
          limit,
        });
        if (!thread) {
          await ensureWebConversation({
            projectId,
            guestId: existing.id,
            userId: userId || existing.userId,
          });
          thread = await listWebGuestMessages(projectId, existing.id, {
            after,
            limit,
          });
        }
        return {
          guest_token: tokenIn,
          conversation_id: thread?.conversation_id ?? null,
          message_window_size: limit,
          items: thread?.items ?? [],
        };
      }

      const meta = extractSupportClientMeta(req, null);
      const { guest, token } = await upsertWebGuest({
        projectId,
        token: tokenIn,
        userId,
        meta,
      });
      await ensureWebConversation({
        projectId,
        guestId: guest.id,
        userId: guest.userId,
      });
      const thread = await listWebGuestMessages(projectId, guest.id, {
        after,
        limit,
      });
      reply.header("set-cookie", guestSetCookieHeader(token));
      return {
        guest_token: token,
        conversation_id: thread?.conversation_id ?? null,
        message_window_size: limit,
        items: thread?.items ?? [],
      };
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
          client_meta: clientMetaSchema,
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation.failed",
          details: parsed.error.flatten(),
        });
      }
      try {
        const projectId = projectIdFromReq(req);
        const userId = await optionalUserId(req);
        const meta = extractSupportClientMeta(
          req,
          parsed.data.client_meta as ClientMetaInput | null,
        );
        const tokenIn = parseGuestTokenFromRequest(req.headers);
        const { guest, token } = await upsertWebGuest({
          projectId,
          token: tokenIn,
          userId,
          meta,
        });
        await assertSupportSendAllowed({
          projectId,
          guestId: guest.id,
          ip: meta.ip,
        });
        const { buffer, mime } = parseImageDataUrlOrBase64({
          data: parsed.data.image,
          mime: parsed.data.mime,
        });
        const saved = await saveSupportImage({ projectId, buffer, mime });
        reply.header("set-cookie", guestSetCookieHeader(token));
        return {
          guest_token: token,
          media_url: saved.mediaUrl,
          mime: saved.mime,
        };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );

  app.post(`${prefix}/messages`, async (req, reply) => {
    const parsed = z
      .object({
        text: z.string().trim().max(4000).optional(),
        media_url: z.string().url().optional(),
        content_type: z.enum(["text", "image"]).optional(),
        client_meta: clientMetaSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = projectIdFromReq(req);
      const text = (parsed.data.text || "").trim();
      const mediaUrl = parsed.data.media_url
        ? await assertOwnSupportMediaUrl(projectId, parsed.data.media_url)
        : null;
      if (!text && !mediaUrl) {
        return reply.code(400).send({ error: "support.empty_message" });
      }
      assertSupportTextSafe(text || null);
      const userId = await optionalUserId(req);
      const meta = extractSupportClientMeta(
        req,
        parsed.data.client_meta as ClientMetaInput | null,
      );
      const tokenIn = parseGuestTokenFromRequest(req.headers);
      const { guest, token } = await upsertWebGuest({
        projectId,
        token: tokenIn,
        userId,
        meta,
      });
      await assertSupportSendAllowed({
        projectId,
        guestId: guest.id,
        ip: meta.ip,
      });
      const conv = await ensureWebConversation({
        projectId,
        guestId: guest.id,
        userId: guest.userId,
        languageCode: meta.locale,
      });
      const msg = await appendSupportMessage({
        conversationId: conv.id,
        projectId,
        direction: "inbound",
        source: "user",
        text: text || null,
        contentType: mediaUrl ? "image" : parsed.data.content_type || "text",
        mediaUrl,
        clientMeta: meta,
        bumpUnread: true,
      });
      reply.header("set-cookie", guestSetCookieHeader(token));
      return reply.code(201).send({
        guest_token: token,
        conversation_id: conv.id,
        message: messageView(
          { ...msg, conversation: { channel: "web" } },
          { viewer: "user" },
        ),
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.post(`${prefix}/messages/:messageId/recall`, async (req, reply) => {
    try {
      const projectId = projectIdFromReq(req);
      const { messageId } = req.params as { messageId: string };
      const tokenIn = parseGuestTokenFromRequest(req.headers);
      const guest = await findGuestByToken(projectId, tokenIn);
      if (!guest || !tokenIn) {
        return reply.code(401).send({ error: "support.guest_required" });
      }
      const msg = await userRecallSupportMessage({
        projectId,
        guestId: guest.id,
        messageId,
      });
      return msg;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
