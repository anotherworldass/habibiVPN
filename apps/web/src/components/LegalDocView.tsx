"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LegalDoc } from "../lib/legal";
import {
  persistSiteLocale,
  resolveSiteLocale,
  type SiteLocale,
  withLang,
} from "../lib/locale";
import { site } from "../lib/site";
import DocPage from "./DocPage";

type Props = {
  kind: "privacy" | "terms";
  getDoc: (locale: SiteLocale) => LegalDoc;
};

export default function LegalDocView({ kind, getDoc }: Props) {
  const [locale, setLocale] = useState<SiteLocale>("zh");

  useEffect(() => {
    const next = resolveSiteLocale();
    setLocale(next);
    persistSiteLocale(next);
  }, []);

  const doc = useMemo(() => getDoc(locale), [getDoc, locale]);

  function switchLocale(next: SiteLocale) {
    setLocale(next);
    persistSiteLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  const otherHref =
    kind === "privacy"
      ? withLang("/terms", locale)
      : withLang("/privacy", locale);

  const otherLabel =
    kind === "privacy" ? doc.relatedTerms : doc.relatedPrivacy;

  return (
    <DocPage
      title={doc.title}
      lead={doc.lead}
      footerAccountLabel={doc.footerAccount}
      footerHomeLabel={doc.footerHome}
      accountHref={withLang("/account", locale)}
      homeHref={withLang("/", locale)}
    >
      <div className="doc-block" style={{ marginBottom: 4 }}>
        <p className="doc-muted" style={{ marginBottom: 10 }}>
          {doc.updatedLabel}
        </p>
        <div className="legal-lang-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={locale === "zh" ? "is-active" : undefined}
            onClick={() => switchLocale("zh")}
          >
            {doc.switchToZh}
          </button>
          <button
            type="button"
            className={locale === "en" ? "is-active" : undefined}
            onClick={() => switchLocale("en")}
          >
            {doc.switchToEn}
          </button>
        </div>
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
          <Link href={withLang("/support", locale)} className="doc-a">
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
