import type { FastifyPluginAsync } from "fastify";
import { USER_API_PREFIX } from "@habibi/shared";
import { getPublicProbeStatus } from "../services/node-probe/status.js";

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const userStatusRoutes: FastifyPluginAsync = async (app) => {
  app.get(`${USER_API_PREFIX}/status`, async (_req, reply) => {
    try {
      return await getPublicProbeStatus();
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
