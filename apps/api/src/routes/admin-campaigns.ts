import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import {
  listCampaignsAdmin,
  loadCampaign,
  replaceCampaignClients,
  replaceCampaignPackages,
  replaceCampaignRewards,
  serializeCampaignAdmin,
} from "../services/growth/campaigns.js";
import {
  normalizeCampaignUi,
  normalizeInviteRules,
} from "../services/growth/types.js";

function asJson(v: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(v ?? {})) as Prisma.InputJsonValue;
}

const clientEnum = z.enum([
  "ios_appstore",
  "ios_alt",
  "android_play",
  "android_direct",
  "h5",
  "windows",
  "macos",
]);

const campaignTypeEnum = z.enum(["daily_claim", "lottery", "invite_milestone"]);

const rewardSchema = z.object({
  kind: z.enum(["vpn_duration", "vpn_traffic", "vpn_plan"]).optional(),
  planId: z.string().min(1).optional().nullable(),
  validitySeconds: z.number().int().positive().optional().nullable(),
  dataLimitBytes: z.number().int().min(0).optional().nullable(),
  stackMode: z.enum(["extend_active", "create_campaign_slot"]).optional(),
  sortOrder: z.number().int().optional(),
});

const campaignBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  type: campaignTypeEnum,
  status: z.enum(["draft", "active", "paused", "ended"]).optional(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  timezone: z.string().min(1).max(64).optional(),
  rules: z.record(z.unknown()).optional(),
  ui: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  remark: z.string().max(2000).optional().nullable(),
  clients: z
    .array(z.object({ client: clientEnum, enabled: z.boolean().optional() }))
    .optional(),
  /** Empty = all packages under selected clients */
  packageIds: z.array(z.string().min(1)).optional(),
  rewards: z.array(rewardSchema).optional(),
});

const campaignPatch = campaignBody.partial().extend({
  code: z.string().min(1).max(64).optional(),
  type: campaignTypeEnum.optional(),
});

function assertInviteMilestoneConfig(input: {
  type: string;
  startAt?: string | Date | null;
  rules?: unknown;
  rewards?: Array<{ kind?: string; planId?: string | null }>;
}) {
  if (input.type !== "invite_milestone") return;
  if (!input.startAt) {
    throw Object.assign(new Error("campaign.invite_start_required"), {
      statusCode: 400,
    });
  }
  const invite = normalizeInviteRules(input.rules ?? {});
  if (!invite) {
    throw Object.assign(new Error("campaign.invite_rules_required"), {
      statusCode: 400,
    });
  }
  const reward = input.rewards?.[0];
  if (!reward?.planId) {
    throw Object.assign(new Error("campaign.invite_plan_required"), {
      statusCode: 400,
    });
  }
}

export const adminCampaignRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/campaigns`;

  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/meta`, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const [packages, plans] = await Promise.all([
      prisma.appPackage.findMany({
        where: { projectId, enabled: true },
        orderBy: [{ client: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          packageName: true,
          client: true,
        },
      }),
      prisma.plan.findMany({
        where: { projectId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true },
      }),
    ]);
    return {
      clients: CLIENT_CHANNELS,
      types: ["daily_claim", "lottery", "invite_milestone"],
      statuses: ["draft", "active", "paused", "ended"],
      stack_modes: ["extend_active", "create_campaign_slot"],
      packages,
      plans,
      audience_flags: [
        "unpaidOnly",
        "minRegisterDays",
        "maxRegisterDays",
        "requireNoActiveSubscription",
        "requireExpiredOrNone",
        "requireActiveSubscription",
        "planIds",
      ],
    };
  });

  app.get(prefix, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const rows = await listCampaignsAdmin(projectId);
    return { campaigns: rows.map(serializeCampaignAdmin) };
  });

  app.get(`${prefix}/:id`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const row = await loadCampaign(id);
    if (!row || row.projectId !== projectId) {
      return reply.code(404).send({ error: "campaign.not_found" });
    }
    return { campaign: serializeCampaignAdmin(row) };
  });

  app.post(prefix, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const body = campaignBody.parse(req.body);
    const clients =
      body.clients && body.clients.length
        ? body.clients
        : CLIENT_CHANNELS.map((client) => ({ client, enabled: true }));
    const rewards =
      body.rewards && body.rewards.length
        ? body.rewards
        : body.type === "invite_milestone"
          ? []
          : [{ kind: "vpn_duration" as const, validitySeconds: 7200 }];

    try {
      assertInviteMilestoneConfig({
        type: body.type,
        startAt: body.startAt,
        rules: body.rules,
        rewards,
      });
      const created = await prisma.campaign.create({
        data: {
          projectId,
          code: body.code,
          name: body.name,
          type: body.type,
          status: body.status || "draft",
          startAt: body.startAt ? new Date(body.startAt) : null,
          endAt: body.endAt ? new Date(body.endAt) : null,
          timezone: body.timezone || "Asia/Shanghai",
          rulesJson: asJson(
            body.rules || {
              limitPerUserPerDay: 1,
              ...(body.type === "lottery"
                ? { lottery: { winRateBps: 3000 } }
                : {}),
            },
          ),
          uiJson: asJson(normalizeCampaignUi(body.ui || {}, body.name)),
          sortOrder: body.sortOrder ?? 0,
          remark: body.remark ?? null,
        },
      });
      await replaceCampaignClients(created.id, clients);
      if (body.packageIds) await replaceCampaignPackages(created.id, body.packageIds);
      await replaceCampaignRewards(created.id, rewards);
      const full = await loadCampaign(created.id);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "campaign.create",
        targetType: "campaign",
        targetId: created.id,
        meta: { project_id: projectId, code: body.code },
      });
      return reply.code(201).send({ campaign: serializeCampaignAdmin(full!) });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status) {
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "invalid",
        });
      }
      const msg = err instanceof Error ? err.message : "create_failed";
      if (msg.includes("Unique constraint")) {
        return reply.code(409).send({ error: "campaign.code_taken" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const body = campaignPatch.parse(req.body);
    const existing = await loadCampaign(id);
    if (!existing || existing.projectId !== projectId) {
      return reply.code(404).send({ error: "campaign.not_found" });
    }

    try {
      assertInviteMilestoneConfig({
        type: body.type ?? existing.type,
        startAt:
          body.startAt !== undefined
            ? body.startAt
            : existing.startAt?.toISOString() ?? null,
        rules: body.rules ?? existing.rulesJson,
        rewards:
          body.rewards ??
          existing.rewards.map((r) => ({
            kind: r.kind,
            planId: r.planId,
          })),
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status) {
        return reply.code(status).send({
          error: err instanceof Error ? err.message : "invalid",
        });
      }
      throw err;
    }

    const data: Prisma.CampaignUpdateInput = {};
    if (body.code != null) data.code = body.code;
    if (body.name != null) data.name = body.name;
    if (body.type != null) data.type = body.type;
    if (body.status != null) data.status = body.status;
    if (body.startAt !== undefined) {
      data.startAt = body.startAt ? new Date(body.startAt) : null;
    }
    if (body.endAt !== undefined) {
      data.endAt = body.endAt ? new Date(body.endAt) : null;
    }
    if (body.timezone != null) data.timezone = body.timezone;
    if (body.rules != null) data.rulesJson = asJson(body.rules);
    if (body.ui != null) {
      data.uiJson = asJson(
        normalizeCampaignUi(body.ui, body.name ?? existing.name),
      );
    }
    if (body.sortOrder != null) data.sortOrder = body.sortOrder;
    if (body.remark !== undefined) data.remark = body.remark;

    await prisma.campaign.update({ where: { id }, data });
    if (body.clients) await replaceCampaignClients(id, body.clients);
    if (body.packageIds) await replaceCampaignPackages(id, body.packageIds);
    if (body.rewards) await replaceCampaignRewards(id, body.rewards);

    const full = await loadCampaign(id);
    await writeAudit({
      actorType: "admin",
      actorId: req.admin?.sub,
      action: "campaign.update",
      targetType: "campaign",
      targetId: id,
    });
    return { campaign: serializeCampaignAdmin(full!) };
  });

  app.get(`${prefix}/:id/claims`, async (req, reply) => {
    const projectId = await resolveAdminProjectId(req);
    const { id } = req.params as { id: string };
    const q = req.query as { page?: string; page_size?: string };
    const existing = await prisma.campaign.findFirst({
      where: { id, projectId },
      select: { id: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: "campaign.not_found" });
    }
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.page_size) || 20));
    const [total, items] = await Promise.all([
      prisma.campaignClaim.count({ where: { campaignId: id } }),
      prisma.campaignClaim.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, uid: true, email: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      page_size: pageSize,
      claims: items.map((c) => ({
        id: c.id,
        user_id: c.userId,
        uid: c.user.uid,
        email: c.user.email,
        client: c.client,
        period_key: c.periodKey,
        attempt_index: c.attemptIndex,
        result: c.result,
        granted_seconds: c.grantedSeconds,
        slot_id: c.slotId,
        created_at: c.createdAt.toISOString(),
      })),
    };
  });
};
