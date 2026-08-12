import type { ClientChannel } from "@prisma/client";
import {
  normalizeAppCopyI18n,
  pickAppCopy,
  type AppCopyI18n,
} from "@habibi/shared";

export type CampaignAudienceRules = {
  /** No paid/provisioned orders (alias: unpaidOnly) */
  newUserOnly?: boolean;
  unpaidOnly?: boolean;
  /** Must have been registered at least N days */
  minRegisterDays?: number;
  /** Must have been registered at most N days (new-user window) */
  maxRegisterDays?: number;
  /** Block users who currently have a non-expired active slot */
  requireNoActiveSubscription?: boolean;
  /** Only users with no slot, or all slots expired */
  requireExpiredOrNone?: boolean;
  /** Must have at least one non-expired active slot */
  requireActiveSubscription?: boolean;
  /** Must own a UserUpstream for one of these plan ids (any status) */
  planIds?: string[];
};

export type CampaignRules = {
  limitPerUserPerDay?: number;
  limitPerUserTotal?: number | null;
  lottery?: {
    /** Win probability in basis points (10000 = 100%) */
    winRateBps?: number;
    /** Cap of wins across all users for the periodKey day */
    maxWinsPerDayGlobal?: number | null;
  };
  audience?: CampaignAudienceRules;
};

export type CampaignUi = {
  /** Resolved display strings (legacy + zh convenience) */
  title?: string;
  subtitle?: string;
  button_text?: string;
  title_i18n?: AppCopyI18n;
  subtitle_i18n?: AppCopyI18n;
  button_text_i18n?: AppCopyI18n;
  [key: string]: unknown;
};

export type ParticipateInput = {
  campaignId: string;
  userId: string;
  projectId: string;
  client: ClientChannel;
  /** AppPackage id; falls back to user.sourcePackageId */
  packageId?: string | null;
};

export function asRules(raw: unknown): CampaignRules {
  if (!raw || typeof raw !== "object") return {};
  return raw as CampaignRules;
}

export function asUi(raw: unknown): CampaignUi {
  if (!raw || typeof raw !== "object") return {};
  return raw as CampaignUi;
}

function migrateFlatToI18n(
  map: Record<string, string>,
  flat: unknown,
): Record<string, string> {
  if (Object.keys(map).length) return map;
  if (typeof flat === "string" && flat.trim()) {
    return { zh: flat.trim() };
  }
  return map;
}

/** Normalize uiJson for storage: i18n maps + legacy flat fields. */
export function normalizeCampaignUi(
  raw: unknown,
  fallbackTitle?: string,
): CampaignUi {
  const ui = asUi(raw);
  let titleI18n = normalizeAppCopyI18n(ui.title_i18n, 200);
  let subtitleI18n = normalizeAppCopyI18n(ui.subtitle_i18n, 500);
  let buttonI18n = normalizeAppCopyI18n(
    ui.button_text_i18n ?? ui.buttonText_i18n,
    80,
  );

  titleI18n = migrateFlatToI18n(titleI18n, ui.title);
  subtitleI18n = migrateFlatToI18n(subtitleI18n, ui.subtitle);
  buttonI18n = migrateFlatToI18n(
    buttonI18n,
    ui.button_text ?? ui.buttonText,
  );

  if (!Object.keys(titleI18n).length && fallbackTitle?.trim()) {
    titleI18n = { zh: fallbackTitle.trim() };
  }

  const title =
    pickAppCopy(titleI18n, "zh").text ||
    pickAppCopy(titleI18n, "en").text ||
    fallbackTitle?.trim() ||
    undefined;
  const subtitle =
    pickAppCopy(subtitleI18n, "zh").text ||
    pickAppCopy(subtitleI18n, "en").text ||
    undefined;
  const buttonText =
    pickAppCopy(buttonI18n, "zh").text ||
    pickAppCopy(buttonI18n, "en").text ||
    undefined;

  return {
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(buttonText ? { button_text: buttonText } : {}),
    title_i18n: titleI18n,
    subtitle_i18n: subtitleI18n,
    button_text_i18n: buttonI18n,
  };
}

/** Resolve campaign UI for a client locale. */
export function resolveCampaignUiPublic(
  raw: unknown,
  locale: string | null | undefined,
): {
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  title_i18n: Record<string, string>;
  subtitle_i18n: Record<string, string>;
  button_text_i18n: Record<string, string>;
} {
  const normalized = normalizeCampaignUi(raw);
  const titleI18n = normalizeAppCopyI18n(normalized.title_i18n, 200);
  const subtitleI18n = normalizeAppCopyI18n(normalized.subtitle_i18n, 500);
  const buttonI18n = normalizeAppCopyI18n(normalized.button_text_i18n, 80);
  return {
    title: pickAppCopy(titleI18n, locale).text,
    subtitle: pickAppCopy(subtitleI18n, locale).text,
    button_text: pickAppCopy(buttonI18n, locale).text,
    title_i18n: titleI18n,
    subtitle_i18n: subtitleI18n,
    button_text_i18n: buttonI18n,
  };
}

/** Calendar day key in campaign timezone, e.g. 2026-07-25 */
export function periodKeyFor(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}
