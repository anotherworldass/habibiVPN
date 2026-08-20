"use client";

import DocPage from "../../components/DocPage";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";
import { site } from "../../lib/site";

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
        <h3>{copy.contactTitle}</h3>
        <div className="about-contact-grid">
          <a
            className="about-contact-btn"
            href={site.supportTelegram}
            target="_blank"
            rel="noreferrer"
          >
            <span className="about-contact-icon about-contact-icon--telegram" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.9 4.3c.2-.9-.7-1.6-1.5-1.3L2.7 9.4c-.9.3-.9 1.6.1 1.9l4.6 1.4 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.6 4.6 3.4c.7.5 1.7.1 1.9-.7l2.7-14.5ZM8.4 12.7l9.3-5.7-7.3 7.9-.3 2.5-1.7-4.7Z" />
              </svg>
            </span>
            <span className="about-contact-copy">
              <strong>{copy.tgLabel}</strong>
              <span>{copy.tgHint}</span>
            </span>
            <span className="about-contact-cta">{copy.tgCta}</span>
          </a>
          <a
            className="about-contact-btn"
            href={site.twitterUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="about-contact-icon about-contact-icon--twitter" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.2 2.3h3.3l-7.2 8.2L23 21.7h-6.6l-5.2-6.8-5.9 6.8H1.9l7.7-8.8L1 2.3h6.8l4.7 6.2 5.7-6.2Zm-1.2 17.4h1.8L7 4.1H5L17 19.7Z" />
              </svg>
            </span>
            <span className="about-contact-copy">
              <strong>{copy.twitterLabel}</strong>
              <span>{copy.twitterHint}</span>
            </span>
            <span className="about-contact-cta">{copy.twitterCta}</span>
          </a>
        </div>
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
