"use client";

import DocPage from "../../components/DocPage";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";
import { site } from "../../lib/site";
import { openSupportChat } from "../../lib/support";

export default function SupportPage() {
  const copy = t(useLocale()).support;
  const mail = `mailto:${site.supportEmail}?subject=${encodeURIComponent(copy.mailSubject)}`;

  return (
    <DocPage title={copy.title} lead={copy.lead}>
      <div className="doc-block">
        <h3>{copy.chatTitle}</h3>
        <button
          type="button"
          className="about-contact-btn support-chat-entry"
          onClick={() => openSupportChat()}
        >
          <span className="about-contact-icon about-contact-icon--chat" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v7.5a2.25 2.25 0 0 1-2.25 2.25H9.3L5.4 19.8a.75.75 0 0 1-1.2-.6v-3.45A2.25 2.25 0 0 1 4.5 14.25v-7.5Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M8.25 9.75h7.5M8.25 12.75h4.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="about-contact-copy">
            <strong>{copy.chatTitle}</strong>
            <span>{copy.chatHint}</span>
          </span>
          <span className="about-contact-cta">{copy.chatCta}</span>
        </button>
      </div>

      <div className="doc-block">
        <h3>{copy.mailTitle}</h3>
        <p>
          <a href={mail} className="doc-a">
            {site.supportEmail}
          </a>
        </p>
        <p className="doc-muted">{copy.mailHint}</p>
      </div>

      {site.supportTelegram ? (
        <div className="doc-block">
          <h3>{copy.tgTitle}</h3>
          <p>
            <a
              href={site.supportTelegram}
              className="doc-a"
              target="_blank"
              rel="noreferrer"
            >
              {copy.tgLink}
            </a>
          </p>
        </div>
      ) : null}

      <div className="doc-block">
        <h3>{copy.tipsTitle}</h3>
        <ul className="doc-list">
          <li>{copy.tip1}</li>
          <li>{copy.tip2}</li>
          <li>{copy.tip3}</li>
        </ul>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 8 }}
        onClick={() => openSupportChat()}
      >
        {copy.chatCta}
      </button>
    </DocPage>
  );
}
