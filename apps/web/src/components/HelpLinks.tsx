"use client";

import type { ReactNode } from "react";
import { t } from "../lib/copy";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";

const downloadIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3.5v11" strokeLinecap="round" />
    <path d="m8 11.5 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 19.5h14" strokeLinecap="round" />
  </svg>
);

type HelpItem = {
  href: string;
  label: string;
  desc: string;
  download?: boolean;
  icon?: ReactNode;
};

export default function HelpLinks({ title }: { title?: string }) {
  const copy = t(useLocale());
  const items: HelpItem[] = [
    {
      href: "/download",
      download: true,
      icon: downloadIcon,
      ...copy.help.download,
    },
    { href: "/guide", ...copy.help.guide },
    { href: "/support", ...copy.help.support },
  ];

  return (
    <section style={{ marginTop: 22 }}>
      <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
        {title ?? copy.help.title}
      </h2>
      <div className="help-link-list">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.download
                ? "help-link-item help-link-item--download"
                : "help-link-item"
            }
          >
            {item.icon ? (
              <span className="help-link-icon" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            <div>
              <div className="help-link-label">{item.label}</div>
              <div className="help-link-desc">{item.desc}</div>
            </div>
            <span className="help-link-chevron" aria-hidden>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
