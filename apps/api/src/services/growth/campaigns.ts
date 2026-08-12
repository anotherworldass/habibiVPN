import type {
  CampaignClaim,
  CampaignReward,
  ClientChannel,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { grantVpnDuration } from "../provision.js";
import {
  eligibilityHttpError,
  evaluateEligibility,
  type CampaignWithRelations,
} from "./eligibility.js";
import {
  DEFAULT_GROWTH_SLOT_NAME_I18N,
  normalizeAppCopyI18n,
  resolveAppCopyLocale,
} from "@habibi/shared";
import {
  asRules,
  normalizeCampaignUi,
  resolveCampaignUiPublic,
  type ParticipateInput,
} from "./types.js";

export type { CampaignWithRelations } from "./eligibility.js";

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function primaryReward(rewards: CampaignReward[]): CampaignReward | null {
  if (!rewards.length) return null;
  return [...rewards].sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
}

const campaignInclude = {
  clients: { orderBy: { client: "asc" as const } },
  packages: { orderBy: { createdAt: "asc" as const } },
  rewards: { orderBy: { sortOrder: "asc" as const } },
};

export function serializeCampaignAdmin(c: CampaignWithRelations) {
  return {
    id: c.id,
    project_id: c.projectId,
    code: c.code,
    name: c.name,
    type: c.type,
    status: c.status,
    start_at: c.startAt?.toISOString() || null,
    end_at: c.endAt?.toISOString() || null,
    timezone: c.timezone,
    rules: asRules(c.rulesJson),
    ui: normalizeCampaignUi(c.uiJson, c.name),
    sort_order: c.sortOrder,
    remark: c.remark,
    clients: c.clients.map((x) => ({
      client: x.client,
      enabled: x.enabled,
    })),
    packages: c.packages.map((p) => ({
      package_id: p.packageId,
    })),
    rewards: c.rewards.map((r) => ({
      id: r.id,
      kind: r.kind,
      validity_seconds: r.validitySeconds,
      data_limit_bytes:
        r.dataLimitBytes == null ? null : Number(r.dataLimitBytes),
      stack_mode: r.stackMode,
      sort_order: r.sortOrder,
    })),
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

export function serializeCampaignPublic(
  c: CampaignWithRelations,
  elig: Awaited<ReturnType<typeof evaluateEligibility>>,
  locale?: string | null,
) {
  const reward = primaryReward(c.rewards);
  const ui = resolveCampaignUiPublic(c.uiJson, locale);
  // Prefer resolved title; fall back to operational name.
  const title = ui.title || c.name;
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    status: c.status,
    start_at: c.startAt?.toISOString() || null,
    end_at: c.endAt?.toISOString() || null,
    timezone: c.timezone,
    locale: resolveAppCopyLocale(locale),
    ui: {
      ...ui,
      title,
    },
    reward: reward
      ? {
          kind: reward.kind,
          validity_seconds: reward.validitySeconds,
          data_limit_bytes:
            reward.dataLimitBytes == null
              ? null
              : Number(reward.dataLimitBytes),
        }
      : null,
    period_key: elig.periodKey,
    today_count: elig.todayCount,
    already_participated: elig.todayCount >= elig.limitPerUserPerDay,
    can_participate: elig.ok,
    ineligible_reasons: elig.ok ? [] : elig.reasons,
    limit_per_user_per_day: elig.limitPerUserPerDay,
    limit_per_user_total: elig.limitPerUserTotal,
  };
}

export async function loadCampaign(
  id: string,
): Promise<CampaignWithRelations | null> {
  return prisma.campaign.findUnique({
    where: { id },
    include: campaignInclude,
  });
}

export async function listCampaignsAdmin(projectId: string) {
  return prisma.campaign.findMany({
    where: { projectId },
    include: campaignInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function listActiveCampaignsForUser(input: {
  projectId: string;
  userId: string;
  client: ClientChannel;
  packageId?: string | null;
  locale?: string | null;
}) {
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw httpError("user.not_found", 404);

  const rows = await prisma.campaign.findMany({
    where: {
      projectId: input.projectId,
      status: "active",
      clients: { some: { client: input.client, enabled: true } },
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    include: campaignInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const out = [];
  for (const c of rows) {
    const elig = await evaluateEligibility({
      campaign: c,
      user,
      client: input.client,
      packageId: input.packageId,
      now,
    });
    // Still show campaigns that fail soft eligibility (audience/limit),
    // but hide hard client/package mismatches already filtered partially.
    if (elig.reasons.includes("campaign.package_not_allowed")) continue;
    out.push(serializeCampaignPublic(c, elig, input.locale));
  }
  return out;
}

function rollLottery(winRateBps: number): boolean {
  const bps = Math.max(0, Math.min(10000, Math.floor(winRateBps)));
  if (bps <= 0) return false;
  if (bps >= 10000) return true;
  return Math.floor(Math.random() * 10000) < bps;
}

export async function participateCampaign(input: ParticipateInput) {
  const campaign = await loadCampaign(input.campaignId);
  if (!campaign || campaign.projectId !== input.projectId) {
    throw httpError("campaign.not_found", 404);
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw httpError("user.not_found", 404);

  const elig = await evaluateEligibility({
    campaign,
    user,
    client: input.client,
    packageId: input.packageId,
  });
  if (!elig.ok) {
    throw eligibilityHttpError(elig.reasons);
  }

  const rules = asRules(campaign.rulesJson);
  const { periodKey, nextAttemptIndex } = elig;
  const idempotencyKey = `${campaign.id}:${input.userId}:${periodKey}:${nextAttemptIndex}`;

  const reward = primaryReward(campaign.rewards);
  if (!reward || reward.kind !== "vpn_duration" || !reward.validitySeconds) {
    throw httpError("campaign.reward_misconfigured", 500);
  }

  // Reserve attempt slot first to avoid double-grant on concurrent requests
  let claim: CampaignClaim;
  try {
    claim = await prisma.campaignClaim.create({
      data: {
        campaignId: campaign.id,
        userId: input.userId,
        client: input.client,
        periodKey,
        attemptIndex: nextAttemptIndex,
        result: "lost",
        grantedSeconds: null,
        slotId: null,
        idempotencyKey,
        meta: { type: campaign.type, pending: true },
      },
    });
  } catch {
    // Race: re-evaluate; if no longer eligible, surface limit; else retry once
    const again = await evaluateEligibility({
      campaign,
      user,
      client: input.client,
      packageId: input.packageId,
    });
    if (!again.ok) throw eligibilityHttpError(again.reasons);
    throw httpError("campaign.claim_conflict", 409);
  }

  let result: "claimed" | "won" | "lost" = "claimed";
  if (campaign.type === "lottery") {
    const winRateBps = rules.lottery?.winRateBps ?? 0;
    let canWin = rollLottery(winRateBps);
    const maxWins = rules.lottery?.maxWinsPerDayGlobal;
    if (canWin && maxWins != null) {
      const winsToday = await prisma.campaignClaim.count({
        where: {
          campaignId: campaign.id,
          periodKey,
          result: { in: ["won", "claimed"] },
        },
      });
      if (winsToday >= maxWins) canWin = false;
    }
    result = canWin ? "won" : "lost";
  }

  let grantedSeconds: number | null = null;
  let slotId: string | null = null;
  let subscription = null;

  if (result === "claimed" || result === "won") {
    try {
      const ui = normalizeCampaignUi(campaign.uiJson, campaign.name);
      const titleI18n = normalizeAppCopyI18n(ui.title_i18n, 120);
      const displayNameI18n = Object.keys(titleI18n).length
        ? titleI18n
        : { ...DEFAULT_GROWTH_SLOT_NAME_I18N };
      const grant = await grantVpnDuration({
        userId: input.userId,
        seconds: reward.validitySeconds,
        dataLimitBytes:
          reward.dataLimitBytes == null
            ? undefined
            : Number(reward.dataLimitBytes),
        stackMode: reward.stackMode,
        note: `campaign:${campaign.code}:${periodKey}#${nextAttemptIndex}`,
        displayNameI18n,
        ledger: {
          reason: "campaign",
          refType: "campaign_claim",
          refId: claim.id,
          actorType: "user",
          actorId: input.userId,
          idempotencyKey: `campaign_claim:${claim.id}`,
        },
      });
      grantedSeconds = grant.granted_seconds;
      slotId = grant.slot.id;
      subscription = grant.subscription;
    } catch (err) {
      await prisma.campaignClaim.delete({ where: { id: claim.id } }).catch(() => {});
      throw err;
    }
  }

  claim = await prisma.campaignClaim.update({
    where: { id: claim.id },
    data: {
      result,
      grantedSeconds,
      slotId,
      meta: {
        type: campaign.type,
        stack_mode: reward.stackMode,
        attempt_index: nextAttemptIndex,
      },
    },
  });

  await writeAudit({
    actorType: "user",
    actorId: input.userId,
    action: "campaign.participate",
    targetType: "campaign",
    targetId: campaign.id,
    meta: {
      result,
      period_key: periodKey,
      attempt_index: nextAttemptIndex,
      granted_seconds: grantedSeconds,
      client: input.client,
      package_id: input.packageId ?? user.sourcePackageId,
    },
  });

  return {
    already: false as const,
    claim,
    subscription,
    period_key: periodKey,
    attempt_index: nextAttemptIndex,
  };
}

export async function replaceCampaignClients(
  campaignId: string,
  clients: Array<{ client: ClientChannel; enabled?: boolean }>,
) {
  await prisma.$transaction([
    prisma.campaignClient.deleteMany({ where: { campaignId } }),
    prisma.campaignClient.createMany({
      data: clients.map((c) => ({
        campaignId,
        client: c.client,
        enabled: c.enabled !== false,
      })),
    }),
  ]);
}

export async function replaceCampaignPackages(
  campaignId: string,
  packageIds: string[],
) {
  const unique = [...new Set(packageIds.filter(Boolean))];
  await prisma.$transaction([
    prisma.campaignPackage.deleteMany({ where: { campaignId } }),
    ...(unique.length
      ? [
          prisma.campaignPackage.createMany({
            data: unique.map((packageId) => ({ campaignId, packageId })),
          }),
        ]
      : []),
  ]);
}

export async function replaceCampaignRewards(
  campaignId: string,
  rewards: Array<{
    kind?: "vpn_duration" | "vpn_traffic";
    validitySeconds?: number | null;
    dataLimitBytes?: number | null;
    stackMode?: "extend_active" | "create_campaign_slot";
    sortOrder?: number;
  }>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.campaignReward.deleteMany({ where: { campaignId } });
    for (const [i, r] of rewards.entries()) {
      await tx.campaignReward.create({
        data: {
          campaignId,
          kind: r.kind || "vpn_duration",
          validitySeconds: r.validitySeconds ?? null,
          dataLimitBytes:
            r.dataLimitBytes == null ? null : BigInt(r.dataLimitBytes),
          stackMode: r.stackMode || "create_campaign_slot",
          sortOrder: r.sortOrder ?? i,
        },
      });
    }
  });
}
