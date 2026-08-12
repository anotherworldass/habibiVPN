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
 * GET /api/v1/sub/:token/:format/:title  (title ignored; for Shadowrocket URL-name fallback)
 *   format: clash | mihomo | clash_meta | v2ray | xray | base64 | shadowrocket | surge | quantumult_x
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
    raw: { setHeader: (k: string, v: string | number | readonly string[]) => void };
  },
) {
  try {
    const result = await convertSubscriptionByToken({
      token: decodeURIComponent(token),
      formatRaw: format,
      userAgent,
    });
    for (const [k, v] of Object.entries(result.headers)) {
      // Profile-Title handled below (Shadowrocket prefers raw UTF-8 bytes).
      if (k === "profile-title") continue;
      reply.header(k, v);
    }

    // Shadowrocket reads Profile-Title first. Many SR builds expect raw UTF-8
    // header bytes (not `base64:`). Node rejects unicode in setHeader, so we
    // smuggle UTF-8 bytes as a latin1 string on the raw response.
    const rawTitle = utf8HeaderValue(result.profileName);
    reply.raw.setHeader("Profile-Title", rawTitle);
    // Keep Clash Meta compatible form as well.
    reply.raw.setHeader(
      "Profile-Title-Base64",
      result.headers["profile-title"] ||
        `base64:${Buffer.from(result.profileName, "utf8").toString("base64")}`,
    );

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

/** Encode UTF-8 so Node's header validator accepts it; wire bytes stay UTF-8. */
function utf8HeaderValue(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}
