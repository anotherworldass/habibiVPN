"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken } from "../lib/auth";
import { legalFooterLinks, site } from "../lib/site";

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
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
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

const guestTabs = [
  { href: "/", label: "首页", icon: homeIcon },
  { href: "/plans", label: "套餐", icon: plansIcon },
  { href: "/account", label: "我的", icon: accountIcon },
];

const appTabs = [
  { href: "/", label: "首页", icon: homeIcon },
  { href: "/subscription", label: "连接", icon: connectIcon },
  { href: "/plans", label: "套餐", icon: plansIcon },
  { href: "/account", label: "我的", icon: accountIcon },
];

function resolveHref(href: string, loggedIn: boolean) {
  if ((href === "/subscription" || href === "/account") && !loggedIn) {
    return "/login";
  }
  return href;
}

function isTabActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Shell({ children, flush, narrow, hideNavigation }: ShellProps) {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, [pathname]);

  const tabs = loggedIn ? appTabs : guestTabs;
  // Invite landing already has its own brand block; flush hero does too.
  const showBrandBar = !flush && !pathname.startsWith("/invite");

  const shellClass = [
    "habibi-shell",
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

  const footer = (
    <nav className="footer-mini-links" aria-label="页脚链接">
      {legalFooterLinks.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className={shellClass}>
      {!hideNavigation && (
        <header className="habibi-topbar">
          <div className="habibi-topbar-inner">
            <Link href="/" className="habibi-topbar-brand">
              {site.brand}
            </Link>
            <nav className="habibi-topbar-nav" aria-label="主导航">
              {tabs.map((tab) => {
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
          </div>
        </header>
      )}

      {showBrandBar && (
        <header className="habibi-brandbar">
          <div className="habibi-brandbar-inner">
            <Link href="/" className="habibi-brandbar-brand">
              {site.brand}
            </Link>
            {site.slogan ? (
              <p className="habibi-brandbar-slogan">{site.slogan}</p>
            ) : null}
          </div>
        </header>
      )}

      <main className={mainClass}>
        {children}
        {flush ? <div className="habibi-pad">{footer}</div> : footer}
      </main>

      {!hideNavigation && (
        <nav className="habibi-tabbar" aria-label="主导航">
          <div
            className={`habibi-tabbar-inner habibi-tabbar-inner--${tabs.length}`}
          >
            {tabs.map((tab) => {
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
