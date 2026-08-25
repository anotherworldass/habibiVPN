"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "../lib/copy";
import { getToken } from "../lib/auth";
import { isInvitePath, stripLocale } from "../lib/locale";
import { site } from "../lib/site";
import AccountMenu from "./AccountMenu";
import LanguageSwitch from "./LanguageSwitch";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";

type ShellProps = {
  children: React.ReactNode;
  /** Full-bleed layout (landing hero). Children manage their own horizontal padding. */
  flush?: boolean;
  /** Narrow content column (login / register). */
  narrow?: boolean;
  /** Hide desktop and mobile navigation (authentication pages). */
  hideNavigation?: boolean;
};

const homeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4.5 11.5 12 5l7.5 6.5" />
    <path d="M6.5 10.5V19h11v-8.5" />
  </svg>
);

const plansIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

const connectIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </svg>
);

const accountIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="9" r="3.5" />
    <path d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5" />
  </svg>
);

function resolveHref(href: string, loggedIn: boolean) {
  if ((href === "/subscription" || href === "/account") && !loggedIn) {
    return "/login";
  }
  return href;
}

function isTabActive(pathname: string, href: string) {
  const path = stripLocale(pathname);
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export default function Shell({ children, flush, narrow, hideNavigation }: ShellProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const copy = t(locale);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  const guestTabs = [
    { href: "/plans", label: copy.nav.plans, icon: plansIcon },
  ];

  const appTabs = [
    { href: "/subscription", label: copy.nav.connect, icon: connectIcon },
    { href: "/plans", label: copy.nav.plans, icon: plansIcon },
  ];

  const accountTab = {
    href: "/account",
    label: copy.nav.account,
    icon: accountIcon,
  };

  const desktopTabs = loggedIn ? appTabs : guestTabs;
  const homeTab = { href: "/", label: copy.nav.home, icon: homeIcon };
  const mobileTabs = [homeTab, ...desktopTabs, accountTab];
  const showBrandBar = !isInvitePath(pathname);

  const shellClass = [
    "habibi-shell",
    flush ? "habibi-shell--flush" : "",
    narrow ? "habibi-shell--narrow" : "",
    hideNavigation ? "habibi-shell--no-nav" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const mainClass = [
    "habibi-main",
    flush ? "habibi-main--flush" : "",
    narrow ? "habibi-main--narrow" : "",
    hideNavigation ? "habibi-main--no-nav" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "";
  const footerLinks = [
    { href: "/nodes", label: copy.footer.nodes },
    { href: "/about", label: copy.footer.about },
    { href: "/privacy", label: copy.footer.privacy },
    { href: "/terms", label: copy.footer.terms },
  ];
  const footer = (
    <div className="footer-mini">
      <nav className="footer-mini-links" aria-label={copy.nav.footerAria}>
        {footerLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Suspense fallback={null}>
        <LanguageSwitch variant="footer" />
      </Suspense>
      {appVersion ? (
        <span className="footer-mini-version">{appVersion}</span>
      ) : null}
    </div>
  );

  return (
    <div className={shellClass}>
      {!hideNavigation && (
        <header className="habibi-topbar">
          <div className="habibi-topbar-inner">
            <div className="habibi-topbar-start">
              <Link href="/" className="habibi-topbar-brand">
                {site.brand}
              </Link>
              <Suspense fallback={null}>
                <LanguageSwitch variant="topbar" />
              </Suspense>
            </div>
            <div className="habibi-topbar-tools">
              <nav className="habibi-topbar-nav" aria-label={copy.common.navAria}>
                {desktopTabs.map((tab) => {
                  const active = isTabActive(pathname, tab.href);
                  const href = resolveHref(tab.href, loggedIn);
                  return (
                    <Link
                      key={tab.href}
                      href={href}
                      className="habibi-topbar-link"
                      data-active={active}
                      aria-current={active ? "page" : undefined}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </nav>
              <AccountMenu loggedIn={loggedIn} />
            </div>
          </div>
        </header>
      )}

      {showBrandBar && (
        <header className="habibi-brandbar">
          <div className="habibi-brandbar-inner">
            <div className="habibi-brandbar-row">
              <div className="habibi-brandbar-start">
                <Link href="/" className="habibi-brandbar-brand">
                  {site.brand}
                </Link>
                <Suspense fallback={null}>
                  <LanguageSwitch variant="topbar" />
                </Suspense>
              </div>
              {!hideNavigation ? <AccountMenu loggedIn={loggedIn} /> : null}
            </div>
            {site.slogan ? (
              <p className="habibi-brandbar-slogan">
                {locale === "en" ? copy.home.slogan : site.slogan}
              </p>
            ) : null}
          </div>
        </header>
      )}

      <main className={mainClass}>
        {children}
        {flush ? <div className="habibi-pad">{footer}</div> : footer}
      </main>

      {!hideNavigation && (
        <nav className="habibi-tabbar" aria-label={copy.common.navAria}>
          <div
            className={`habibi-tabbar-inner habibi-tabbar-inner--${mobileTabs.length}`}
          >
            {mobileTabs.map((tab) => {
              const active = isTabActive(pathname, tab.href);
              const href = resolveHref(tab.href, loggedIn);
              return (
                <Link
                  key={tab.href}
                  href={href}
                  className="habibi-tab"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
