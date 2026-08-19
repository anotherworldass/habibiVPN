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
  PER_INVITE_PERIOD_KEY,
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

export function perInviteIdempotencyKey(
  campaignId: string,
  userId: string,
  inviteeId: string,
) {
  return `${campaignId}:${userId}:${PER_INVITE_PERIOD_KEY}:${inviteeId}`;
}

export function nextPerInviteGrants(input: {
  qualifiedIds: string[];
  requiredCount: number;
  existing: Array<{ inviteeId: string; attemptIndex: number }>;
}): Array<{ inviteeId: string; attemptIndex: number }> {
  const cap = Math.max(0, Math.floor(input.requiredCount) - 1);
  if (cap < 1) return [];
  const eligible = input.qualifiedIds.slice(0, cap);
  const granted = new Set(input.existing.map((e) => e.inviteeId));
  const usedAttempts = new Set(input.existing.map((e) => e.attemptIndex));
  let nextAttempt = 1;
  const out: Array<{ inviteeId: string; attemptIndex: number }> = [];
  for (const inviteeId of eligible) {
    if (granted.has(inviteeId)) continue;
    while (usedAttempts.has(nextAttempt) && nextAttempt <= cap) {
      nextAttempt += 1;
    }
    if (nextAttempt > cap) break;
    out.push({ inviteeId, attemptIndex: nextAttempt });
    usedAttempts.add(nextAttempt);
    nextAttempt += 1;
  }
  return out;
}

function inviteeIdFromClaim(claim: {
  idempotencyKey: string;
  meta: Prisma.JsonValue | null;
}): string | null {
  const meta = claim.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const id = (meta as { invitee_id?: unknown }).invitee_id;
    if (typeof id === "string" && id.trim()) return id;
  }
  const parts = claim.idempotencyKey.split(":");
  return parts.length >= 4 ? parts[parts.length - 1] || null : null;
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

export async function listQualifiedInvitees(
  inviterId: string,
  campaign: Pick<Campaign, "startAt" | "endAt" | "rulesJson">,
): Promise<Array<{ id: string; createdAt: Date }>> {
  if (!campaign.startAt) return [];
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

  const invitees = await prisma.user.findMany({
    where,
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (!invitees.length) return [];

  const minBytes = trafficThreshold(reqs);
  if (minBytes == null) return invitees;

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
  return invitees.filter((u) => qualified.has(u.id));
}

export async function countQualifiedInvites(
  inviterId: string,
  campaign: Pick<Campaign, "startAt" | "endAt" | "rulesJson">,
): Promise<number> {
  const rows = await listQualifiedInvitees(inviterId, campaign);
  return rows.length;
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

  const count = (await listQualifiedInvitees(input.userId, campaign)).length;
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

export async function tryGrantPerInviteRewards(input: {
  campaign: CampaignWithRelations;
  userId: string;
  client: ClientChannel;
}): Promise<{ granted: number }> {
  const { campaign } = input;
  const now = new Date();
  if (campaign.type !== "invite_milestone") return { granted: 0 };
  if (campaign.status !== "active") return { granted: 0 };
  if (!isWithinWindow(campaign, now)) return { granted: 0 };

  const invite = normalizeInviteRules(campaign.rulesJson);
  const planId = invite?.perInvitePlanId;
  if (!invite || !planId) return { granted: 0 };

  const qualified = await listQualifiedInvitees(input.userId, campaign);
  const existingRows = await prisma.campaignClaim.findMany({
    where: {
      campaignId: campaign.id,
      userId: input.userId,
      periodKey: PER_INVITE_PERIOD_KEY,
    },
    select: { attemptIndex: true, idempotencyKey: true, meta: true, result: true },
  });
  const existing = existingRows
    .map((row) => {
      const inviteeId = inviteeIdFromClaim(row);
      return inviteeId
        ? { inviteeId, attemptIndex: row.attemptIndex }
        : null;
    })
    .filter((row): row is { inviteeId: string; attemptIndex: number } =>
      Boolean(row),
    );

  const pending = nextPerInviteGrants({
    qualifiedIds: qualified.map((u) => u.id),
    requiredCount: invite.requiredCount,
    existing,
  });
  if (!pending.length) return { granted: 0 };

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, validitySeconds: true },
  });
  if (!plan) return { granted: 0 };

  let granted = 0;
  for (const item of pending) {
    const idempotencyKey = perInviteIdempotencyKey(
      campaign.id,
      input.userId,
      item.inviteeId,
    );
    const existingClaim = await prisma.campaignClaim.findUnique({
      where: { idempotencyKey },
    });
    if (
      existingClaim &&
      (existingClaim.result === "claimed" || existingClaim.result === "won")
    ) {
      continue;
    }
    if (existingClaim) {
      await prisma.campaignClaim.delete({ where: { id: existingClaim.id } }).catch(
        () => {},
      );
    }

    let claim: CampaignClaim;
    try {
      claim = await prisma.campaignClaim.create({
        data: {
          campaignId: campaign.id,
          userId: input.userId,
          client: input.client,
          periodKey: PER_INVITE_PERIOD_KEY,
          attemptIndex: item.attemptIndex,
          result: "lost",
          grantedSeconds: null,
          slotId: null,
          idempotencyKey,
          meta: {
            type: "invite_per_invite",
            pending: true,
            invitee_id: item.inviteeId,
            plan_id: planId,
          },
        },
      });
    } catch {
      continue;
    }

    try {
      const grant = await createUpstreamSlot({
        userId: input.userId,
        planId,
        allowRenew: true,
        note: `campaign:${campaign.code}:per_invite`,
        ledger: {
          reason: "campaign",
          refType: "campaign_claim",
          refId: claim.id,
          actorType: "user",
          actorId: input.userId,
          idempotencyKey: `campaign_claim:${claim.id}`,
        },
      });
      await prisma.campaignClaim.update({
        where: { id: claim.id },
        data: {
          result: "claimed",
          grantedSeconds: plan.validitySeconds ?? null,
          slotId: grant.slot.id,
          meta: {
            type: "invite_per_invite",
            invitee_id: item.inviteeId,
            plan_id: planId,
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
          period_key: PER_INVITE_PERIOD_KEY,
          granted_seconds: plan.validitySeconds ?? null,
          plan_id: planId,
          invitee_id: item.inviteeId,
          trigger: "invite_per_invite",
        },
      });
      granted += 1;
    } catch (err) {
      await prisma.campaignClaim.delete({ where: { id: claim.id } }).catch(() => {});
      console.error("[invite-milestone] per-invite grant failed", {
        campaignId: campaign.id,
        userId: input.userId,
        inviteeId: item.inviteeId,
        err,
      });
    }
  }
  return { granted };
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
    if (!invite) continue;
    const client = pickGrantClient(campaign, user.sourceClient);
    try {
      await tryGrantPerInviteRewards({
        campaign,
        userId: user.id,
        client,
      });
    } catch (err) {
      console.error("[invite-milestone] per-invite auto-grant failed", {
        campaignId: campaign.id,
        userId: user.id,
        err,
      });
    }
    if (invite.grantMode !== "auto") continue;
    try {
      await tryGrantInviteMilestone({
        campaign,
        userId: user.id,
        client,
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
