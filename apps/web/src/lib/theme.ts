export type SiteTheme = "gray" | "classic";

const STORAGE_KEY = "habibi_site_theme";

export function normalizeTheme(raw: string | null | undefined): SiteTheme | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "gray" || v === "grey" || v === "techgray" || v === "tech-gray") {
    return "gray";
  }
  if (v === "classic" || v === "teal" || v === "green") return "classic";
  return null;
}

/** Prefer ?theme= → localStorage → gray */
export function resolveSiteTheme(search?: string): SiteTheme {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(search ?? window.location.search);
    const fromQuery = normalizeTheme(params.get("theme"));
    if (fromQuery) return fromQuery;

    try {
      const fromStore = normalizeTheme(localStorage.getItem(STORAGE_KEY));
      if (fromStore) return fromStore;
    } catch {
      /* ignore */
    }
  }
  return "gray";
}

export function applySiteTheme(theme: SiteTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
