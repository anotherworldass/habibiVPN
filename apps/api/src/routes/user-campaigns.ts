import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { USER_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { parseClientChannel } from "../services/catalog.js";
import {
  listActiveCampaignsForUser,
  listPublicInviteMilestoneCampaigns,
  participateCampaign,
} from "../services/growth/campaigns.js";
import { resolveSource, sourceHintsFromRequest } from "../services/project.js";
import { WireRawError } from "../wireraw/client.js";

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (err instanceof WireRawError) {
    return reply.code(err.status).send({ error: err.code, upstream: err.body });
  }
  const status = (err as { statusCode?: number }).statusCode || 500;
  const reasons = (err as { reasons?: string[] }).reasons;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
    ...(reasons?.length ? { reasons } : {}),
  });
}

async function resolvePackageId(
  req: FastifyRequest,
  user: { sourcePackageId: string | null },
): Promise<string | null> {
  const body = (req.body || {}) as { package_id?: string };
  const q = req.query as { package_id?: string };
  const explicit =
    body.package_id ||
    q.package_id ||
    (req.headers["x-habibi-package-id"] as string | undefined);
  if (explicit?.trim()) return explicit.trim();

  try {
    const source = await resolveSource(sourceHintsFromRequest(req));
    if (source.sourcePackageId) return source.sourcePackageId;
  } catch {
    /* ignore */
  }
  return user.sourcePackageId;
}

function localeFromCampaignReq(req: FastifyRequest): string | null {
  const q = req.query as { locale?: string; lang?: string };
  return (
    q.locale ||
    q.lang ||
    (typeof req.headers["x-habibi-locale"] === "string"
      ? req.headers["x-habibi-locale"]
      : null) ||
    (Array.isArray(req.headers["accept-language"])
      ? req.headers["accept-language"][0]
      : req.headers["accept-language"]) ||
    null
  );
}

function clientFromCampaignReq(
  req: FastifyRequest,
  fallback = "h5",
) {
  const q = req.query as { client?: string };
  const raw =
    q.client ||
    (req.headers["x-habibi-client"] as string | undefined) ||
    fallback;
  try {
    return parseClientChannel(raw);
  } catch {
    return parseClientChannel("h5");
  }
}

export const userCampaignRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${USER_API_PREFIX}/campaigns`;

  app.get(`${prefix}/public`, async (req, reply) => {
    try {
      const source = await resolveSource(sourceHintsFromRequest(req));
      const client = clientFromCampaignReq(req);
      const locale = localeFromCampaignReq(req);
      const campaigns = await listPublicInviteMilestoneCampaigns({
        projectId: source.projectId,
        client,
        packageId: source.sourcePackageId,
        locale,
      });
      return { campaigns, client, locale };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(
    prefix,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      try {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: req.user!.sub },
        });
        const q = req.query as { client?: string; locale?: string; lang?: string };
        const client = parseClientChannel(
          q.client ||
            (req.headers["x-habibi-client"] as string | undefined) ||
            user.sourceClient ||
            "h5",
        );
        const packageId = await resolvePackageId(req, user);
        const locale =
          q.locale ||
          q.lang ||
          (Array.isArray(req.headers["accept-language"])
            ? req.headers["accept-language"][0]
            : req.headers["accept-language"]) ||
          null;
        const campaigns = await listActiveCampaignsForUser({
          projectId: user.projectId,
          userId: user.id,
          client,
          packageId,
          locale,
        });
        return { campaigns, client, package_id: packageId, locale };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  app.post(
    `${prefix}/:id/participate`,
    { preHandler: [app.requireUser] },
    async (req, reply) => {
      try {
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: req.user!.sub },
        });
        const { id } = req.params as { id: string };
        const q = req.query as { client?: string };
        const body = (req.body || {}) as { client?: string };
        const client = parseClientChannel(
          body.client ||
            q.client ||
            (req.headers["x-habibi-client"] as string | undefined) ||
            user.sourceClient ||
            "h5",
        );
        const packageId = await resolvePackageId(req, user);
        const result = await participateCampaign({
          campaignId: id,
          userId: user.id,
          projectId: user.projectId,
          client,
          packageId,
        });
        return {
          already: result.already,
          period_key: result.period_key,
          attempt_index: result.attempt_index,
          result: result.claim.result,
          granted_seconds: result.claim.grantedSeconds,
          subscription: result.subscription,
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );
};
