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
      className={`legal-lang-switch lang-switch lang-switch--${variant}`}
      role="group"
      aria-label={copy.nav.langAria}
    >
      {SITE_LOCALES.map((item) => {
        const active = locale === item;
        const label = item === "zh" ? copy.nav.zh : copy.nav.en;
        if (invite) {
          return (
            <button
              key={item}
              type="button"
              className={active ? "is-active" : undefined}
              onClick={() => setLocale(item)}
            >
              {label}
            </button>
          );
        }
        return (
          <a
            key={item}
            href={hrefFor(item)}
            className={active ? "is-active" : undefined}
            hrefLang={item === "zh" ? "zh-CN" : "en"}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
