import type { FastifyPluginAsync } from "fastify";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { getOpsStats } from "../services/ops-stats.js";

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const adminOpsRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/ops`;
  app.addHook("preHandler", app.requireAdmin);

  /** Operational overview: registrations, clients, revenue, plan purchases. */
  app.get(`${prefix}/stats`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as { from?: string; to?: string };
      return await getOpsStats(projectId, {
        from: q.from,
        to: q.to,
      });
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
