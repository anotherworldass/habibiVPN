"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { t } from "../lib/copy";
import { isInvitePath, localePath, SITE_LOCALES, type SiteLocale } from "../lib/locale";
import { useLocale, useSetLocale } from "./LocaleProvider";

export default function LanguageSwitch({
  variant,
}: {
  variant: "topbar" | "footer";
}) {
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

  if (variant === "topbar") {
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

  return (
    <div
      className={`lang-switch lang-switch--${variant}`}
      role="group"
      aria-label={copy.nav.langAria}
    >
      {SITE_LOCALES.map((item, index) => {
        const active = locale === item;
        const label = item === "zh" ? copy.nav.zh : copy.nav.en;
        const className = active ? "is-active" : undefined;
        const control = invite ? (
          <button
            key={item}
            type="button"
            className={className}
            onClick={() => setLocale(item)}
          >
            {label}
          </button>
        ) : (
          <a
            key={item}
            href={hrefFor(item)}
            className={className}
            hrefLang={item === "zh" ? "zh-CN" : "en"}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </a>
        );
        if (variant === "footer" && index > 0) {
          return (
            <span key={item} className="lang-switch-pair">
              <span className="lang-switch-sep" aria-hidden>
                ·
              </span>
              {control}
            </span>
          );
        }
        return control;
      })}
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
