"use client";

import type { LegalDoc } from "../lib/legal";
import type { SiteLocale } from "../lib/locale";
import { site } from "../lib/site";
import DocPage from "./DocPage";
import Link from "./LocaleLink";
import { useLocale } from "./LocaleProvider";

type Props = {
  kind: "privacy" | "terms";
  getDoc: (locale: SiteLocale) => LegalDoc;
};

export default function LegalDocView({ kind, getDoc }: Props) {
  const locale = useLocale();
  const doc = getDoc(locale);
  const otherHref = kind === "privacy" ? "/terms" : "/privacy";
  const otherLabel = kind === "privacy" ? doc.relatedTerms : doc.relatedPrivacy;

  return (
    <DocPage
      title={doc.title}
      lead={doc.lead}
      footerAccountLabel={doc.footerAccount}
      footerHomeLabel={doc.footerHome}
    >
      <div className="doc-block" style={{ marginBottom: 4 }}>
        <p className="doc-muted" style={{ marginBottom: 10 }}>
          {doc.updatedLabel}
        </p>
      </div>

      {doc.blocks.map((block) => (
        <div className="doc-block" key={block.h3}>
          <h3>{block.h3}</h3>
          {block.paragraphs?.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {block.list ? (
            <ul className="doc-list">
              {block.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {block.muted?.map((p) => (
            <p className="doc-muted" key={p}>
              {p}
            </p>
          ))}
        </div>
      ))}

      <div className="doc-block">
        <p>
          <Link href={otherHref} className="doc-a">
            {otherLabel}
          </Link>
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>·</span>
          <Link href="/support" className="doc-a">
            {doc.relatedSupport}
          </Link>
          <span style={{ color: "var(--muted)", margin: "0 8px" }}>·</span>
          <a href={`mailto:${site.supportEmail}`} className="doc-a">
            {site.supportEmail}
          </a>
        </p>
      </div>
    </DocPage>
  );
}
