import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { writeAudit } from "../lib/audit.js";
import { redisIncrWithTtl } from "../lib/redis.js";
import {
  createLlmProfile,
  deleteLlmProfile,
  getActiveLlmProfile,
  getLlmProfileWithApiKey,
  listLlmProfilesPublic,
  llmProfileInputSchema,
  setDefaultLlmProfile,
  updateLlmProfile,
} from "../services/llm/profiles.js";
import {
  testLlmProfile,
  translateCopyInputSchema,
  translateCopyWithProfile,
} from "../services/llm/translate.js";

const profilePatchSchema = llmProfileInputSchema.partial();

async function requireSuperadmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.admin?.role !== "superadmin") {
    return reply.code(403).send({ error: "auth.superadmin_required" });
  }
}

async function assertTranslateAllowed(projectId: string) {
  try {
    const count = await redisIncrWithTtl(`llm:translate:${projectId}`, 60);
    if (count > 30) {
      throw Object.assign(new Error("llm.rate_limited"), { statusCode: 429 });
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) throw error;
    // Redis unavailable: do not block the admin workflow.
  }
}

function sendError(reply: FastifyReply, error: unknown) {
  const typed = error as {
    statusCode?: number;
    upstreamStatus?: number;
    publicMessage?: string;
  };
  const status = typed.statusCode || 500;
  return reply.code(status).send({
    error: error instanceof Error ? error.message : "internal_error",
    ...(typed.publicMessage ? { message: typed.publicMessage } : {}),
    ...(typed.upstreamStatus
      ? { upstream_status: typed.upstreamStatus }
      : {}),
  });
}

export const adminLlmRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/llm`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/profiles`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      return { project_id: projectId, ...(await listLlmProfilesPublic(projectId)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get(
    `${prefix}/profiles/:id`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        return { profile: await getLlmProfileWithApiKey(projectId, id) };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    `${prefix}/profiles`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const parsed = llmProfileInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation.failed",
          details: parsed.error.flatten(),
        });
      }
      try {
        const projectId = await resolveAdminProjectId(req);
        const profile = await createLlmProfile(projectId, parsed.data);
        await writeAudit({
          actorType: "admin",
          actorId: req.admin?.sub,
          action: "settings.llm.profile_create",
          targetType: "llm_profile",
          targetId: profile.id,
          meta: { project_id: projectId, model: profile.model },
          ip: req.ip,
        });
        return reply.code(201).send({ profile });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    `${prefix}/profiles/:id`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      const parsed = profilePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "validation.failed",
          details: parsed.error.flatten(),
        });
      }
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        const profile = await updateLlmProfile(projectId, id, parsed.data);
        await writeAudit({
          actorType: "admin",
          actorId: req.admin?.sub,
          action: "settings.llm.profile_update",
          targetType: "llm_profile",
          targetId: id,
          meta: { project_id: projectId, model: profile.model },
          ip: req.ip,
        });
        return { profile };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    `${prefix}/profiles/:id`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        await deleteLlmProfile(projectId, id);
        await writeAudit({
          actorType: "admin",
          actorId: req.admin?.sub,
          action: "settings.llm.profile_delete",
          targetType: "llm_profile",
          targetId: id,
          meta: { project_id: projectId },
          ip: req.ip,
        });
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    `${prefix}/profiles/:id/default`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        await setDefaultLlmProfile(projectId, id);
        await writeAudit({
          actorType: "admin",
          actorId: req.admin?.sub,
          action: "settings.llm.default_update",
          targetType: "llm_profile",
          targetId: id,
          meta: { project_id: projectId },
          ip: req.ip,
        });
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    `${prefix}/profiles/:id/test`,
    { preHandler: [requireSuperadmin] },
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        const profile = await getActiveLlmProfile(projectId, id);
        if (!profile) {
          throw Object.assign(new Error("llm.profile_unavailable"), {
            statusCode: 400,
          });
        }
        await testLlmProfile(profile);
        await writeAudit({
          actorType: "admin",
          actorId: req.admin?.sub,
          action: "settings.llm.profile_test",
          targetType: "llm_profile",
          targetId: id,
          meta: { project_id: projectId, success: true },
          ip: req.ip,
        });
        return { ok: true };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(`${ADMIN_API_PREFIX}/translate/copy`, async (req, reply) => {
    const parsed = translateCopyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation.failed",
        details: parsed.error.flatten(),
      });
    }
    try {
      const projectId = await resolveAdminProjectId(req);
      await assertTranslateAllowed(projectId);
      const profile = await getActiveLlmProfile(projectId);
      if (!profile) {
        throw Object.assign(new Error("llm.default_profile_unavailable"), {
          statusCode: 409,
        });
      }
      const translations = await translateCopyWithProfile(profile, parsed.data);
      const charCount = Object.values(parsed.data.fields).reduce(
        (sum, value) => sum + value.length,
        0,
      );
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "llm.translate.copy",
        targetType: "project",
        targetId: projectId,
        meta: {
          profile_id: profile.id,
          context: parsed.data.context || null,
          char_count: charCount,
          target_locales: parsed.data.target_locales,
          success: true,
        },
        ip: req.ip,
      });
      return { translations };
    } catch (error) {
      return sendError(reply, error);
    }
  });
};
