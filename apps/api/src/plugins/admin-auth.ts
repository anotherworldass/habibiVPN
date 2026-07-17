import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyAdminToken, type AdminJwtPayload } from "../lib/admin-jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminJwtPayload;
  }
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "auth.required" });
  }
  try {
    req.admin = await verifyAdminToken(header.slice(7));
  } catch {
    return reply.code(401).send({ error: "auth.invalid_token" });
  }
}

const adminAuthPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("admin", undefined);
  app.decorate("requireAdmin", requireAdmin);
};

declare module "fastify" {
  interface FastifyInstance {
    requireAdmin: typeof requireAdmin;
  }
}

export default fp(adminAuthPlugin, { name: "admin-auth" });
