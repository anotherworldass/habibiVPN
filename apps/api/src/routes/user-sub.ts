import type { FastifyPluginAsync } from "fastify";
import { USER_API_PREFIX } from "@habibi/shared";
import {
  convertSubscriptionByToken,
  normalizeSubFormat,
} from "../services/subscription-convert/index.js";

/**
 * Public subscription convert endpoints (no auth).
 * Clients fetch these URLs directly; token is HMAC-bound to UserUpstream.id.
 *
 * GET /api/v1/sub/:token
 * GET /api/v1/sub/:token/:format
 * GET /api/v1/sub/:token/:format/:title  (title ignored; old links still work)
 *   format: clash | mihomo | clash_meta | hiddify | v2ray | xray | base64 | shadowrocket | surge | quantumult_x
 */
export const userSubRoutes: FastifyPluginAsync = async (app) => {
  app.get(`${USER_API_PREFIX}/sub/:token`, async (req, reply) => {
    const { token } = req.params as { token: string };
    const q = req.query as { format?: string };
    return serveSub(req.headers["user-agent"], token, q.format, reply);
  });

  app.get(`${USER_API_PREFIX}/sub/:token/:format`, async (req, reply) => {
    const { token, format } = req.params as { token: string; format: string };
    return serveSub(req.headers["user-agent"], token, format, reply);
  });

  app.get(`${USER_API_PREFIX}/sub/:token/:format/:title`, async (req, reply) => {
    const { token, format } = req.params as {
      token: string;
      format: string;
      title: string;
    };
    return serveSub(req.headers["user-agent"], token, format, reply);
  });

  /** Discover supported format aliases (helper for clients / admin). */
  app.get(`${USER_API_PREFIX}/sub-formats`, async () => {
    return {
      formats: [
        { id: "clash", aliases: ["mihomo", "clash_meta"], kind: "yaml" },
        { id: "hiddify", aliases: ["hiddify-next", "hiddifynext"], kind: "yaml" },
        { id: "v2ray", aliases: ["xray", "base64"], kind: "base64" },
        { id: "shadowrocket", aliases: ["sr"], kind: "base64" },
        { id: "surge", aliases: [], kind: "conf" },
        { id: "quantumult_x", aliases: ["qx", "quantumultx"], kind: "list" },
      ],
      default: normalizeSubFormat(null),
    };
  });
};

async function serveSub(
  userAgent: string | undefined,
  token: string,
  format: string | undefined,
  reply: {
    header: (k: string, v: string) => unknown;
    type: (t: string) => unknown;
    send: (b: unknown) => unknown;
    code: (n: number) => { send: (b: unknown) => unknown };
  },
) {
  try {
    const result = await convertSubscriptionByToken({
      token: decodeURIComponent(token),
      formatRaw: format,
      userAgent,
    });
    for (const [k, v] of Object.entries(result.headers)) {
      reply.header(k, v);
    }

    reply.header("cache-control", "no-store");
    reply.type(result.contentType);
    return reply.send(result.body);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode || 500;
    const message = err instanceof Error ? err.message : "sub.failed";
    if (status === 429) {
      reply.header("retry-after", "60");
    }
    return reply.code(status).send({ error: message });
  }
}
