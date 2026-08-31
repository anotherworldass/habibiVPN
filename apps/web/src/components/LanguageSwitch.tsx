"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { t } from "../lib/copy";
import { isInvitePath, localePath, type SiteLocale } from "../lib/locale";
import { useLocale, useSetLocale } from "./LocaleProvider";

export default function LanguageSwitch() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const copy = t(locale);
  const invite = isInvitePath(pathname);
  const params = new URLSearchParams(searchParams.toString());
  params.delete("lang");
  const query = params.toString();

  function hrefFor(next: SiteLocale) {
    const path = localePath(pathname, next);
    return query ? `${path}?${query}` : path;
  }

  const nextLocale: SiteLocale = locale === "zh" ? "en" : "zh";
  const nextLabel = nextLocale === "zh" ? copy.nav.zh : copy.nav.en;
  const compactLabel = nextLocale === "zh" ? "中" : "EN";
  const commonProps = {
    className: "lang-switch-toggle",
    "aria-label": `${copy.nav.langAria}: ${nextLabel}`,
    title: nextLabel,
  };
  const control = invite ? (
    <button
      type="button"
      {...commonProps}
      onClick={() => setLocale(nextLocale)}
    >
      <LanguageIcon />
      <span>{compactLabel}</span>
    </button>
  ) : (
    <a
      {...commonProps}
      href={hrefFor(nextLocale)}
      hrefLang={nextLocale === "zh" ? "zh-CN" : "en"}
    >
      <LanguageIcon />
      <span>{compactLabel}</span>
    </a>
  );

  return (
    <div className="lang-switch lang-switch--topbar legal-lang-switch">
      {control}
    </div>
  );
}

function LanguageIcon() {
  return (
    <svg
      className="lang-switch-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" />
      <path
        d="M2.75 10h14.5M10 2.5c2 2.05 3 4.55 3 7.5s-1 5.45-3 7.5c-2-2.05-3-4.55-3-7.5s1-5.45 3-7.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
