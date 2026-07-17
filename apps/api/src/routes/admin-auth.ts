import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { signAdminToken } from "../lib/admin-jwt.js";

const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const adminAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post(`${ADMIN_API_PREFIX}/auth/login`, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { username: parsed.data.username },
    });
    if (!admin || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
      return reply.code(401).send({ error: "auth.invalid_credentials" });
    }

    const token = await signAdminToken({
      sub: admin.id,
      username: admin.username,
      role: admin.role,
    });

    return {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
    };
  });

  app.get(
    `${ADMIN_API_PREFIX}/auth/me`,
    { preHandler: [app.requireAdmin] },
    async (req) => ({
      admin: {
        id: req.admin!.sub,
        username: req.admin!.username,
        role: req.admin!.role,
      },
    }),
  );
};
