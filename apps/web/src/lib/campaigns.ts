import { apiFetch } from "./api";
import { t } from "./copy";

export type CampaignPlanBrief = {
  id: string;
  name: string;
};

export type CampaignUi = {
  title?: string | null;
  teaser?: string | null;
  subtitle?: string | null;
  button_text?: string | null;
};

export type InviteRequirements = {
  paid: boolean;
  has_subscription: boolean;
  has_traffic: boolean;
  min_traffic_bytes: number | null;
};

export type InviteCampaignPublic = {
  id: string;
  type?: string;
  ui: CampaignUi;
  required_count: number;
  grant_mode?: "auto" | "claim";
  reward: {
    kind?: string;
    plan_id?: string | null;
    plan: CampaignPlanBrief | null;
  } | null;
  per_invite_plan: CampaignPlanBrief | null;
  requirements?: InviteRequirements;
};

export type InviteCampaignAuth = InviteCampaignPublic & {
  already_participated?: boolean;
  can_participate?: boolean;
  invite_progress?: {
    required_count: number;
    current_count: number;
    grant_mode: "auto" | "claim";
    plan_id?: string | null;
    per_invite_plan_id?: string | null;
    per_invite_plan?: CampaignPlanBrief | null;
    per_invite_granted_count: number;
    requirements: InviteRequirements;
  };
};

export function pickInviteCampaign<T extends { type?: string }>(
  campaigns: T[] | undefined | null,
): T | null {
  const rows = campaigns || [];
  return rows.find((c) => c.type === "invite_milestone") || rows[0] || null;
}

export function inviteCampaignSummary(
  copy: ReturnType<typeof t>["activity"],
  campaign: {
    required_count?: number;
    ui?: CampaignUi;
    reward?: { plan?: CampaignPlanBrief | null } | null;
    per_invite_plan?: CampaignPlanBrief | null;
    invite_progress?: {
      required_count?: number;
      per_invite_plan?: CampaignPlanBrief | null;
    };
  },
): string {
  const n =
    campaign.invite_progress?.required_count ?? campaign.required_count ?? 0;
  const milestone = campaign.reward?.plan?.name?.trim() || "";
  const per =
    campaign.invite_progress?.per_invite_plan?.name?.trim() ||
    campaign.per_invite_plan?.name?.trim() ||
    "";
  if (per && milestone) return copy.summaryBoth(per, n, milestone);
  if (milestone) return copy.summaryMilestone(n, milestone);
  if (per) return copy.summaryPerInvite(per);
  return campaign.ui?.subtitle?.trim() || copy.fallbackLead;
}

/** Homepage / account entry line. Prefer campaign teaser copy. */
export function inviteCampaignTeaser(
  copy: ReturnType<typeof t>["activity"],
  campaign: Parameters<typeof inviteCampaignSummary>[1],
): string {
  return campaign.ui?.teaser?.trim() || inviteCampaignSummary(copy, campaign);
}

export async function fetchPublicInviteCampaign(): Promise<InviteCampaignPublic | null> {
  try {
    const res = await apiFetch<{ campaigns: InviteCampaignPublic[] }>(
      "/api/v1/campaigns/public",
    );
    return pickInviteCampaign(res.campaigns);
  } catch {
    return null;
  }
}

export async function fetchAuthInviteCampaign(): Promise<InviteCampaignAuth | null> {
  try {
    const res = await apiFetch<{ campaigns: InviteCampaignAuth[] }>(
      "/api/v1/campaigns",
    );
    const rows = (res.campaigns || []).filter((c) => c.type === "invite_milestone");
    return rows[0] || null;
  } catch {
    return null;
  }
}
