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

  return (
    <div
      className={`lang-switch lang-switch--${variant}${variant === "topbar" ? " legal-lang-switch" : ""}`}
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
