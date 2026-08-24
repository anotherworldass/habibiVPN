import type {
  Campaign,
  CampaignClient,
  CampaignPackage,
  CampaignReward,
  ClientChannel,
  User,
  UserUpstream,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { countQualifiedInvites } from "./invite-milestone.js";
import {
  asRules,
  emptyInviteeRequirements,
  normalizeInviteFromRules,
  periodKeyFor,
  type CampaignRules,
  type InviteGrantMode,
  type InviteeRequirements,
  MILESTONE_PERIOD_KEY,
  PER_INVITE_PERIOD_KEY,
} from "./types.js";

export type CampaignRewardWithPlan = CampaignReward & {
  plan?: {
    id: string;
    name: string;
    code: string;
    nameI18n?: unknown;
    description?: string | null;
    descriptionI18n?: unknown;
    validitySeconds?: number | null;
    validityCalendarMonths?: number | null;
    dataLimitBytes?: bigint | number | null;
    deviceSlots?: number | null;
  } | null;
};

export type CampaignWithRelations = Campaign & {
  clients: CampaignClient[];
  packages: CampaignPackage[];
  rewards: CampaignRewardWithPlan[];
};

export type EligibilityContext = {
  campaign: CampaignWithRelations;
  user: User;
  client: ClientChannel;
  packageId?: string | null;
  now?: Date;
};

export type InviteProgress = {
  requiredCount: number;
  currentCount: number;
  grantMode: InviteGrantMode;
  requirements: InviteeRequirements;
  perInvitePlanId: string | null;
  perInviteGrantedCount: number;
};

export type EligibilityResult = {
  ok: boolean;
  reasons: string[];
  periodKey: string;
  todayCount: number;
  totalWinCount: number;
  limitPerUserPerDay: number;
  limitPerUserTotal: number | null;
  nextAttemptIndex: number;
  inviteProgress?: InviteProgress;
};

function push(reasons: string[], code: string) {
  if (!reasons.includes(code)) reasons.push(code);
}

export function isWithinWindow(c: Campaign, now = new Date()): boolean {
  if (c.startAt && c.startAt.getTime() > now.getTime()) return false;
  if (c.endAt && c.endAt.getTime() < now.getTime()) return false;
  return true;
}

export function clientAllowed(
  clients: CampaignClient[],
  client: ClientChannel,
): boolean {
  const row = clients.find((x) => x.client === client);
  return Boolean(row?.enabled);
}

export function packageAllowed(
  packages: CampaignPackage[],
  packageId: string | null | undefined,
): boolean {
  // Empty allow-list = all packages under selected clients
  if (!packages.length) return true;
  if (!packageId) return false;
  return packages.some((p) => p.packageId === packageId);
}

function hasActiveSlot(slots: UserUpstream[], now: Date): boolean {
  return slots.some(
    (s) =>
      s.status === "active" &&
      (!s.expiresAt || s.expiresAt.getTime() > now.getTime()),
  );
}

function allExpiredOrNone(slots: UserUpstream[], now: Date): boolean {
  if (!slots.length) return true;
  return slots.every(
    (s) =>
      s.status === "disabled" ||
      (s.expiresAt != null && s.expiresAt.getTime() <= now.getTime()),
  );
}

async function evaluateAudience(
  user: User,
  rules: CampaignRules,
  now: Date,
  reasons: string[],
): Promise<void> {
  const audience = rules.audience;
  if (!audience) return;

  const unpaidOnly = Boolean(audience.unpaidOnly || audience.newUserOnly);
  if (unpaidOnly) {
    const hasPaid = await prisma.order.findFirst({
      where: {
        userId: user.id,
        status: { in: ["paid", "provisioning", "provisioned"] },
      },
      select: { id: true },
    });
    if (hasPaid) push(reasons, "campaign.audience_unpaid_only");
  }

  const ageMs = now.getTime() - user.createdAt.getTime();
  const ageDays = ageMs / 86400_000;

  if (audience.minRegisterDays != null && audience.minRegisterDays > 0) {
    if (ageDays < audience.minRegisterDays) {
      push(reasons, "campaign.audience_min_register_days");
    }
  }
  if (audience.maxRegisterDays != null && audience.maxRegisterDays >= 0) {
    if (ageDays > audience.maxRegisterDays) {
      push(reasons, "campaign.audience_max_register_days");
    }
  }

  // unpaid / new-user campaigns must not target users who still have a valid slot.
  const requireNoActive =
    Boolean(audience.requireNoActiveSubscription) || unpaidOnly;
  const requireExpiredOrNone =
    Boolean(audience.requireExpiredOrNone) || unpaidOnly;

  const needSubCheck =
    requireNoActive ||
    requireExpiredOrNone ||
    audience.requireActiveSubscription ||
    (audience.planIds != null && audience.planIds.length > 0);

  if (!needSubCheck) return;

  const slots = await prisma.userUpstream.findMany({
    where: { userId: user.id },
  });

  if (requireNoActive && hasActiveSlot(slots, now)) {
    push(reasons, "campaign.audience_no_active_sub");
  }
  if (requireExpiredOrNone && !allExpiredOrNone(slots, now)) {
    push(reasons, "campaign.audience_expired_or_none");
  }
  if (audience.requireActiveSubscription && !hasActiveSlot(slots, now)) {
    push(reasons, "campaign.audience_require_active_sub");
  }
  if (audience.planIds != null && audience.planIds.length > 0) {
    const owned = slots.some(
      (s) => s.planId != null && audience.planIds!.includes(s.planId),
    );
    if (!owned) push(reasons, "campaign.audience_plan_required");
  }
}

/**
 * Shared eligibility for list + participate.
 * Does not throw — callers map reasons[0] to HTTP errors when needed.
 */
export async function evaluateEligibility(
  ctx: EligibilityContext,
): Promise<EligibilityResult> {
  const now = ctx.now || new Date();
  const { campaign, user, client } = ctx;
  const packageId = ctx.packageId ?? user.sourcePackageId;
  const rules = asRules(campaign.rulesJson);
  const isMilestone = campaign.type === "invite_milestone";
  const periodKey = isMilestone
    ? MILESTONE_PERIOD_KEY
    : periodKeyFor(now, campaign.timezone);
  const limitPerUserPerDay = isMilestone
    ? 1
    : Math.max(1, rules.limitPerUserPerDay ?? 1);
  const limitPerUserTotal = isMilestone
    ? 1
    : rules.limitPerUserTotal == null
      ? null
      : Math.max(0, rules.limitPerUserTotal);

  const reasons: string[] = [];

  if (user.status !== "active") push(reasons, "user.disabled");
  if (campaign.projectId !== user.projectId) {
    push(reasons, "campaign.project_mismatch");
  }
  if (campaign.status !== "active") push(reasons, "campaign.not_active");
  if (!isWithinWindow(campaign, now)) push(reasons, "campaign.outside_window");
  if (!clientAllowed(campaign.clients, client)) {
    push(reasons, "campaign.client_not_allowed");
  }
  if (!packageAllowed(campaign.packages, packageId)) {
    push(reasons, "campaign.package_not_allowed");
  }

  await evaluateAudience(user, rules, now, reasons);

  const todayCount = await prisma.campaignClaim.count({
    where: {
      campaignId: campaign.id,
      userId: user.id,
      periodKey,
    },
  });
  if (!isMilestone && todayCount >= limitPerUserPerDay) {
    push(reasons, "campaign.daily_limit");
  }

  const totalWinCount = await prisma.campaignClaim.count({
    where: {
      campaignId: campaign.id,
      userId: user.id,
      result: { in: ["claimed", "won"] },
      ...(isMilestone ? { periodKey: MILESTONE_PERIOD_KEY } : {}),
    },
  });
  if (limitPerUserTotal != null && totalWinCount >= limitPerUserTotal) {
    push(reasons, "campaign.total_limit");
  }

  let inviteProgress: InviteProgress | undefined;
  if (isMilestone) {
    const invite = normalizeInviteFromRules(rules);
    const [currentCount, perInviteGrantedCount] = await Promise.all([
      countQualifiedInvites(user.id, campaign),
      prisma.campaignClaim.count({
        where: {
          campaignId: campaign.id,
          userId: user.id,
          periodKey: PER_INVITE_PERIOD_KEY,
          result: { in: ["claimed", "won"] },
        },
      }),
    ]);
    inviteProgress = {
      requiredCount: invite?.requiredCount ?? 0,
      currentCount,
      grantMode: invite?.grantMode ?? "claim",
      requirements: invite?.inviteeRequirements ?? emptyInviteeRequirements(),
      perInvitePlanId: invite?.perInvitePlanId ?? null,
      perInviteGrantedCount,
    };
    if (totalWinCount < 1) {
      if (!invite) push(reasons, "campaign.invite_misconfigured");
      else if (currentCount < invite.requiredCount) {
        push(reasons, "campaign.invite_progress");
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    periodKey,
    todayCount,
    totalWinCount,
    limitPerUserPerDay,
    limitPerUserTotal,
    nextAttemptIndex: isMilestone ? 1 : todayCount + 1,
    inviteProgress,
  };
}

export function eligibilityHttpError(reasons: string[]): Error {
  const code = reasons[0] || "campaign.not_eligible";
  const status =
    code === "campaign.daily_limit" || code === "campaign.total_limit"
      ? 429
      : code === "campaign.not_active" || code === "campaign.outside_window"
        ? 400
        : code === "user.disabled"
          ? 403
          : 403;
  return Object.assign(new Error(code), { statusCode: status, reasons });
}
