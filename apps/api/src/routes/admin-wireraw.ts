import type { FastifyPluginAsync } from "fastify";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { WireRawError, wireraw } from "../wireraw/client.js";
import { env } from "../config.js";

/**
 * Admin proxy to WireRaw. Protected by admin JWT.
 * Static path segments must be registered before :id params.
 */
export const adminWirerawRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/wireraw`;

  app.addHook("preHandler", app.requireAdmin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof WireRawError) {
      // Upstream SDK-key 401 is not an admin session failure — do not forward 401.
      const status =
        err.status === 401
          ? 502
          : err.status >= 400 && err.status < 600
            ? err.status
            : 502;
      return reply.code(status).send({
        error: err.status === 401 ? "wireraw.unauthorized" : err.code,
        request_id: err.requestId,
        upstream: err.body,
      });
    }
    throw err;
  });

  app.get(`${prefix}/customer-plans`, async () => wireraw.listCustomerPlans());

  app.get(`${prefix}/customers`, async (req) => {
    const q = req.query as {
      limit?: string;
      offset?: string;
      q?: string;
      status?: string;
    };
    return wireraw.listCustomers({
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
      q: q.q,
      status: q.status,
    });
  });

  app.get(`${prefix}/customers/by-username`, async (req, reply) => {
    const { username } = req.query as { username?: string };
    if (!username) {
      return reply.code(400).send({ error: "username.required" });
    }
    return wireraw.getCustomerByUsername(username);
  });

  app.get(`${prefix}/customers/online`, async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return wireraw.listOnlineUsernames({
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.post(`${prefix}/customers/bulk-status`, async (req) => {
    return wireraw.bulkStatus(
      req.body as {
        usernames?: string[];
        ids?: string[];
        status: "active" | "disabled";
      },
    );
  });

  app.post(`${prefix}/customers/bulk-extend`, async (req) => {
    return wireraw.bulkExtend(
      req.body as {
        usernames?: string[];
        ids?: string[];
        validity_seconds?: number;
        additional_bytes?: number;
      },
    );
  });

  app.post(`${prefix}/customers/bulk-revoke`, async (req) => {
    return wireraw.bulkRevoke(req.body as { usernames?: string[]; ids?: string[] });
  });

  app.post(`${prefix}/customers/batch-lookup`, async (req) => {
    return wireraw.batchLookup(req.body as { usernames?: string[]; ids?: string[] });
  });

  app.post(`${prefix}/customers`, async (req) => {
    return wireraw.upsertCustomer(req.body as Record<string, unknown>);
  });

  app.get(`${prefix}/customers/:id`, async (req) => {
    const { id } = req.params as { id: string };
    return wireraw.getCustomer(id);
  });

  app.post(`${prefix}/customers/:id/extend`, async (req) => {
    const { id } = req.params as { id: string };
    return wireraw.extendSubscription(
      id,
      req.body as {
        expires_at?: string;
        validity_seconds?: number;
        additional_bytes?: number;
        note?: string;
      },
    );
  });

  app.post(`${prefix}/customers/:id/revoke`, async (req) => {
    const { id } = req.params as { id: string };
    return wireraw.revokeSubscription(id);
  });

  app.post(`${prefix}/customers/:id/renew`, async (req) => {
    const { id } = req.params as { id: string };
    return wireraw.renewCustomer(id);
  });

  app.post(`${prefix}/subscriptions/refresh`, async (req, reply) => {
    const { user_id } = req.body as { user_id?: string };
    if (!user_id) {
      return reply.code(400).send({ error: "user_id.required" });
    }
    return wireraw.refreshSubscription(user_id);
  });

  app.get(`${prefix}/nodes`, async () => wireraw.listNodes());

  app.get(`${prefix}/nodes/links`, async (req) => {
    const { region } = req.query as { region?: string };
    return wireraw.listNodeLinks(region);
  });

  app.post(`${prefix}/dial`, async (req) => {
    return wireraw.dial(
      req.body as {
        region?: string;
        mode?: string;
        sticky?: boolean;
        username?: string;
        limit?: number;
      },
    );
  });

  app.get(`${prefix}/traffic/summary`, async (req) => {
    const q = req.query as {
      since?: string;
      until?: string;
      customer_id?: string;
      granularity?: "day" | "month";
    };
    return wireraw.trafficSummary(q);
  });

  app.get(`${prefix}/bandwidth-plans`, async () => wireraw.listBandwidthPlans());

  app.post(`${prefix}/bandwidth-plans`, async (req) => {
    return wireraw.upsertBandwidthPlan(req.body as Record<string, unknown>);
  });

  app.delete(`${prefix}/bandwidth-plans/:id`, async (req) => {
    const { id } = req.params as { id: string };
    return wireraw.deleteBandwidthPlan(id);
  });

  app.get(`${prefix}/merchant`, async (req, reply) => {
    const id = (req.query as { id?: string }).id || env.WIRERAW_MERCHANT_ID;
    if (!id) {
      return reply.code(400).send({
        error: "merchant_id.required",
        message: "Set WIRERAW_MERCHANT_ID in .env or pass ?id=",
      });
    }
    return wireraw.getMerchant(id);
  });

  app.get(`${prefix}/sdk-keys`, async (_req, reply) => {
    try {
      return await wireraw.listSdkKeys();
    } catch (err) {
      if (err instanceof WireRawError && err.status === 401) {
        return reply.code(200).send({
          keys: [],
          unsupported: true,
          message: "SDK Key 列表需平台后台权限，当前 Key 不可用",
        });
      }
      throw err;
    }
  });
};
