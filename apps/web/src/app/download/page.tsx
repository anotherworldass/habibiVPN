"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import Shell from "../../components/Shell";
import { t } from "../../lib/copy";
import { downloadPlatforms, isPlaceholderUrl } from "../../lib/site";

const icons: Record<(typeof downloadPlatforms)[number]["id"], ReactNode> = {
  ios: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
    </svg>
  ),
  android: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.2 4.4v7.1H3V5.5Zm8.1-1.2L21 2.8v8.7h-9.9V4.3ZM3 13.5h7.2v7.1L3 19.5v-6Zm8.1 0H21v8.7l-9.9-1.4v-7.3Z" />
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
    </svg>
  ),
};

export default function DownloadPage() {
  const messages = t(useLocale());
  const copy = messages.download;
  const platformCopy = {
    ios: { cta: messages.downloadUi.ctaIos },
    android: { cta: messages.downloadUi.ctaAndroid },
    windows: { cta: messages.downloadUi.ctaWindows, hint: messages.downloadUi.hintDesktop },
    macos: { cta: messages.downloadUi.ctaMac, hint: messages.downloadUi.hintDesktop },
  } as const;
  const [toast, setToast] = useState("");
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setPageUrl(window.location.href.split("#")[0] || window.location.href);
  }, []);

  function onFakeDownload(label: string) {
    setToast(copy.toast(label));
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <Shell>
      <div className="download-page">
        <div className="download-main">
          <div className="page-head">
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
          </div>

          <div className="download-grid">
            {downloadPlatforms.map((item) => {
              const href = item.url();
              const placeholder = isPlaceholderUrl(href);
              const extra = platformCopy[item.id];
              return (
                <div key={item.id} className="download-card">
                  <div className="download-card-icon">{icons[item.id]}</div>
                  <div className="download-card-copy">
                    <h2>{item.label}</h2>
                    <p>{"hint" in extra ? extra.hint : item.hint}</p>
                  </div>
                  {placeholder ? (
                    <button
                      type="button"
                      className="btn btn-secondary download-card-cta"
                      onClick={() => onFakeDownload(item.label)}
                    >
                      {platformCopy[item.id].cta}
                    </button>
                  ) : (
                    <a
                      className="btn btn-primary download-card-cta"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {platformCopy[item.id].cta}
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {toast ? (
            <p className="download-toast alert-ok" role="status">
              {toast}
            </p>
          ) : null}

          <section className="download-notes" aria-labelledby="download-notes-title">
            <h2 id="download-notes-title">{copy.noteTitle}</h2>
            <ul>
              <li>
                <span>iOS</span>
                <p>{copy.noteIos}</p>
              </li>
              <li>
                <span>Android</span>
                <p>{copy.noteAndroid}</p>
              </li>
              <li>
                <span>Windows / macOS</span>
                <p>{copy.noteDesktop}</p>
              </li>
            </ul>
          </section>

          <p className="download-web-hint">
            {copy.webBefore}{" "}
            <Link href="/register">{copy.register}</Link>
            {" · "}
            <Link href="/guide">{copy.guide}</Link>
          </p>
        </div>

        {pageUrl ? (
          <aside className="invite-desktop-qr" aria-label={copy.qrAria}>
            <div className="invite-desktop-qr-card">
              <QRCodeSVG value={pageUrl} size={168} level="M" />
            </div>
            <p className="invite-desktop-qr-title">{copy.qrTitle}</p>
            <p className="invite-desktop-qr-hint">{copy.qrHint}</p>
          </aside>
        ) : null}
      </div>
    </Shell>
  );
}
