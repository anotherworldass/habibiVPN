"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "../lib/site";

const tabs = [
  { href: "/", label: "首页" },
  { href: "/plans", label: "套餐" },
  { href: "/invite", label: "邀请", badge: "有奖" },
  { href: "/account", label: "我的" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TgShell({
  children,
  hideNav = false,
  home = false,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
  /** Home owns a full brand stage — hide compact header. */
  home?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="tg-shell">
      {!home && (
        <header className="tg-header">
          <div className="tg-header-copy">
            <div className="tg-header-brand">{site.brand}</div>
            <p className="tg-header-slogan">{site.slogan}</p>
          </div>
        </header>
      )}

      <main className={`tg-main${home ? " tg-main--home" : ""}`}>{children}</main>

      {!hideNav && (
        <nav className="tg-tabbar" aria-label="主导航">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href);
            const badge = "badge" in tab ? tab.badge : undefined;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="tg-tab"
                data-active={active}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${tab.label}（${badge}）` : tab.label}
              >
                <span className="tg-tab-label">{tab.label}</span>
                {badge ? <span className="tg-tab-badge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
