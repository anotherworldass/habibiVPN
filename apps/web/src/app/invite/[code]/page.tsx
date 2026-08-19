"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "../../../components/LocaleLink";
import { useLocale } from "../../../components/LocaleProvider";
import Shell from "../../../components/Shell";
import { t } from "../../../lib/copy";
import {
  downloadActionHref,
  fetchPublicDownloads,
  type DownloadItem,
} from "../../../lib/downloads";
import {
  INVITE_CODE_RE,
  normalizeInviteCode,
  saveInviteCode,
} from "../../../lib/invite";
import { site } from "../../../lib/site";
import { fetchSignupTrialPromo } from "../../../lib/signup-trial";

const iosIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
  </svg>
);

const androidIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
  </svg>
);

function StoreDownloadButton({
  download,
  label,
  kicker,
  icon,
  onUnavailable,
}: {
  download: DownloadItem | undefined;
  label: string;
  kicker: string;
  icon: ReactNode;
  onUnavailable: (label: string) => void;
}) {
  const inner = (
    <>
      <span className="invite-download-icon" aria-hidden>
        {icon}
      </span>
      <span>
        <small>{kicker}</small>
        {label}
      </span>
    </>
  );
  if (download?.action_url) {
    return (
      <a
        className="invite-download-btn"
        href={downloadActionHref(download)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className="invite-download-btn"
      onClick={() => onUnavailable(label)}
    >
      {inner}
    </button>
  );
}

export default function InviteLandingPage() {
  const messages = t(useLocale());
  const copy = messages.invite;
  const params = useParams<{ code: string }>();
  const code = normalizeInviteCode(
    typeof params.code === "string" ? params.code : Array.isArray(params.code) ? params.code[0] : "",
  );
  const valid = INVITE_CODE_RE.test(code);
  const registerHref = valid ? `/register?ref=${encodeURIComponent(code)}` : "/register";
  const [toast, setToast] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [trial, setTrial] = useState<{
    plan: string;
    web: boolean;
    app: boolean;
  } | null>(null);

  useEffect(() => {
    if (valid) saveInviteCode(code);
    setPageUrl(window.location.href.split("#")[0] || window.location.href);
    void fetchPublicDownloads()
      .then(setItems)
      .catch(() => setItems([]));
    void fetchSignupTrialPromo().then((promo) => {
      if (!promo.enabled || (!promo.web && !promo.app)) return;
      setTrial({
        plan: promo.plan?.name?.trim() || messages.home.trialPlanFallback,
        web: promo.web,
        app: promo.app,
      });
    });
  }, [code, valid, messages.home.trialPlanFallback]);

  function onVirtualDownload(label: string) {
    setToast(copy.toast(label));
    window.setTimeout(() => setToast(""), 2200);
  }

  const ios = items.find((item) => item.platform === "ios");
  const android = items.find((item) => item.platform === "android");

  return (
    <Shell narrow hideNavigation>
      <div className="invite-plain">
        <div className="invite-plain-main">
          <Link href="/" className="invite-plain-brand font-display">
            {site.brand}
          </Link>
          <h1 className="invite-plain-slogan font-display">{messages.home.slogan}</h1>
          {trial ? (
            <p className="invite-trial-chip">
              {trial.web ? copy.trialHint(trial.plan) : copy.trialHintApp(trial.plan)}
            </p>
          ) : null}
          <p className="invite-plain-lead">
            {valid
              ? trial
                ? trial.web
                  ? copy.validLeadTrial(trial.plan)
                  : copy.validLeadTrialApp(trial.plan)
                : copy.validLead
              : trial
                ? copy.invalidLeadTrial
                : copy.invalidLead}
          </p>

          {valid && (
            <div className="invite-plain-code" aria-label={copy.codeLabel}>
              <span>{copy.codeLabel}</span>
              <strong className="font-display">{code}</strong>
            </div>
          )}

          <div className="invite-plain-actions">
            <Link href={registerHref} className="btn btn-primary btn-block">
              {valid ? copy.join : copy.register}
            </Link>
            <Link href="/login" className="btn btn-secondary btn-block">
              {copy.login}
            </Link>
          </div>

          <div className="invite-download">
            <p className="invite-download-label">{copy.downloadLabel}</p>
            <div className="invite-download-row">
              <StoreDownloadButton
                download={ios}
                kicker="Download on the"
                label="App Store"
                icon={iosIcon}
                onUnavailable={onVirtualDownload}
              />
              <StoreDownloadButton
                download={android}
                kicker="Get it on"
                label="Android"
                icon={androidIcon}
                onUnavailable={onVirtualDownload}
              />
            </div>
            {toast ? <p className="invite-download-toast">{toast}</p> : null}
            <p className="invite-download-more">
              <Link href="/download">{copy.morePlatforms}</Link>
            </p>
          </div>
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
