import { apiFetch } from "./api";

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

export type InviteCampaign = {
  id: string;
  type?: string;
  ui: CampaignUi;
  required_count?: number;
  grant_mode?: "auto" | "claim";
  already_participated?: boolean;
  can_participate?: boolean;
  reward: {
    plan: CampaignPlanBrief | null;
  } | null;
  per_invite_plan?: CampaignPlanBrief | null;
  requirements?: InviteRequirements;
  invite_progress?: {
    required_count: number;
    current_count: number;
    grant_mode: "auto" | "claim";
    per_invite_plan?: CampaignPlanBrief | null;
    per_invite_granted_count: number;
    requirements: InviteRequirements;
  };
};

export function pickInviteCampaign(
  campaigns: InviteCampaign[] | undefined | null,
): InviteCampaign | null {
  const rows = campaigns || [];
  return rows.find((c) => c.type === "invite_milestone") || null;
}

export async function fetchAuthInviteCampaign(): Promise<InviteCampaign | null> {
  try {
    const res = await apiFetch<{ campaigns: InviteCampaign[] }>(
      "/api/v1/campaigns",
    );
    return pickInviteCampaign(res.campaigns);
  } catch {
    return null;
  }
}

export function campaignSummary(c: InviteCampaign): string {
  const n =
    c.invite_progress?.required_count ?? c.required_count ?? 0;
  const milestone = c.reward?.plan?.name || "";
  const per =
    c.invite_progress?.per_invite_plan?.name || c.per_invite_plan?.name || "";
  if (per && milestone) return `每邀请 1 人送「${per}」，满 ${n} 人送「${milestone}」`;
  if (milestone) return `满 ${n} 人送「${milestone}」`;
  if (per) return `每邀请 1 人送「${per}」`;
  return c.ui.subtitle || c.ui.teaser || "邀请好友，领取活动奖励。";
}

export function requirementLines(reqs?: InviteRequirements | null): string[] {
  if (!reqs) return ["好友完成注册即算合格。"];
  const lines: string[] = [];
  if (reqs.paid) lines.push("好友需有实付订单");
  if (reqs.has_subscription) lines.push("好友需已开通订阅");
  if (reqs.has_traffic) {
    lines.push(reqs.min_traffic_bytes ? "好友需达到最低使用流量" : "好友需下载并使用");
  }
  return lines.length ? lines : ["好友完成注册即算合格。"];
}
