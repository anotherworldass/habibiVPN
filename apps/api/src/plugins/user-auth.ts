import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyUserToken, type UserJwtPayload } from "../lib/user-jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: UserJwtPayload;
  }
  interface FastifyInstance {
    requireUser: typeof requireUser;
  }
}

async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "auth.required" });
  }
  try {
    req.user = await verifyUserToken(header.slice(7));
  } catch {
    return reply.code(401).send({ error: "auth.invalid_token" });
  }
}

const userAuthPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("user", undefined);
  app.decorate("requireUser", requireUser);
};

export default fp(userAuthPlugin, { name: "user-auth" });
