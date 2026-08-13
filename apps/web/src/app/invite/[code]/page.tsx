"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Shell from "../../../components/Shell";
import {
  INVITE_CODE_RE,
  normalizeInviteCode,
  saveInviteCode,
} from "../../../lib/invite";
import { isPlaceholderUrl, site } from "../../../lib/site";

export default function InviteLandingPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeInviteCode(
    typeof params.code === "string" ? params.code : Array.isArray(params.code) ? params.code[0] : "",
  );
  const valid = INVITE_CODE_RE.test(code);
  const registerHref = valid ? `/register?ref=${encodeURIComponent(code)}` : "/register";
  const [toast, setToast] = useState("");
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    if (valid) saveInviteCode(code);
    setPageUrl(window.location.href.split("#")[0] || window.location.href);
  }, [code, valid]);

  function onVirtualDownload(label: string) {
    setToast(`${label}即将上线，请先网页注册使用`);
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <Shell narrow hideNavigation>
      <div className="invite-plain">
        <div className="invite-plain-main">
          <p className="invite-plain-brand font-display">{site.brand}</p>
          <h1 className="invite-plain-slogan font-display">{site.slogan}</h1>
          <p className="invite-plain-lead">
            {valid
              ? "好友邀请你加入。下载 App 或网页注册，即可领取套餐。"
              : "邀请链接无效，你仍可直接注册开始使用。"}
          </p>

          {valid && (
            <div className="invite-plain-code" aria-label="邀请码">
              <span>邀请码</span>
              <strong className="font-display">{code}</strong>
            </div>
          )}

          <div className="invite-plain-actions">
            <Link href={registerHref} className="btn btn-primary btn-block">
              {valid ? `加入 ${site.brand}` : "去注册"}
            </Link>
            <Link href="/login" className="btn btn-secondary btn-block">
              已有账号
            </Link>
          </div>

          <div className="invite-download">
            <p className="invite-download-label">下载 App</p>
            <div className="invite-download-row">
              {isPlaceholderUrl(site.appStoreUrl) ? (
                <button
                  type="button"
                  className="invite-download-btn"
                  onClick={() => onVirtualDownload("App Store")}
                >
                  <span className="invite-download-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
                    </svg>
                  </span>
                  <span>
                    <small>Download on the</small>
                    App Store
                  </span>
                </button>
              ) : (
                <a
                  className="invite-download-btn"
                  href={site.appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="invite-download-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
                    </svg>
                  </span>
                  <span>
                    <small>Download on the</small>
                    App Store
                  </span>
                </a>
              )}

              {isPlaceholderUrl(site.androidApkUrl) && isPlaceholderUrl(site.playStoreUrl) ? (
                <button
                  type="button"
                  className="invite-download-btn"
                  onClick={() => onVirtualDownload("Android")}
                >
                  <span className="invite-download-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
                    </svg>
                  </span>
                  <span>
                    <small>Get it on</small>
                    Android
                  </span>
                </button>
              ) : (
                <a
                  className="invite-download-btn"
                  href={
                    isPlaceholderUrl(site.androidApkUrl)
                      ? site.playStoreUrl
                      : site.androidApkUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="invite-download-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
                    </svg>
                  </span>
                  <span>
                    <small>Get it on</small>
                    Android
                  </span>
                </a>
              )}
            </div>
            {toast ? <p className="invite-download-toast">{toast}</p> : null}
            <p className="invite-download-more">
              <Link href="/download">Windows / macOS 等全部平台</Link>
            </p>
          </div>
        </div>

        {pageUrl ? (
          <aside className="invite-desktop-qr" aria-label="手机扫码打开">
            <div className="invite-desktop-qr-card">
              <QRCodeSVG value={pageUrl} size={168} level="M" />
            </div>
            <p className="invite-desktop-qr-title">手机扫码打开</p>
            <p className="invite-desktop-qr-hint">用手机浏览器扫码</p>
          </aside>
        ) : null}
      </div>
    </Shell>
  );
}
