import { apiFetch } from "./api";
import { t } from "./copy";
import { type SiteLocale } from "./locale";

export type CampaignPlanBrief = {
  id: string;
  name: string;
  name_i18n?: Record<string, string> | null;
  description?: string | null;
  validity_seconds?: number | null;
  validity_calendar_months?: number | null;
  data_limit_bytes?: number | null;
  device_slots?: number | null;
};

export type CampaignUi = {
  title?: string | null;
  teaser?: string | null;
  subtitle?: string | null;
  button_text?: string | null;
  title_i18n?: Record<string, string> | null;
  teaser_i18n?: Record<string, string> | null;
  subtitle_i18n?: Record<string, string> | null;
  button_text_i18n?: Record<string, string> | null;
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

type CampaignCopySource = {
  required_count?: number;
  ui?: CampaignUi;
  reward?: { plan?: CampaignPlanBrief | null } | null;
  per_invite_plan?: CampaignPlanBrief | null;
  invite_progress?: {
    required_count?: number;
    per_invite_plan?: CampaignPlanBrief | null;
  };
};

function hasLocalizedCopy(map: Record<string, string> | null | undefined) {
  return !!map && Object.values(map).some((v) => !!v?.trim());
}

/** Prefer the current locale; don't leak another language into the page chrome. */
export function campaignText(
  locale: SiteLocale,
  i18n: Record<string, string> | null | undefined,
  resolved?: string | null,
): string {
  const exact = i18n?.[locale]?.trim();
  if (exact) return exact;
  if (hasLocalizedCopy(i18n)) return "";
  return resolved?.trim() || "";
}

export function campaignPlanName(
  locale: SiteLocale,
  plan: CampaignPlanBrief | null | undefined,
): string {
  if (!plan) return "";
  return campaignText(locale, plan.name_i18n, plan.name);
}

export function resolvedCampaignUi(ui: CampaignUi | null | undefined, locale: SiteLocale) {
  return {
    title: campaignText(locale, ui?.title_i18n, ui?.title),
    teaser: campaignText(locale, ui?.teaser_i18n, ui?.teaser),
    subtitle: campaignText(locale, ui?.subtitle_i18n, ui?.subtitle),
    button_text: campaignText(locale, ui?.button_text_i18n, ui?.button_text),
  };
}

export function pickInviteCampaign<T extends { type?: string }>(
  campaigns: T[] | undefined | null,
): T | null {
  const rows = campaigns || [];
  return rows.find((c) => c.type === "invite_milestone") || rows[0] || null;
}

export function inviteCampaignSummary(
  copy: ReturnType<typeof t>["activity"],
  campaign: CampaignCopySource,
  locale: SiteLocale,
): string {
  const n =
    campaign.invite_progress?.required_count ?? campaign.required_count ?? 0;
  const milestone = campaignPlanName(locale, campaign.reward?.plan);
  const per = campaignPlanName(
    locale,
    campaign.invite_progress?.per_invite_plan || campaign.per_invite_plan,
  );
  if (per && milestone) return copy.summaryBoth(per, n, milestone);
  if (milestone) return copy.summaryMilestone(n, milestone);
  if (per) return copy.summaryPerInvite(per);
  return resolvedCampaignUi(campaign.ui, locale).subtitle || copy.fallbackLead;
}

/** Homepage / account entry line. Prefer campaign teaser copy. */
export function inviteCampaignTeaser(
  copy: ReturnType<typeof t>["activity"],
  campaign: CampaignCopySource,
  locale: SiteLocale,
): string {
  return (
    resolvedCampaignUi(campaign.ui, locale).teaser ||
    inviteCampaignSummary(copy, campaign, locale)
  );
}

function localeQuery(locale?: SiteLocale) {
  return locale ? `?locale=${encodeURIComponent(locale)}` : "";
}

export async function fetchPublicInviteCampaign(
  locale?: SiteLocale,
): Promise<InviteCampaignPublic | null> {
  try {
    const res = await apiFetch<{ campaigns: InviteCampaignPublic[] }>(
      `/api/v1/campaigns/public${localeQuery(locale)}`,
    );
    return pickInviteCampaign(res.campaigns);
  } catch {
    return null;
  }
}

export async function fetchAuthInviteCampaign(
  locale?: SiteLocale,
): Promise<InviteCampaignAuth | null> {
  try {
    const res = await apiFetch<{ campaigns: InviteCampaignAuth[] }>(
      `/api/v1/campaigns${localeQuery(locale)}`,
    );
    const rows = (res.campaigns || []).filter((c) => c.type === "invite_milestone");
    return rows[0] || null;
  } catch {
    return null;
  }
}
