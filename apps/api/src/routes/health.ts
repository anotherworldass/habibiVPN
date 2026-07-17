import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    service: "habibi-api",
    env: env.NODE_ENV,
  }));

  app.get("/health/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: true };
    } catch (err) {
      reply.code(503);
      return {
        ok: false,
        db: false,
        error: err instanceof Error ? err.message : "db_unavailable",
      };
    }
  });
};
