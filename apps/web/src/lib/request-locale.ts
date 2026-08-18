import { headers } from "next/headers";
import { DEFAULT_LOCALE, normalizeLocale, type SiteLocale } from "./locale";

export async function getRequestLocale(): Promise<SiteLocale> {
  const h = await headers();
  return normalizeLocale(h.get("x-habibi-locale")) ?? DEFAULT_LOCALE;
}

export async function getRequestPath(): Promise<string> {
  const h = await headers();
  return h.get("x-habibi-path") || "/";
}
