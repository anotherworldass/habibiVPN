import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { parseClientChannel } from "../services/catalog.js";
import { validateAndPriceCoupon } from "../services/growth/coupons.js";

export const userCouponRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    `${USER_API_PREFIX}/coupons/preview`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      const parsed = z
        .object({
          coupon_code: z.string().min(1),
          plan_id: z.string().min(1),
          client: z.string().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      try {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: req.user!.sub },
        });
        const plan = await prisma.plan.findUnique({
          where: { id: parsed.data.plan_id },
        });
        if (!plan || !plan.enabled || plan.projectId !== user.projectId) {
          return reply.code(404).send({ error: "plan.not_found" });
        }
        const client = parseClientChannel(
          parsed.data.client ||
            (req.headers["x-habibi-client"] as string | undefined) ||
            user.sourceClient ||
            "h5",
        );
        const priced = await validateAndPriceCoupon({
          projectId: user.projectId,
          userId: user.id,
          couponCode: parsed.data.coupon_code,
          planId: plan.id,
          listPriceCents: plan.priceCents,
          client,
        });
        return {
          coupon_code: priced.coupon.code,
          coupon_name: priced.coupon.name,
          list_price_cents: priced.listPriceCents,
          discount_cents: priced.discountCents,
          amount_cents: priced.amountCents,
          currency: plan.currency,
        };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    },
  );
};
