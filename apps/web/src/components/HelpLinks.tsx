"use client";

import { t } from "../lib/copy";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";

export default function HelpLinks({ title }: { title?: string }) {
  const copy = t(useLocale());
  const items = [
    { href: "/download", ...copy.help.download },
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
          <Link key={item.href} href={item.href} className="help-link-item">
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
