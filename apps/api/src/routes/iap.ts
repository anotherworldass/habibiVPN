import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { handleAppleNotification } from "../services/iap/apple-asn.js";
import {
  verifyAndFulfillAppleIap,
  verifyAndFulfillGoogleIap,
} from "../services/iap/fulfill.js";

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const iapRoutes: FastifyPluginAsync = async (app) => {
  app.post(`${USER_API_PREFIX}/iap/apple/verify`, {
    preHandler: app.requireUser,
    handler: async (req, reply) => {
      const parsed = z
        .object({
          signed_transaction: z.string().min(1),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      try {
        const result = await verifyAndFulfillAppleIap({
          userId: req.user!.sub,
          signedTransaction: parsed.data.signed_transaction,
        });
        return { order: result.order, created: result.created };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  });

  /** App Store Server Notifications V2 (no user auth). */
  app.post(`${USER_API_PREFIX}/iap/apple/notifications`, async (req, reply) => {
    try {
      const result = await handleAppleNotification(req.body);
      return result;
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(`${USER_API_PREFIX}/iap/google/verify`, {
    preHandler: app.requireUser,
    handler: async (req, reply) => {
      const parsed = z
        .object({
          product_id: z.string().min(1),
          purchase_token: z.string().min(1),
          package_name: z.string().min(1).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      try {
        const result = await verifyAndFulfillGoogleIap({
          userId: req.user!.sub,
          productId: parsed.data.product_id,
          purchaseToken: parsed.data.purchase_token,
          packageName: parsed.data.package_name,
        });
        return { order: result.order, created: result.created };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  });
};
