import type {
  Campaign,
  CampaignClaim,
  ClientChannel,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { createUpstreamSlot } from "../provision.js";
import type { CampaignWithRelations } from "./eligibility.js";
import {
  MILESTONE_PERIOD_KEY,
  emptyInviteeRequirements,
  normalizeInviteRules,
} from "./types.js";

function isWithinWindow(
  c: { startAt: Date | null; endAt: Date | null },
  now: Date,
): boolean {
  if (c.startAt && c.startAt.getTime() > now.getTime()) return false;
  if (c.endAt && c.endAt.getTime() < now.getTime()) return false;
  return true;
}

const campaignInclude = {
  clients: { orderBy: { client: "asc" as const } },
  packages: { orderBy: { createdAt: "asc" as const } },
  rewards: {
    orderBy: { sortOrder: "asc" as const },
    include: { plan: { select: { id: true, name: true, code: true } } },
  },
};

export function milestoneIdempotencyKey(campaignId: string, userId: string) {
  return `${campaignId}:${userId}:${MILESTONE_PERIOD_KEY}:1`;
}

function trafficThreshold(reqs: {
  hasTraffic: boolean;
  minTrafficBytes: number | null;
}): number | null {
  if (reqs.minTrafficBytes != null && reqs.minTrafficBytes > 0) {
    return reqs.minTrafficBytes;
  }
  if (reqs.hasTraffic) return 1;
  return null;
}

export async function countQualifiedInvites(
  inviterId: string,
  campaign: Pick<Campaign, "startAt" | "endAt" | "rulesJson">,
): Promise<number> {
  if (!campaign.startAt) return 0;
  const invite = normalizeInviteRules(campaign.rulesJson);
  const reqs = invite?.inviteeRequirements ?? emptyInviteeRequirements();

  const createdAt: Prisma.DateTimeFilter = { gte: campaign.startAt };
  if (campaign.endAt) createdAt.lte = campaign.endAt;

  const where: Prisma.UserWhereInput = {
    invitedById: inviterId,
    createdAt,
  };
  if (reqs.paid) {
    where.orders = {
      some: {
        status: { in: ["paid", "provisioned"] },
        amountCents: { gt: 0 },
      },
    };
  }
  if (reqs.hasSubscription) {
    where.upstreams = { some: {} };
  }

  const minBytes = trafficThreshold(reqs);
  if (minBytes == null) {
    return prisma.user.count({ where });
  }

  const invitees = await prisma.user.findMany({
    where,
    select: { id: true },
  });
  if (!invitees.length) return 0;

  const sums = await prisma.userUpstream.groupBy({
    by: ["userId"],
    where: { userId: { in: invitees.map((u) => u.id) } },
    _sum: { usedTrafficBytes: true },
  });
  const qualified = new Set<string>();
  for (const row of sums) {
    const used = row._sum.usedTrafficBytes;
    const n = used == null ? 0 : Number(used);
    if (Number.isFinite(n) && n >= minBytes) qualified.add(row.userId);
  }
  return invitees.filter((u) => qualified.has(u.id)).length;
}

function pickGrantClient(
  campaign: CampaignWithRelations,
  sourceClient: ClientChannel | null,
): ClientChannel {
  if (
    sourceClient &&
    campaign.clients.some((c) => c.client === sourceClient && c.enabled)
  ) {
    return sourceClient;
  }
  const enabled = campaign.clients.find((c) => c.enabled);
  return enabled?.client ?? "h5";
}

export async function tryGrantInviteMilestone(input: {
  campaign: CampaignWithRelations;
  userId: string;
  client: ClientChannel;
}): Promise<{
  granted: boolean;
  claim?: CampaignClaim;
  subscription?: unknown;
  reason?: string;
}> {
  const { campaign } = input;
  const now = new Date();
  if (campaign.type !== "invite_milestone") {
    return { granted: false, reason: "campaign.not_invite_milestone" };
  }
  if (campaign.status !== "active") {
    return { granted: false, reason: "campaign.not_active" };
  }
  if (!isWithinWindow(campaign, now)) {
    return { granted: false, reason: "campaign.outside_window" };
  }

  const invite = normalizeInviteRules(campaign.rulesJson);
  const reward = [...campaign.rewards].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!invite || !reward?.planId) {
    return { granted: false, reason: "campaign.reward_misconfigured" };
  }

  const idempotencyKey = milestoneIdempotencyKey(campaign.id, input.userId);
  const existing = await prisma.campaignClaim.findUnique({
    where: { idempotencyKey },
  });
  if (existing && (existing.result === "claimed" || existing.result === "won")) {
    return { granted: false, reason: "campaign.total_limit", claim: existing };
  }
  if (existing) {
    await prisma.campaignClaim.delete({ where: { id: existing.id } }).catch(() => {});
  }

  const count = await countQualifiedInvites(input.userId, campaign);
  if (count < invite.requiredCount) {
    return { granted: false, reason: "campaign.invite_progress" };
  }

  let claim: CampaignClaim;
  try {
    claim = await prisma.campaignClaim.create({
      data: {
        campaignId: campaign.id,
        userId: input.userId,
        client: input.client,
        periodKey: MILESTONE_PERIOD_KEY,
        attemptIndex: 1,
        result: "lost",
        grantedSeconds: null,
        slotId: null,
        idempotencyKey,
        meta: {
          type: "invite_milestone",
          pending: true,
          invited_count: count,
          plan_id: reward.planId,
        },
      },
    });
  } catch {
    return { granted: false, reason: "campaign.claim_conflict" };
  }

  try {
    const plan = await prisma.plan.findUnique({
      where: { id: reward.planId },
      select: { validitySeconds: true },
    });
    const grant = await createUpstreamSlot({
      userId: input.userId,
      planId: reward.planId,
      allowRenew: true,
      note: `campaign:${campaign.code}:milestone`,
      ledger: {
        reason: "campaign",
        refType: "campaign_claim",
        refId: claim.id,
        actorType: "user",
        actorId: input.userId,
        idempotencyKey: `campaign_claim:${claim.id}`,
      },
    });
    const grantedSeconds = plan?.validitySeconds ?? null;
    claim = await prisma.campaignClaim.update({
      where: { id: claim.id },
      data: {
        result: "claimed",
        grantedSeconds,
        slotId: grant.slot.id,
        meta: {
          type: "invite_milestone",
          invited_count: count,
          plan_id: reward.planId,
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
        result: "claimed",
        period_key: MILESTONE_PERIOD_KEY,
        granted_seconds: grantedSeconds,
        plan_id: reward.planId,
        invited_count: count,
        trigger: "invite_milestone",
      },
    });
    return { granted: true, claim, subscription: grant.subscription };
  } catch (err) {
    await prisma.campaignClaim.delete({ where: { id: claim.id } }).catch(() => {});
    throw err;
  }
}

export async function maybeAutoGrantForInviter(
  inviterId: string,
  projectId?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: inviterId },
    select: {
      id: true,
      projectId: true,
      sourceClient: true,
      status: true,
    },
  });
  if (!user || user.status !== "active") return;

  const now = new Date();
  const pid = projectId || user.projectId;
  const rows = await prisma.campaign.findMany({
    where: {
      projectId: pid,
      type: "invite_milestone",
      status: "active",
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    include: campaignInclude,
  });

  for (const campaign of rows) {
    const invite = normalizeInviteRules(campaign.rulesJson);
    if (!invite || invite.grantMode !== "auto") continue;
    try {
      await tryGrantInviteMilestone({
        campaign,
        userId: user.id,
        client: pickGrantClient(campaign, user.sourceClient),
      });
    } catch (err) {
      console.error("[invite-milestone] auto-grant failed", {
        campaignId: campaign.id,
        userId: user.id,
        err,
      });
    }
  }
}

export async function maybeAutoGrantForInvitee(inviteeId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: inviteeId },
    select: { invitedById: true, projectId: true },
  });
  if (!user?.invitedById) return;
  await maybeAutoGrantForInviter(user.invitedById, user.projectId);
}

export function scheduleInviteMilestoneForInviter(
  inviterId: string | null | undefined,
  projectId?: string | null,
) {
  if (!inviterId) return;
  setImmediate(() => {
    void maybeAutoGrantForInviter(inviterId, projectId ?? undefined).catch(
      (err) => {
        console.error("[invite-milestone] auto-grant failed", err);
      },
    );
  });
}

export function scheduleInviteMilestoneForInvitee(
  inviteeId: string | null | undefined,
) {
  if (!inviteeId) return;
  setImmediate(() => {
    void maybeAutoGrantForInvitee(inviteeId).catch((err) => {
      console.error("[invite-milestone] auto-grant failed", err);
    });
  });
}
