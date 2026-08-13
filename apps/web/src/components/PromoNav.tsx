"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/promo", label: "概览", match: (p: string) => p === "/promo" },
  {
    href: "/promo/team",
    label: "邀请",
    match: (p: string) =>
      p === "/promo/team" ||
      p.startsWith("/promo/commissions") ||
      p.startsWith("/promo/orders"),
  },
  {
    href: "/promo/withdraw",
    label: "提现",
    match: (p: string) => p === "/promo/withdraw",
  },
] as const;

export default function PromoNav() {
  const pathname = usePathname();
  return (
    <nav className="promo-nav" aria-label="推广中心导航">
      {links.map((l) => {
        const active = l.match(pathname);
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
