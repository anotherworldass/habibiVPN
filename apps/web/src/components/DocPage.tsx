"use client";

import Link from "next/link";
import Shell from "./Shell";

export default function DocPage({
  title,
  lead,
  children,
  footerAccountLabel = "返回我的",
  footerHomeLabel = "回首页",
  accountHref = "/account",
  homeHref = "/",
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  footerAccountLabel?: string;
  footerHomeLabel?: string;
  accountHref?: string;
  homeHref?: string;
}) {
  return (
    <Shell>
      <div className="page-head">
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      <div className="panel doc-panel" style={{ marginTop: 16 }}>
        {children}
      </div>
      <p style={{ marginTop: 16, textAlign: "center" }}>
        <Link
          href={accountHref}
          style={{ color: "var(--teal-deep)", fontSize: 13, fontWeight: 600 }}
        >
          {footerAccountLabel}
        </Link>
        <span style={{ color: "var(--muted)", margin: "0 8px" }}>·</span>
        <Link
          href={homeHref}
          style={{ color: "var(--teal-deep)", fontSize: 13, fontWeight: 600 }}
        >
          {footerHomeLabel}
        </Link>
      </p>
    </Shell>
  );
}
