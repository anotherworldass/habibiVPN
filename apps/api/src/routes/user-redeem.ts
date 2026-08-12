import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { parseClientChannel } from "../services/catalog.js";
import { redeemCode } from "../services/growth/redeem.js";
import { WireRawError } from "../wireraw/client.js";

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (err instanceof WireRawError) {
    return reply.code(err.status).send({ error: err.code, upstream: err.body });
  }
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  client: z.string().optional(),
});

export const userRedeemRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    `${USER_API_PREFIX}/redeem`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      try {
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation.failed" });
        }
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: req.user!.sub },
        });
        const client = parseClientChannel(
          parsed.data.client ||
            (req.headers["x-habibi-client"] as string | undefined) ||
            user.sourceClient ||
            "h5",
        );
        const result = await redeemCode({
          userId: user.id,
          projectId: user.projectId,
          code: parsed.data.code,
          client,
        });
        return result;
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );
};
