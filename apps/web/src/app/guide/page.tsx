"use client";

import DocPage from "../../components/DocPage";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

export default function GuidePage() {
  const copy = t(useLocale()).guide;
  return (
    <DocPage title={copy.title} lead={copy.lead}>
      <div className="doc-block">
        <h3>{copy.s1Title}</h3>
        <p>
          {copy.s1Before}{" "}
          <Link href="/register" className="doc-a">
            {copy.s1Link}
          </Link>
          {copy.s1After}
        </p>
      </div>

      <div className="doc-block">
        <h3>{copy.s2Title}</h3>
        <p>
          {copy.s2Before}{" "}
          <Link href="/plans" className="doc-a">
            {copy.s2Link}
          </Link>{" "}
          {copy.s2After}
        </p>
      </div>

      <div className="doc-block">
        <h3>{copy.s3Title}</h3>
        <ol className="doc-list">
          <li>
            {copy.s3Li1Before}{" "}
            <Link href="/subscription" className="doc-a">
              {copy.s3Li1Link}
            </Link>
            {copy.s3Li1After}
          </li>
          <li>{copy.s3Li2}</li>
          <li>{copy.s3Li3}</li>
          <li>{copy.s3Li4}</li>
        </ol>
      </div>

      <div className="doc-block">
        <h3>{copy.faqTitle}</h3>
        <ul className="doc-list">
          <li>
            <strong>{copy.faq1Q}</strong>
            <br />
            {copy.faq1A}
          </li>
          <li>
            <strong>{copy.faq2Q}</strong>
            <br />
            {copy.faq2A}
          </li>
          <li>
            <strong>{copy.faq3Q}</strong>
            <br />
            {copy.faq3A}
          </li>
          <li>
            <strong>{copy.faq4Q}</strong>
            <br />
            {copy.faq4A}
          </li>
          <li>
            <strong>{copy.faq5Q}</strong>
            <br />
            {copy.faq5A}
          </li>
        </ul>
      </div>

      <Link href="/plans" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
        {copy.cta}
      </Link>
    </DocPage>
  );
}
