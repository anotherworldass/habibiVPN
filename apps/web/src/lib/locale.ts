export type SiteLocale = "zh" | "en";

export const SITE_LOCALES = ["zh", "en"] as const;
export const DEFAULT_LOCALE: SiteLocale = "zh";
export const LOCALE_COOKIE = "habibi_site_locale";
const STORAGE_KEY = LOCALE_COOKIE;

export function htmlLang(locale: SiteLocale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

export function normalizeLocale(raw: string | null | undefined): SiteLocale | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "zh" || v.startsWith("zh-") || v === "zh_cn" || v === "zh_tw") {
    return "zh";
  }
  if (v === "en" || v.startsWith("en-")) return "en";
  return null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): SiteLocale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    const found = normalizeLocale(tag);
    if (found) return found;
  }
  return null;
}

export function isLocalePrefix(segment: string): segment is SiteLocale {
  return segment === "zh" || segment === "en";
}

/** `/zh/about` → `/about`；`/en` → `/` */
export function stripLocale(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  const match = path.match(/^\/(zh|en)(?=\/|$)/);
  if (!match) return path || "/";
  const rest = path.slice(match[0].length);
  return rest || "/";
}

export function localeFromPathname(pathname: string): SiteLocale | null {
  const first = (pathname.split("?")[0] || "/").split("/").filter(Boolean)[0];
  return first && isLocalePrefix(first) ? first : null;
}

export function isInvitePath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return path === "/invite" || path.startsWith("/invite/");
}

function shouldSkipPrefix(path: string): boolean {
  return (
    path.startsWith("/invite") ||
    path.startsWith("/api") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon")
  );
}

/** `/about` + `en` → `/en/about`；邀请页不加前缀 */
export function localePath(href: string, locale: SiteLocale): string {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) return href;

  const [pathPart, hash = ""] = href.split("#");
  const [rawPath, query = ""] = pathPart.split("?");
  if (!rawPath.startsWith("/")) return href;
  if (shouldSkipPrefix(rawPath)) {
    return `${rawPath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }

  const stripped = stripLocale(rawPath);
  const prefixed = stripped === "/" ? `/${locale}` : `/${locale}${stripped}`;
  return `${prefixed}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

/** Prefer ?lang= → localStorage → navigator.language → zh */
export function resolveSiteLocale(search?: string): SiteLocale {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(search ?? window.location.search);
    const fromQuery = normalizeLocale(params.get("lang"));
    if (fromQuery) return fromQuery;

    const fromPath = localeFromPathname(window.location.pathname);
    if (fromPath) return fromPath;

    try {
      const fromStore = normalizeLocale(localStorage.getItem(STORAGE_KEY));
      if (fromStore) return fromStore;
    } catch {
      /* ignore */
    }

    const fromNav = normalizeLocale(navigator.language);
    if (fromNav) return fromNav;
  }
  return DEFAULT_LOCALE;
}

/** Pick CMS copy for the site locale (requested → en → zh → first non-empty). */
export function pickSiteCopy(
  map: Record<string, string> | null | undefined,
  locale: SiteLocale,
  fallback = "",
): string {
  if (!map) return fallback;
  const order = [locale, "en", "zh"];
  const seen = new Set<string>();
  for (const code of order) {
    if (seen.has(code)) continue;
    seen.add(code);
    const v = map[code]?.trim();
    if (v) return v;
  }
  for (const v of Object.values(map)) {
    const t = v?.trim();
    if (t) return t;
  }
  return fallback;
}

export function persistSiteLocale(locale: SiteLocale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = htmlLang(locale);
}

/** @deprecated use localePath */
export function withLang(href: string, locale: SiteLocale): string {
  return localePath(href, locale);
}
