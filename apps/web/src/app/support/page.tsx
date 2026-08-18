"use client";

import DocPage from "../../components/DocPage";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";
import { site } from "../../lib/site";

export default function SupportPage() {
  const copy = t(useLocale()).support;
  const mail = `mailto:${site.supportEmail}?subject=${encodeURIComponent(copy.mailSubject)}`;

  return (
    <DocPage title={copy.title} lead={copy.lead}>
      <div className="doc-block">
        <h3>{copy.chatTitle}</h3>
        <p>
          <Link href="/chat" className="doc-a">
            {copy.chatLink}
          </Link>
        </p>
        <p className="doc-muted">{copy.chatHint}</p>
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

      <a href={mail} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
        {copy.mailCta}
      </a>
    </DocPage>
  );
}
