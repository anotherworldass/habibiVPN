"use client";

import Link from "next/link";
import { helpActionLinks } from "../lib/site";

export default function HelpLinks({ title = "帮助与支持" }: { title?: string }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
        {title}
      </h2>
      <div className="help-link-list">
        {helpActionLinks.map((item) => (
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
