/** Shared API path prefixes */
export const USER_API_PREFIX = "/api/v1";
export const ADMIN_API_PREFIX = "/admin/v1";

/**
 * Built-in locales for App copy (update title / changelog, …).
 * Append entries here to extend; Admin/API read this list.
 */
export const APP_COPY_LOCALES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
] as const;

export type AppCopyLocale = (typeof APP_COPY_LOCALES)[number]["code"];

export const APP_COPY_LOCALE_CODES: readonly AppCopyLocale[] = APP_COPY_LOCALES.map(
  (l) => l.code,
);

/** Map locale code → non-empty string */
export type AppCopyI18n = Partial<Record<string, string>>;

/** Normalize Accept-Language / app locale → known code (fallback zh). */
export function resolveAppCopyLocale(raw: string | null | undefined): AppCopyLocale {
  if (!raw) return "zh";
  const primary = raw.trim().toLowerCase().split(",")[0]?.split(";")[0]?.trim() || "";
  if (primary === "zh" || primary.startsWith("zh-")) return "zh";
  if (primary === "en" || primary.startsWith("en-")) return "en";
  const exact = APP_COPY_LOCALE_CODES.find((c) => c === primary);
  if (exact) return exact;
  return "zh";
}

/**
 * Pick copy for a locale with fallbacks: requested → en → zh → first non-empty.
 */
export function pickAppCopy(
  map: AppCopyI18n | null | undefined,
  locale: string | null | undefined,
): { text: string | null; locale: string | null } {
  if (!map || typeof map !== "object") return { text: null, locale: null };
  const wanted = resolveAppCopyLocale(locale);
  const order = [wanted, "en", "zh", ...APP_COPY_LOCALE_CODES];
  const seen = new Set<string>();
  for (const code of order) {
    if (seen.has(code)) continue;
    seen.add(code);
    const v = map[code]?.trim();
    if (v) return { text: v, locale: code };
  }
  for (const [code, v] of Object.entries(map)) {
    const t = v?.trim();
    if (t) return { text: t, locale: code };
  }
  return { text: null, locale: null };
}

/** Strip empty keys; keep only string values. Unknown locale keys allowed for forward-compat. */
export function normalizeAppCopyI18n(
  input: unknown,
  maxLen = 8000,
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim().toLowerCase().slice(0, 16);
    if (!key || typeof v !== "string") continue;
    const text = v.trim();
    if (!text) continue;
    out[key] = text.slice(0, maxLen);
  }
  return out;
}

export type ApiErrorBody = {
  error: string;
  message?: string;
  request_id?: string;
};

export type SubscriptionView = {
  status: "none" | "active" | "expired" | "disabled";
  expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  subscription_url: string | null;
  online_ip_limit: number | null;
};

export type ClientChannel =
  | "ios_appstore"
  | "ios_alt"
  | "android_play"
  | "android_direct"
  | "h5"
  | "windows"
  | "macos";

/** How the user prefers to connect (synced via GET /me + PATCH /me/preferences) */
export type ConnectMode = "unset" | "official_app" | "subscription_client";

export type ConnectPrefSource =
  | "onboarding"
  | "connect_page"
  | "settings"
  | "claim_prompt"
  | "inferred";

export type UserPreferencesView = {
  connect_mode: ConnectMode;
  connect_clients: string[];
  connect_pref_source: ConnectPrefSource | null;
  connect_pref_at: string | null;
};

/** Catalog display group from GET /plans `groups[]` */
export type PlanGroupView = {
  id: string;
  code: string;
  /** Localized for request locale (fallback en → zh) */
  name: string;
  name_i18n?: Record<string, string>;
  sort_order: number;
};

export type PlanView = {
  id: string;
  code: string;
  /** Localized for request locale (fallback en → zh) */
  name: string;
  description?: string | null;
  /** Full copy maps for client-side switching */
  name_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  price_cents: number;
  currency: string;
  /** Upstream WireRaw customer plan code, if mapped */
  upstream_plan_ref?: string | null;
  /** Entitlement grant seconds for provision */
  validity_seconds?: number | null;
  /**
   * Calendar months for provision expire_at (same day-of-month; mutually exclusive
   * with validity_seconds). e.g. 12 ≈ one natural year from purchase.
   */
  validity_calendar_months?: number | null;
  /**
   * Catalog billing cycle (seconds) for daily-price / compare.
   * Not used for WireRaw provision. Display fallback: billing_period ?? validity.
   */
  billing_period_seconds?: number | null;
  /** Derived: floor(price_cents * 86400 / period); period = billing_period ?? validity */
  daily_price_cents?: number | null;
  data_limit_bytes?: number | null;
  /**
   * Traffic cycle reset for upstream (WireRaw reset_policy).
   * no_reset = quota lasts until expiry; month = wipe used traffic each month, etc.
   */
  reset_policy?:
    | "no_reset"
    | "day"
    | "week"
    | "month"
    | "year"
    | "custom";
  /** Only when reset_policy=custom; Go duration e.g. "720h" */
  custom_reset_interval?: string | null;
  device_slots?: number;
  billing_type?: "one_time" | "renewable";
  is_free_claimable?: boolean;
  already_claimed?: boolean;
  can_repurchase?: boolean;
  payment_mode?: "inherit" | "iap_only" | "web_only" | "iap_or_web";
  store_product?: {
    store: "app_store" | "google_play";
    product_id: string;
    product_kind: string;
    /** Marketing / catalog only; ASC is source of truth at purchase */
    trial_days?: number | null;
  } | null;
  /** Catalog group id when group is enabled; null = ungrouped */
  group_id?: string | null;
  enabled: boolean;
};

/** Stored on AppPackage.clientConfig and returned by GET /api/v1/app/config */
export type AppClientFeatureFlags = {
  iap_enabled: boolean;
  promo_enabled: boolean;
};

export type AppClientSupport = {
  telegram: string | null;
  email: string | null;
};

export type AppClientConfigBody = {
  api_bases: string[];
  h5_bases: string[];
  support: AppClientSupport;
  feature_flags: AppClientFeatureFlags;
  /** Forward-compatible bag; clients must ignore unknown keys */
  extras: Record<string, unknown>;
};

export const DEFAULT_APP_CLIENT_FEATURE_FLAGS: AppClientFeatureFlags = {
  iap_enabled: true,
  promo_enabled: true,
};

export const DEFAULT_APP_CLIENT_SUPPORT: AppClientSupport = {
  telegram: null,
  email: null,
};

/** Normalize http(s) base URLs: trim, strip trailing slash, dedupe (order preserved). */
export function normalizeHttpBaseList(input: unknown, max = 32): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    let u = raw.trim();
    if (!u) continue;
    if (u.endsWith("/")) u = u.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(u)) continue;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

export function emptyAppClientConfigBody(): AppClientConfigBody {
  return {
    api_bases: [],
    h5_bases: [],
    support: { ...DEFAULT_APP_CLIENT_SUPPORT },
    feature_flags: { ...DEFAULT_APP_CLIENT_FEATURE_FLAGS },
    extras: {},
  };
}

/**
 * Display name for growth slots without a Plan (campaign / redeem create_campaign_slot).
 * Prefer campaign `ui.title_i18n` at grant time; fall back to these.
 */
export const DEFAULT_GROWTH_SLOT_NAME_I18N: Readonly<Record<string, string>> = {
  zh: "活动福利",
  en: "Promo reward",
};
