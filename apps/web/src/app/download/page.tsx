"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { platformIcons } from "../../components/PlatformIcons";
import Shell from "../../components/Shell";
import { t } from "../../lib/copy";
import {
  downloadActionHref,
  fetchPublicDownloads,
  type DownloadItem,
} from "../../lib/downloads";
import { downloadPlatforms } from "../../lib/site";

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
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [packageLanding, setPackageLanding] = useState(false);

  useEffect(() => {
    setPageUrl(window.location.href.split("#")[0] || window.location.href);
    const params = new URLSearchParams(window.location.search);
    const packageName = params.get("pkg")?.trim() || "";
    const platform = params.get("platform")?.trim() || "";
    setPackageLanding(Boolean(packageName));
    void fetchPublicDownloads({ packageName, platform })
      .then(setItems)
      .catch(() => setItems([]));
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
            {downloadPlatforms
              .filter((platform) =>
                packageLanding
                  ? items.some((item) => item.platform === platform.id)
                  : true,
              )
              .map((item) => {
                const download = items.find(
                  (candidate) => candidate.platform === item.id,
                );
                const placeholder = !download?.action_url;
                const href = download ? downloadActionHref(download) : "#";
                const extra = platformCopy[item.id];
                return (
                  <div key={item.id} className="download-card">
                    <div className="download-card-icon">{platformIcons[item.id]}</div>
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
