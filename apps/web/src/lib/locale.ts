export type SiteLocale = "zh" | "en";

const STORAGE_KEY = "habibi_site_locale";

export function normalizeLocale(raw: string | null | undefined): SiteLocale | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "zh" || v.startsWith("zh-") || v === "zh_cn" || v === "zh_tw") {
    return "zh";
  }
  if (v === "en" || v.startsWith("en-")) return "en";
  return null;
}

/** Prefer ?lang= → localStorage → navigator.language → zh */
export function resolveSiteLocale(search?: string): SiteLocale {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(search ?? window.location.search);
    const fromQuery = normalizeLocale(params.get("lang"));
    if (fromQuery) return fromQuery;

    try {
      const fromStore = normalizeLocale(localStorage.getItem(STORAGE_KEY));
      if (fromStore) return fromStore;
    } catch {
      /* ignore */
    }

    const fromNav = normalizeLocale(navigator.language);
    if (fromNav) return fromNav;
  }
  return "zh";
}

export function persistSiteLocale(locale: SiteLocale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

export function withLang(href: string, locale: SiteLocale): string {
  const [path, hash = ""] = href.split("#");
  const url = new URL(path, "https://local.invalid");
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}
