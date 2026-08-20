"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import TgShell from "../../components/TgShell";
import { apiFetch } from "../../lib/api";
import { clearToken, getToken, setToken } from "../../lib/auth";
import { buildTgClientMeta } from "../../lib/client-meta";
import { friendlyError } from "../../lib/errors";
import { type UserPreferences } from "../../lib/preferences";
import { ensureSession, getOrCreateDeviceId } from "../../lib/session";
import {
  appDownloadUrl,
  fetchTelegramChannelUrl,
  getCachedChannelUrl,
  isPlaceholderUrl,
  site,
  supportTelegramUrl,
} from "../../lib/site";
import {
  getTelegramUser,
  haptic,
  hapticSuccess,
  openExternal,
  openTelegramUrl,
} from "../../lib/telegram";

type Me = {
  id: string;
  uid?: number;
  email?: string | null;
  email_verified?: boolean;
  subscription_count?: number;
  invite_code?: string | null;
  is_anonymous?: boolean;
  preferences?: UserPreferences;
};

/** Auth responses omit preferences — keep the previous ones. */
function mergeMeUser(
  prev: Me | null,
  user: Me,
  patch?: Partial<Me>,
): Me {
  return {
    ...(prev || {}),
    ...user,
    ...patch,
    preferences: user.preferences ?? prev?.preferences,
  };
}

export default function TgAccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [tgName, setTgName] = useState("");
  const [bindOpen, setBindOpen] = useState(false);
  const [bindEmail, setBindEmail] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [bindPassword2, setBindPassword2] = useState("");
  const [binding, setBinding] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyDevCode, setVerifyDevCode] = useState("");
  const [sendingVerifyCode, setSendingVerifyCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [savingEmail, setSavingEmail] = useState(false);
  const [supportTg, setSupportTg] = useState("");
  const [channelUrl, setChannelUrl] = useState("");

  useEffect(() => {
    const user = getTelegramUser();
    if (user) {
      setTgName(
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          user.username ||
          "",
      );
    }
    setSupportTg(supportTelegramUrl());
    setChannelUrl(getCachedChannelUrl());

    let cancelled = false;
    // Channel URL is non-blocking — must not gate bind UI.
    void fetchTelegramChannelUrl().then((url) => {
      if (!cancelled) setChannelUrl(url);
    });

    (async () => {
      try {
        // Session first, then /me — parallel /me races bootstrap and often 401s.
        await ensureSession();
        if (cancelled) return;
        const meResult = await apiFetch<{ user: Me }>("/api/v1/me")
          .then((res) => ({ ok: true as const, res }))
          .catch((e) => ({ ok: false as const, e }));
        if (cancelled) return;
        if (meResult.ok) {
          setMe(meResult.res.user);
          if (meResult.res.user.email) {
            setVerifyEmail(meResult.res.user.email);
          }
        } else {
          setError(friendlyError(meResult.e, "加载失败"));
        }
        setSupportTg(supportTelegramUrl());
        // bind 可能稍后才写回 bot username
        window.setTimeout(() => {
          if (!cancelled) setSupportTg(supportTelegramUrl());
        }, 900);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyDownloadLink() {
    haptic("light");
    const url = appDownloadUrl();
    if (isPlaceholderUrl(url)) {
      setToast("下载页即将上线");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      hapticSuccess();
      setToast("下载链接已经复制，请在浏览器打开");
      window.setTimeout(() => setToast(""), 2800);
    } catch {
      setError("复制失败，请长按选择链接");
    }
  }

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const t = window.setTimeout(
      () => setVerifyCooldown((c) => c - 1),
      1000,
    );
    return () => window.clearTimeout(t);
  }, [verifyCooldown]);

  async function onSendVerifyCode() {
    const email = verifyEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("请输入有效邮箱");
      return;
    }
    haptic("light");
    setSendingVerifyCode(true);
    setError("");
    setVerifyDevCode("");
    try {
      if (!getToken()) {
        const token = await ensureSession();
        if (!token) throw new Error("请稍后重试登录");
      }
      const res = await apiFetch<{
        ok: true;
        expires_in_seconds: number;
        verify_code?: string;
      }>("/api/v1/auth/register/send-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          client_meta: buildTgClientMeta(getOrCreateDeviceId()),
        }),
      });
      setToast("验证码已发送，请查收邮件（含垃圾箱）");
      window.setTimeout(() => setToast(""), 2800);
      setVerifyCooldown(60);
      if (res.verify_code) {
        setVerifyDevCode(res.verify_code);
        setVerifyCode(res.verify_code);
      }
      hapticSuccess();
    } catch (err) {
      setError(friendlyError(err, "发送验证码失败"));
    } finally {
      setSendingVerifyCode(false);
    }
  }

  async function onConfirmVerify(e: FormEvent) {
    e.preventDefault();
    const email = verifyEmail.trim().toLowerCase();
    const code = verifyCode.trim();
    if (!email || !email.includes("@")) {
      setError("请输入有效邮箱");
      return;
    }
    if (!/^\d{4,12}$/.test(code)) {
      setError("请输入邮箱验证码");
      return;
    }
    haptic("medium");
    setVerifying(true);
    setError("");
    try {
      if (!getToken()) {
        const token = await ensureSession();
        if (!token) throw new Error("请稍后重试登录");
      }
      const res = await apiFetch<{ token: string; user: Me }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            code,
            client_meta: buildTgClientMeta(getOrCreateDeviceId()),
          }),
        },
      );
      if (res.token) setToken(res.token);
      setMe((prev) =>
        mergeMeUser(prev, res.user, {
          email: res.user.email ?? email,
          email_verified: !!res.user.email_verified,
          is_anonymous: false,
        }),
      );
      setVerifyCode("");
      setVerifyDevCode("");
      setToast("邮箱已验证，可在其他设备用该邮箱登录");
      window.setTimeout(() => setToast(""), 3200);
      hapticSuccess();
    } catch (err) {
      setError(friendlyError(err, "验证失败"));
    } finally {
      setVerifying(false);
    }
  }

  async function onSaveUnverifiedEmail() {
    const email = verifyEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("请输入有效邮箱");
      return;
    }
    if (me?.email && email === me.email.toLowerCase()) {
      setToast("邮箱未更改");
      window.setTimeout(() => setToast(""), 1800);
      return;
    }
    haptic("medium");
    setSavingEmail(true);
    setError("");
    try {
      if (!getToken()) {
        const token = await ensureSession();
        if (!token) throw new Error("请稍后重试登录");
      }
      const res = await apiFetch<{ token: string; user: Me }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            client_meta: buildTgClientMeta(getOrCreateDeviceId()),
          }),
        },
      );
      if (res.token) setToken(res.token);
      setMe((prev) =>
        mergeMeUser(prev, res.user, {
          email: res.user.email ?? email,
          email_verified: !!res.user.email_verified,
          is_anonymous: false,
        }),
      );
      setVerifyCode("");
      setVerifyDevCode("");
      setToast("邮箱已更新（仍未验证），可点验证发送验证码");
      window.setTimeout(() => setToast(""), 3200);
      hapticSuccess();
    } catch (err) {
      setError(friendlyError(err, "保存失败"));
    } finally {
      setSavingEmail(false);
    }
  }

  async function onBindEmail(e: FormEvent) {
    e.preventDefault();
    const email = bindEmail.trim().toLowerCase();
    const password = bindPassword;
    if (!email || !email.includes("@")) {
      setError("请输入有效邮箱");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    if (password !== bindPassword2) {
      setError("两次输入的密码不一致");
      return;
    }

    haptic("medium");
    setBinding(true);
    setError("");
    try {
      if (!getToken()) {
        const token = await ensureSession();
        if (!token) throw new Error("请稍后重试登录");
      }
      const res = await apiFetch<{
        token: string;
        user: Me;
      }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          client_meta: buildTgClientMeta(getOrCreateDeviceId()),
        }),
      });
      if (res.token) setToken(res.token);
      setMe((prev) =>
        mergeMeUser(prev, res.user, {
          email: res.user.email ?? email,
          email_verified: !!res.user.email_verified,
          is_anonymous: false,
        }),
      );
      setBindOpen(false);
      setBindPassword("");
      setBindPassword2("");
      setVerifyEmail(res.user.email ?? email);
      setToast(
        res.user.email_verified
          ? "邮箱已绑定并验证，可在其他设备用该邮箱登录"
          : "邮箱已绑定（未验证）。可点右侧「验证」发送验证码",
      );
      window.setTimeout(() => setToast(""), 4200);
      hapticSuccess();
    } catch (err) {
      setError(friendlyError(err, "绑定失败"));
    } finally {
      setBinding(false);
    }
  }

  const uidText = ready ? (me?.uid != null ? String(me.uid) : "—") : "…";
  const planCount = ready ? (me?.subscription_count ?? 0) : null;
  const needsEmailBind = ready && (!me?.email || me.is_anonymous);

  return (
    <TgShell>
      <h1 className="page-title">我的账号</h1>
      <p className="page-lead">账号信息、连接入口与下载。</p>

      {error && <p className="alert-error">{error}</p>}
      {toast && <p className="alert-ok">{toast}</p>}

      <div className="card">
        <div className="plan-card-top">
          <span className="badge badge--ok">UID {uidText}</span>
          {planCount != null && (
            <span className="muted">{planCount} 个套餐</span>
          )}
        </div>
        <h2 style={{ marginTop: 12 }}>
          {tgName || me?.email || site.brand}
        </h2>
        <p>
          {me?.email
            ? me.email
            : "Telegram 访客会话，可直接领取与购买。绑定邮箱后可在其他设备登录。"}
        </p>
        <div className="stack" style={{ marginTop: 16 }}>
          <Link href="/connect" className="btn btn-primary btn-block">
            打开我的套餐
          </Link>
          <Link href="/" className="btn btn-secondary btn-block">
            免费领取套餐
          </Link>
        </div>
      </div>

      {ready && (
        <section
          className="bind-card"
          aria-labelledby={
            me?.email_verified ? undefined : "bind-device-title"
          }
          aria-label={me?.email_verified ? "跨设备登录" : undefined}
        >
          <p className="bind-card-kicker">跨设备登录</p>
          {me?.email_verified ? (
            <>
              <div className="bind-card-email">
                <span className="bind-card-email-text">{me.email}</span>
                <span className="bind-card-email-tag">已验证</span>
              </div>
              {site.website ? (
                <div className="stack" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    onClick={() => openExternal(site.website)}
                  >
                    打开官网登录
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h2 id="bind-device-title" className="bind-card-title">
                我需要在其他设备登录此账号
              </h2>
              {needsEmailBind ? (
              <>
                <p className="bind-card-lead">
                  绑定邮箱并设置密码后，可在官网、独立 App 或其他设备用同一账号登录，套餐与 UID
                  不变。
                </p>
                {!bindOpen ? (
                  <div className="stack" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-block"
                      onClick={() => {
                        haptic("light");
                        setBindOpen(true);
                        setError("");
                      }}
                    >
                      绑定邮箱
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(e) => void onBindEmail(e)}>
                    <label className="tg-field">
                      <span className="tg-field-label">邮箱</span>
                      <input
                        className="tg-field-input"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={bindEmail}
                        onChange={(ev) => setBindEmail(ev.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <label className="tg-field">
                      <span className="tg-field-label">密码（至少 6 位）</span>
                      <input
                        className="tg-field-input"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={bindPassword}
                        onChange={(ev) => setBindPassword(ev.target.value)}
                        placeholder="设置登录密码"
                      />
                    </label>
                    <label className="tg-field">
                      <span className="tg-field-label">确认密码</span>
                      <input
                        className="tg-field-input"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={bindPassword2}
                        onChange={(ev) => setBindPassword2(ev.target.value)}
                        placeholder="再输入一次密码"
                      />
                    </label>
                    <div className="stack" style={{ marginTop: 14 }}>
                      <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={binding}
                      >
                        {binding ? "绑定中…" : "完成绑定"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-block"
                        disabled={binding}
                        onClick={() => {
                          setBindOpen(false);
                          setBindPassword("");
                          setBindPassword2("");
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <p className="bind-card-lead">
                  已绑定邮箱（未验证）。可直接改邮箱后保存，或点「验证」发码完成验证后，才能用邮箱在其他设备登录。
                </p>
                <form onSubmit={(e) => void onConfirmVerify(e)}>
                  <label className="tg-field">
                    <span className="tg-field-label">邮箱</span>
                    <div className="tg-field-row">
                      <input
                        className="tg-field-input"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={verifyEmail}
                        onChange={(ev) => {
                          setVerifyEmail(ev.target.value);
                          setVerifyCode("");
                          setVerifyDevCode("");
                        }}
                        placeholder="you@example.com"
                      />
                      <button
                        type="button"
                        className="btn btn-secondary tg-field-action"
                        disabled={
                          sendingVerifyCode || verifyCooldown > 0 || verifying
                        }
                        onClick={() => void onSendVerifyCode()}
                      >
                        {sendingVerifyCode
                          ? "发送中…"
                          : verifyCooldown > 0
                            ? `${verifyCooldown}s`
                            : "验证"}
                      </button>
                    </div>
                  </label>
                  {verifyEmail.trim() &&
                  me?.email &&
                  verifyEmail.trim().toLowerCase() !==
                    me.email.toLowerCase() ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-block"
                      style={{ marginTop: 10 }}
                      disabled={savingEmail || verifying || sendingVerifyCode}
                      onClick={() => void onSaveUnverifiedEmail()}
                    >
                      {savingEmail ? "保存中…" : "仅保存新邮箱（仍未验证）"}
                    </button>
                  ) : null}
                  <label className="tg-field">
                    <span className="tg-field-label">邮箱验证码</span>
                    <input
                      className="tg-field-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={verifyCode}
                      onChange={(ev) => setVerifyCode(ev.target.value.trim())}
                      placeholder="点击右侧验证后填写"
                    />
                  </label>
                  {verifyDevCode ? (
                    <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                      开发环境验证码：<strong>{verifyDevCode}</strong>
                    </p>
                  ) : null}
                  <div className="stack" style={{ marginTop: 14 }}>
                    <button
                      type="submit"
                      className="btn btn-primary btn-block"
                      disabled={verifying || !verifyCode.trim()}
                    >
                      {verifying ? "验证中…" : "完成验证"}
                    </button>
                  </div>
                </form>
              </>
              )}
            </>
          )}
        </section>
      )}

      <p className="section-label">更多</p>
      <div style={{ marginTop: 10 }}>
        <Link href="/invite" className="list-row">
          <span className="list-row-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div className="list-row-body">
            <div className="list-row-title">邀请有奖</div>
            <div className="list-row-desc">分享链接，好友付费你拿奖励</div>
          </div>
          <span className="list-chevron" aria-hidden>
            ›
          </span>
        </Link>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="list-row download-row"
          style={{ width: "100%", cursor: "pointer", color: "inherit" }}
          onClick={() => void copyDownloadLink()}
          aria-label="App 下载"
        >
          <span className="download-platforms" aria-hidden>
            <span className="download-platform-icon" title="iOS">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
              </svg>
            </span>
            <span className="download-platform-icon" title="Android">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
              </svg>
            </span>
            <span className="download-platform-icon" title="Windows">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 5.5 10.2 4.4v7.1H3V5.5Zm8.1-1.2L21 2.8v8.7h-9.9V4.3ZM3 13.5h7.2v7.1L3 19.5v-6Zm8.1 0H21v8.7l-9.9-1.4v-7.3Z" />
              </svg>
            </span>
            <span className="download-platform-icon" title="macOS">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
              </svg>
            </span>
          </span>
          <div className="list-row-body">
            <div className="list-row-title">App 下载</div>
            <div className="list-row-desc">点击复制链接，浏览器打开</div>
          </div>
          <span className="list-chevron" aria-hidden>
            ›
          </span>
        </button>
      </div>

      <p className="section-label">官网与帮助</p>
      <div style={{ marginTop: 10 }}>
        {site.website ? (
          <button
            type="button"
            className="list-row"
            style={{ width: "100%", cursor: "pointer", color: "inherit" }}
            onClick={() => openExternal(site.website)}
          >
            <div className="list-row-body">
              <div className="list-row-title">官方网站</div>
              <div className="list-row-desc">{site.website}</div>
            </div>
            <span className="list-chevron" aria-hidden>
              ›
            </span>
          </button>
        ) : null}
        {channelUrl ? (
          <button
            type="button"
            className="list-row"
            style={{ width: "100%", cursor: "pointer", color: "inherit" }}
            onClick={() => {
              haptic("light");
              openTelegramUrl(channelUrl);
            }}
          >
            <span className="list-row-icon list-row-icon--channel" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.7 7.1-1.3 6.1c-.1.44-.36.55-.73.34l-2.02-1.49-1 .96c-.11.11-.2.2-.41.2l.15-2.07 3.74-3.38c.16-.14-.04-.23-.25-.08l-4.62 2.91-1.99-.62c-.43-.13-.44-.43.09-.64l7.77-3c.36-.13.68.08.57.52z" />
              </svg>
            </span>
            <div className="list-row-body">
              <div className="list-row-title">加入官方频道</div>
              <div className="list-row-desc">获取公告、活动与使用提示</div>
            </div>
            <span className="list-chevron" aria-hidden>
              ›
            </span>
          </button>
        ) : null}
        {supportTg ? (
          <button
            type="button"
            className="list-row"
            style={{ width: "100%", cursor: "pointer", color: "inherit" }}
            onClick={() => {
              haptic("light");
              openTelegramUrl(supportTg);
            }}
          >
            <span className="list-row-icon list-row-icon--telegram" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.55 7.3c-.12.52-.42.65-.86.4l-2.38-1.75-1.15 1.1c-.13.13-.23.23-.47.23l.17-2.42 4.4-3.97c.19-.17-.04-.27-.3-.1l-5.44 3.42-2.34-.73c-.51-.16-.52-.51.1-.76l9.15-3.53c.42-.15.8.1.67.61z" />
              </svg>
            </span>
            <div className="list-row-body">
              <div className="list-row-title">Telegram 客服</div>
              <div className="list-row-desc">账号、订阅与推广问题</div>
            </div>
            <span className="list-chevron" aria-hidden>
              ›
            </span>
          </button>
        ) : null}
        <a
          className="list-row"
          href={`mailto:${site.supportEmail}`}
        >
          <div className="list-row-body">
            <div className="list-row-title">邮箱客服</div>
            <div className="list-row-desc">{site.supportEmail}</div>
          </div>
          <span className="list-chevron" aria-hidden>
            ›
          </span>
        </a>
      </div>

      <div className="stack">
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            clearToken();
            window.location.href = "/";
          }}
        >
          重置本地会话
        </button>
      </div>
    </TgShell>
  );
}
