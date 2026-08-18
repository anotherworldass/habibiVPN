"use client";

import DocPage from "../../components/DocPage";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

export default function AboutPage() {
  const copy = t(useLocale()).about;
  return (
    <DocPage title={copy.title} lead={copy.lead}>
      <div className="doc-block">
        <h3>{copy.whoTitle}</h3>
        <p>{copy.whoBody}</p>
      </div>

      <div className="doc-block">
        <h3>{copy.offerTitle}</h3>
        <ul className="doc-list">
          <li>{copy.offer1}</li>
          <li>{copy.offer2}</li>
          <li>{copy.offer3}</li>
          <li>{copy.offer4}</li>
        </ul>
      </div>

      <div className="doc-block">
        <h3>{copy.privacyTitle}</h3>
        <p className="doc-muted">
          {copy.privacyBefore}{" "}
          <Link href="/privacy" className="doc-a">
            {copy.privacyLink}
          </Link>
          {copy.privacyMid}{" "}
          <Link href="/terms" className="doc-a">
            {copy.termsLink}
          </Link>
          {copy.privacyAfter}
        </p>
      </div>

      <div className="doc-block">
        <h3>{copy.moreTitle}</h3>
        <p>
          {copy.moreBefore}{" "}
          <Link href="/guide" className="doc-a">
            {copy.guideLink}
          </Link>
          {copy.moreMid}{" "}
          <Link href="/support" className="doc-a">
            {copy.supportLink}
          </Link>
          {copy.moreAfter}
        </p>
      </div>
    </DocPage>
  );
}
