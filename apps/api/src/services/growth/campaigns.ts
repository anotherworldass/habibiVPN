import type {
  CampaignClaim,
  ClientChannel,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { grantVpnDuration } from "../provision.js";
import { executeOrEnqueueGrant } from "../upstream-grant-queue.js";
import {
  eligibilityHttpError,
  evaluateEligibility,
  packageAllowed,
  type CampaignRewardWithPlan,
  type CampaignWithRelations,
} from "./eligibility.js";
import { tryGrantInviteMilestone } from "./invite-milestone.js";
import {
  DEFAULT_GROWTH_SLOT_NAME_I18N,
  normalizeAppCopyI18n,
  resolveAppCopyLocale,
} from "@habibi/shared";
import { localizePlanCopy } from "../plan-i18n.js";
import {
  asRules,
  emptyInviteeRequirements,
  normalizeCampaignUi,
  normalizeInviteFromRules,
  resolveCampaignUiPublic,
  type InviteMilestoneRules,
  type ParticipateInput,
} from "./types.js";

export type { CampaignWithRelations } from "./eligibility.js";

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

type PlanBrief = {
  id: string;
  name: string;
  name_i18n?: Record<string, string>;
  description?: string | null;
  validity_seconds?: number | null;
  validity_calendar_months?: number | null;
  data_limit_bytes?: number | null;
  device_slots?: number | null;
};

type PlanBriefSource = {
  id: string;
  name: string;
  nameI18n?: unknown;
  description?: string | null;
  descriptionI18n?: unknown;
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
  dataLimitBytes?: bigint | number | null;
  deviceSlots?: number | null;
};

function primaryReward(
  rewards: CampaignRewardWithPlan[],
): CampaignRewardWithPlan | null {
  if (!rewards.length) return null;
  return [...rewards].sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
}

function planBrief(
  plan: PlanBriefSource | null | undefined,
  locale?: string | null,
  overlay?: {
    validitySeconds?: number | null;
    dataLimitBytes?: bigint | number | null;
  },
): PlanBrief | null {
  if (!plan?.id) return null;
  const copy = localizePlanCopy(
    {
      name: plan.name,
      description: plan.description ?? null,
      nameI18n: plan.nameI18n,
      descriptionI18n: plan.descriptionI18n,
    },
    locale,
  );
  const durationOverride = overlay?.validitySeconds != null;
  const trafficOverride = overlay?.dataLimitBytes != null;
  const trafficRaw = trafficOverride
    ? overlay.dataLimitBytes
    : plan.dataLimitBytes;
  return {
    id: plan.id,
    name: copy.name || plan.name || plan.id,
    name_i18n: copy.name_i18n as Record<string, string>,
    description: copy.description || null,
    validity_seconds: durationOverride
      ? overlay.validitySeconds ?? null
      : (plan.validitySeconds ?? null),
    validity_calendar_months: durationOverride
      ? null
      : (plan.validityCalendarMonths ?? null),
    data_limit_bytes: trafficRaw == null ? null : Number(trafficRaw),
    device_slots: plan.deviceSlots ?? null,
  };
}

const planBriefSelect = {
  id: true,
  name: true,
  nameI18n: true,
  description: true,
  descriptionI18n: true,
  validitySeconds: true,
  validityCalendarMonths: true,
  dataLimitBytes: true,
  deviceSlots: true,
} as const;

async function loadPlanBriefs(
  ids: Array<string | null | undefined>,
  locale?: string | null,
): Promise<Map<string, PlanBrief>> {
  const unique = [
    ...new Set(ids.filter((id): id is string => Boolean(id && id.trim()))),
  ];
  if (!unique.length) return new Map();
  const rows = await prisma.plan.findMany({
    where: { id: { in: unique } },
    select: planBriefSelect,
  });
  return new Map(rows.map((p) => [p.id, planBrief(p, locale)!]));
}

function serializePublicReward(
  reward: CampaignRewardWithPlan | null,
  locale?: string | null,
) {
  if (!reward) return null;
  return {
    kind: reward.kind,
    plan_id: reward.planId,
    plan: planBrief(reward.plan, locale, {
      validitySeconds: reward.validitySeconds,
      dataLimitBytes: reward.dataLimitBytes,
    }),
    validity_seconds: reward.validitySeconds,
    data_limit_bytes:
      reward.dataLimitBytes == null ? null : Number(reward.dataLimitBytes),
  };
}

function serializeRequirements(invite: InviteMilestoneRules | null) {
  const reqs = invite?.inviteeRequirements ?? emptyInviteeRequirements();
  return {
    paid: reqs.paid,
    has_subscription: reqs.hasSubscription,
    has_traffic: reqs.hasTraffic,
    min_traffic_bytes: reqs.minTrafficBytes,
  };
}

const campaignInclude = {
  clients: { orderBy: { client: "asc" as const } },
  packages: { orderBy: { createdAt: "asc" as const } },
  rewards: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      plan: { select: { ...planBriefSelect, code: true } },
    },
  },
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
      plan_id: r.planId,
      plan: r.plan
        ? { id: r.plan.id, name: r.plan.name, code: r.plan.code }
        : null,
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
  planBriefs?: Map<string, PlanBrief>,
) {
  const reward = primaryReward(c.rewards);
  const ui = resolveCampaignUiPublic(c.uiJson, locale);
  const title = ui.title;
  const perInviteId = elig.inviteProgress?.perInvitePlanId ?? null;
  const perInvitePlan = perInviteId
    ? planBriefs?.get(perInviteId) ?? null
    : null;
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
    reward: serializePublicReward(reward, locale),
    period_key: elig.periodKey,
    today_count: elig.todayCount,
    already_participated:
      c.type === "invite_milestone"
        ? elig.totalWinCount > 0
        : elig.todayCount >= elig.limitPerUserPerDay,
    can_participate: elig.ok,
    ineligible_reasons: elig.ok ? [] : elig.reasons,
    limit_per_user_per_day: elig.limitPerUserPerDay,
    limit_per_user_total: elig.limitPerUserTotal,
    invite_progress: elig.inviteProgress
      ? {
          required_count: elig.inviteProgress.requiredCount,
          current_count: elig.inviteProgress.currentCount,
          grant_mode: elig.inviteProgress.grantMode,
          plan_id: reward?.planId ?? null,
          per_invite_plan_id: perInviteId,
          per_invite_plan: perInvitePlan,
          per_invite_granted_count: elig.inviteProgress.perInviteGrantedCount,
          requirements: {
            paid: elig.inviteProgress.requirements.paid,
            has_subscription: elig.inviteProgress.requirements.hasSubscription,
            has_traffic: elig.inviteProgress.requirements.hasTraffic,
            min_traffic_bytes: elig.inviteProgress.requirements.minTrafficBytes,
          },
        }
      : undefined,
  };
}

export function serializeInviteCampaignTeaser(
  c: CampaignWithRelations,
  locale: string | null | undefined,
  planBriefs: Map<string, PlanBrief>,
) {
  const invite = normalizeInviteFromRules(asRules(c.rulesJson));
  const reward = primaryReward(c.rewards);
  const ui = resolveCampaignUiPublic(c.uiJson, locale);
  const title = ui.title;
  const perInviteId = invite?.perInvitePlanId ?? null;
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    status: c.status,
    start_at: c.startAt?.toISOString() || null,
    end_at: c.endAt?.toISOString() || null,
    locale: resolveAppCopyLocale(locale),
    ui: {
      ...ui,
      title,
    },
    required_count: invite?.requiredCount ?? 0,
    grant_mode: invite?.grantMode ?? "auto",
    reward: serializePublicReward(reward, locale),
    per_invite_plan: perInviteId ? planBriefs.get(perInviteId) ?? null : null,
    requirements: serializeRequirements(invite),
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

  const pending: Array<{
    campaign: (typeof rows)[number];
    elig: Awaited<ReturnType<typeof evaluateEligibility>>;
  }> = [];
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
    pending.push({ campaign: c, elig });
  }
  const planIds = pending.flatMap(({ campaign: c, elig }) => [
    primaryReward(c.rewards)?.planId,
    elig.inviteProgress?.perInvitePlanId,
  ]);
  const briefs = await loadPlanBriefs(planIds, input.locale);
  return pending.map(({ campaign, elig }) =>
    serializeCampaignPublic(campaign, elig, input.locale, briefs),
  );
}

export async function listPublicInviteMilestoneCampaigns(input: {
  projectId: string;
  client: ClientChannel;
  packageId?: string | null;
  locale?: string | null;
}) {
  const now = new Date();
  const rows = await prisma.campaign.findMany({
    where: {
      projectId: input.projectId,
      status: "active",
      type: "invite_milestone",
      clients: { some: { client: input.client, enabled: true } },
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    include: campaignInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  const visible = rows.filter((c) => packageAllowed(c.packages, input.packageId));
  const planIds = visible.flatMap((c) => [
    primaryReward(c.rewards)?.planId,
    normalizeInviteFromRules(asRules(c.rulesJson))?.perInvitePlanId,
  ]);
  const briefs = await loadPlanBriefs(planIds, input.locale);
  return visible
    .filter((c) => normalizeInviteFromRules(asRules(c.rulesJson)))
    .map((c) => serializeInviteCampaignTeaser(c, input.locale, briefs));
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

  if (campaign.type === "invite_milestone") {
    const grant = await tryGrantInviteMilestone({
      campaign,
      userId: input.userId,
      client: input.client,
    });
    if (!grant.granted || !grant.claim) {
      throw eligibilityHttpError([grant.reason || "campaign.not_eligible"]);
    }
    return {
      already: false as const,
      claim: grant.claim,
      subscription: grant.subscription,
      period_key: elig.periodKey,
      attempt_index: 1,
      pending: Boolean(grant.pending),
    };
  }

  const rules = asRules(campaign.rulesJson);
  const { periodKey, nextAttemptIndex } = elig;
  const idempotencyKey = `${campaign.id}:${input.userId}:${periodKey}:${nextAttemptIndex}`;

  const reward = primaryReward(campaign.rewards);
  if (!reward || reward.kind !== "vpn_duration" || !reward.validitySeconds) {
    throw httpError("campaign.reward_misconfigured", 500);
  }
  const rewardSeconds = reward.validitySeconds;

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
  let pending = false;

  if (result === "claimed" || result === "won") {
    try {
      const ui = normalizeCampaignUi(campaign.uiJson, campaign.name);
      const titleI18n = normalizeAppCopyI18n(ui.title_i18n, 120);
      const displayNameI18n = Object.keys(titleI18n).length
        ? titleI18n
        : { ...DEFAULT_GROWTH_SLOT_NAME_I18N };
      const note = `campaign:${campaign.code}:${periodKey}#${nextAttemptIndex}`;
      const ledger = {
        reason: "campaign" as const,
        refType: "campaign_claim",
        refId: claim.id,
        actorType: "user",
        actorId: input.userId,
        idempotencyKey: `campaign_claim:${claim.id}`,
      };
      const queued = await executeOrEnqueueGrant({
        kind: "campaign",
        userId: input.userId,
        idempotencyKey: ledger.idempotencyKey,
        payload: {
          op: "grant_duration",
          seconds: rewardSeconds,
          dataLimitBytes:
            reward.dataLimitBytes == null
              ? undefined
              : Number(reward.dataLimitBytes),
          stackMode: reward.stackMode,
          note,
          displayNameI18n,
          ledger,
          campaignClaimId: claim.id,
          campaignGrantedSeconds: rewardSeconds,
          campaignMeta: {
            type: campaign.type,
            stack_mode: reward.stackMode,
            attempt_index: nextAttemptIndex,
          },
        },
        run: () =>
          grantVpnDuration({
            userId: input.userId,
            seconds: rewardSeconds,
            dataLimitBytes:
              reward.dataLimitBytes == null
                ? undefined
                : Number(reward.dataLimitBytes),
            stackMode: reward.stackMode,
            note,
            displayNameI18n,
            ledger,
          }),
      });
      if (queued.pending) {
        pending = true;
        grantedSeconds = rewardSeconds;
      } else {
        grantedSeconds = queued.result.granted_seconds;
        slotId = queued.result.slot.id;
        subscription = queued.result.subscription;
      }
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
    pending,
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
    kind?: "vpn_duration" | "vpn_traffic" | "vpn_plan";
    planId?: string | null;
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
          planId: r.planId || null,
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
