"use client";

import { usePathname } from "next/navigation";
import { t } from "../lib/copy";
import { stripLocale } from "../lib/locale";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";

export default function PromoNav() {
  const pathname = usePathname();
  const copy = t(useLocale()).promoNav;
  const links = [
    { href: "/promo", label: copy.overview, match: (p: string) => p === "/promo" },
    {
      href: "/promo/team",
      label: copy.invite,
      match: (p: string) =>
        p === "/promo/team" ||
        p.startsWith("/promo/commissions") ||
        p.startsWith("/promo/orders"),
    },
    {
      href: "/promo/withdraw",
      label: copy.withdraw,
      match: (p: string) => p === "/promo/withdraw",
    },
    {
      href: "/promo/redeem",
      label: copy.redeem,
      match: (p: string) => p === "/promo/redeem",
    },
  ] as const;

  return (
    <nav className="promo-nav" aria-label={copy.aria}>
      {links.map((l) => {
        const active = l.match(stripLocale(pathname));
        return (
          <Link
            key={l.href}
            href={l.href}
            className="promo-nav-item"
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
