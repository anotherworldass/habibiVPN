import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifyAdminToken, type AdminJwtPayload } from "../lib/admin-jwt.js";
import { findActiveReleaseUploadKey } from "../services/release-upload-key.js";

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminJwtPayload;
    releaseUploadKey?: {
      id: string;
      projectId: string;
    };
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

async function requireAdminOrReleaseUploadKey(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "auth.required" });
  }
  const token = header.slice(7).trim();
  try {
    req.admin = await verifyAdminToken(token);
    return;
  } catch {
    // A dedicated upload key is the only non-admin credential accepted here.
  }

  const { projectId, packageId } = req.params as {
    projectId?: string;
    packageId?: string;
  };
  if (!projectId || !packageId) {
    return reply.code(401).send({ error: "auth.invalid_token" });
  }
  const key = await findActiveReleaseUploadKey({
    projectId,
    packageId,
    plaintext: token,
  });
  if (!key) {
    return reply.code(401).send({ error: "auth.invalid_token" });
  }
  req.releaseUploadKey = { id: key.id, projectId: key.projectId };
}

const adminAuthPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest("admin", undefined);
  app.decorateRequest("releaseUploadKey", undefined);
  app.decorate("requireAdmin", requireAdmin);
  app.decorate("requireAdminOrReleaseUploadKey", requireAdminOrReleaseUploadKey);
};

declare module "fastify" {
  interface FastifyInstance {
    requireAdmin: typeof requireAdmin;
    requireAdminOrReleaseUploadKey: typeof requireAdminOrReleaseUploadKey;
  }
}

export default fp(adminAuthPlugin, { name: "admin-auth" });
