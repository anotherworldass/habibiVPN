"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { FormEvent, useEffect, useState } from "react";
import HelpLinks from "../../components/HelpLinks";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { clearToken, getToken, setToken } from "../../lib/auth";
import { buildWebClientMeta } from "../../lib/device";
import { friendlyError } from "../../lib/errors";
import { useLocale } from "../../components/LocaleProvider";
import {
  fetchPublicInviteCampaign,
  inviteCampaignTeaser,
  resolvedCampaignUi,
  type InviteCampaignPublic,
} from "../../lib/campaigns";
import { t } from "../../lib/copy";

type Me = {
  id: string;
  uid?: number;
  email?: string | null;
  email_verified?: boolean;
  subscription_count?: number;
  has_subscription?: boolean;
};

export default function AccountPage() {
  const locale = useLocale();
  const copy = t(locale);
  const router = useLocaleRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [activity, setActivity] = useState<InviteCampaignPublic | null>(null);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyDevCode, setVerifyDevCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifyOk, setVerifyOk] = useState("");
  const [allowSoftSave, setAllowSoftSave] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    apiFetch<{ user: Me }>("/api/v1/me")
      .then((res) => {
        setMe(res.user);
        if (res.user.email) setVerifyEmail(res.user.email);
      })
      .catch((e) => setError(friendlyError(e, copy.common.loadFailed)))
      .finally(() => setReady(true));
    void fetchPublicInviteCampaign(locale).then(setActivity);
    void apiFetch<{ allow_soft_bind_without_code?: boolean }>(
      "/api/v1/auth/register-policy",
    )
      .then((policy) => {
        setAllowSoftSave(policy.allow_soft_bind_without_code === true);
      })
      .catch(() => {
        setAllowSoftSave(false);
      });
  }, [router, locale]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const uidText = ready ? (me?.uid != null ? String(me.uid) : "—") : "…";
  const emailText = ready ? me?.email || "—" : copy.account.loadingEmail;
  const planCount = ready ? me?.subscription_count ?? 0 : null;
  const needsVerify = ready && !!me?.email && !me.email_verified;
  const draftEmail = verifyEmail.trim().toLowerCase();
  const boundEmail = (me?.email || "").toLowerCase();
  const emailChanged = !!draftEmail && !!boundEmail && draftEmail !== boundEmail;

  function applyAuthUser(user: Me, fallbackEmail: string) {
    setMe((prev) =>
      prev
        ? {
            ...prev,
            ...user,
            email: user.email ?? fallbackEmail,
            email_verified: !!user.email_verified,
          }
        : user,
    );
    setVerifyEmail(user.email ?? fallbackEmail);
  }

  async function onSendVerifyCode() {
    const email = draftEmail;
    if (!email || !email.includes("@")) {
      setError(copy.account.emailInvalid);
      return;
    }
    setError("");
    setVerifyOk("");
    setVerifyDevCode("");
    setSendingCode(true);
    try {
      const res = await apiFetch<{
        ok: true;
        verify_code?: string;
      }>("/api/v1/auth/register/send-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          client_meta: buildWebClientMeta(),
        }),
      });
      setCooldown(60);
      if (res.verify_code) {
        setVerifyDevCode(res.verify_code);
        setVerifyCode(res.verify_code);
      }
    } catch (err) {
      setError(friendlyError(err, copy.common.sendFailed));
    } finally {
      setSendingCode(false);
    }
  }

  async function onConfirmVerify(e: FormEvent) {
    e.preventDefault();
    const email = draftEmail;
    if (!email || !email.includes("@")) {
      setError(copy.account.emailInvalid);
      return;
    }
    setError("");
    setVerifyOk("");
    setVerifying(true);
    try {
      const res = await apiFetch<{ token?: string; user: Me }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            code: verifyCode.trim(),
            client_meta: buildWebClientMeta(),
          }),
        },
      );
      if (res.token) setToken(res.token);
      applyAuthUser(res.user, email);
      setVerifyCode("");
      setVerifyDevCode("");
      setVerifyOk(copy.account.verifyOk);
    } catch (err) {
      setError(friendlyError(err, copy.account.verifySubmit));
    } finally {
      setVerifying(false);
    }
  }

  async function onSaveUnverifiedEmail() {
    const email = draftEmail;
    if (!email || !email.includes("@")) {
      setError(copy.account.emailInvalid);
      return;
    }
    if (!emailChanged) {
      setVerifyOk(copy.account.emailUnchanged);
      return;
    }
    setError("");
    setVerifyOk("");
    setSavingEmail(true);
    try {
      const res = await apiFetch<{ token?: string; user: Me }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            client_meta: buildWebClientMeta(),
          }),
        },
      );
      if (res.token) setToken(res.token);
      applyAuthUser(res.user, email);
      setVerifyCode("");
      setVerifyDevCode("");
      setVerifyOk(copy.account.emailSaved);
    } catch (err) {
      setError(friendlyError(err, copy.account.saveFailed));
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <Shell>
      <div className="account-page">
        <div className="page-head account-page-head">
          <div>
            <h1>{copy.account.title}</h1>
            <p className="account-page-lead-mobile">{copy.account.leadMobile}</p>
          </div>
          <p className="account-page-lead-desktop">
            {copy.account.leadDesktop}
          </p>
        </div>

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="account-desktop">
          <section className="account-identity" aria-label={copy.account.identityAria}>
            <div className="account-identity-copy">
              <span className="account-eyebrow">{copy.account.uid}</span>
              <div className="account-uid-value">{uidText}</div>
              <div className="account-email">
                {emailText}
                {ready && me?.email ? (
                  <span
                    className="status-chip"
                    style={{ marginLeft: 8, fontSize: 12, verticalAlign: "middle" }}
                  >
                    {me.email_verified
                      ? copy.account.verifiedTag
                      : copy.account.unverifiedTag}
                  </span>
                ) : null}
              </div>
            </div>

            <Link href="/subscription" className="account-plan-chip">
              <strong>{planCount == null ? "…" : planCount}</strong>
              <span>{copy.account.plans}</span>
            </Link>

            <div className="account-identity-actions">
              <Link href="/subscription" className="btn btn-primary">
                {copy.account.openConnect}
              </Link>
              <Link href="/plans" className="btn btn-secondary">
                {copy.account.planCenter}
              </Link>
            </div>
          </section>

          <div className="account-desktop-body">
            <div className="account-desktop-main">
              {needsVerify ? (
                verifyOpen ? (
                <form
                  className="panel account-verify"
                  onSubmit={(e) => void onConfirmVerify(e)}
                >
                  <div className="account-verify-head">
                    <h2>{copy.account.verifyTitle}</h2>
                    <button
                      type="button"
                      className="account-verify-collapse"
                      onClick={() => setVerifyOpen(false)}
                    >
                      {copy.account.verifyCollapse}
                    </button>
                  </div>
                  <p className="account-verify-lead">
                    {copy.account.verifyLead}
                  </p>
                  {verifyOk ? (
                    <p className="alert-ok" style={{ marginBottom: 12 }}>
                      {verifyOk}
                    </p>
                  ) : null}
                  {verifyDevCode ? (
                    <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
                      {copy.common.devCode}
                      <strong>{verifyDevCode}</strong>
                    </p>
                  ) : null}
                  <label className="field" style={{ display: "block", marginBottom: 12 }}>
                    <span className="field-label">{copy.common.email}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="field-input"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={verifyEmail}
                        onChange={(ev) => {
                          setVerifyEmail(ev.target.value);
                          setVerifyCode("");
                          setVerifyDevCode("");
                          setVerifyOk("");
                        }}
                        placeholder="you@example.com"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          sendingCode || cooldown > 0 || verifying || savingEmail
                        }
                        onClick={() => void onSendVerifyCode()}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {sendingCode
                          ? copy.common.sending
                          : cooldown > 0
                            ? `${cooldown}s`
                            : copy.account.verifySend}
                      </button>
                    </div>
                  </label>
                  {allowSoftSave && emailChanged ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      style={{ marginBottom: 12 }}
                      disabled={savingEmail || verifying || sendingCode}
                      onClick={() => void onSaveUnverifiedEmail()}
                    >
                      {savingEmail
                        ? copy.account.savingEmail
                        : copy.account.saveEmail}
                    </button>
                  ) : null}
                  <label className="field" style={{ display: "block", marginBottom: 12 }}>
                    <span className="field-label">{copy.account.verifyCode}</span>
                    <input
                      className="field-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={6}
                      value={verifyCode}
                      onChange={(ev) => setVerifyCode(ev.target.value.trim())}
                      placeholder={copy.register.codePh}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={verifying || !verifyCode.trim()}
                  >
                    {verifying ? copy.account.verifying : copy.account.verifySubmit}
                  </button>
                </form>
                ) : (
                <button
                  type="button"
                  className="account-nav-card account-verify account-verify-toggle"
                  onClick={() => setVerifyOpen(true)}
                >
                  <span className="account-nav-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 7 9-7" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-title">{copy.account.verifyTitle}</div>
                    <div className="promo-entry-desc">{copy.account.verifyToggleHint}</div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </button>
                )
              ) : null}
              <div className="account-link-stack">
                {activity ? (
                  <Link href="/activity" className="account-promo-card account-promo-card--featured">
                    <span className="account-promo-icon" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="4" y="11" width="16" height="9" rx="1.6" />
                        <path d="M4 11h16M12 11v9M12 11c0-3-1.2-5-3.4-5S6 9.2 8.2 11H12c2.2-1.8 3.2-5 1.4-5S12 8 12 11Z" />
                      </svg>
                    </span>
                    <div className="promo-entry-body">
                      <div className="promo-entry-kicker">{copy.account.activityKicker}</div>
                      <div className="promo-entry-title">
                        {resolvedCampaignUi(activity.ui, locale).title || copy.activity.fallbackTitle}
                      </div>
                      <div className="promo-entry-desc">
                        {inviteCampaignTeaser(copy.activity, activity, locale)}
                      </div>
                    </div>
                    <span className="account-chevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                ) : null}
                <Link href="/promo" className={activity ? "account-promo-card" : "account-promo-card account-promo-card--featured"}>
                  <span className="account-promo-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 12h16M12 4v16" />
                      <path d="M6.5 6.5h11v11h-11z" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-kicker">{copy.account.featured}</div>
                    <div className="promo-entry-title">{copy.account.promoTitle}</div>
                    <div className="promo-entry-desc">
                      {copy.account.promoDesc}
                    </div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>

                <Link href="/orders" className="account-nav-card">
                  <span className="account-nav-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z" />
                      <path d="M9 9h6M9 13h4" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-title">{copy.account.ordersTitle}</div>
                    <div className="promo-entry-desc">{copy.account.ordersDesc}</div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </div>
            </div>

            <aside className="account-desktop-aside">
              <HelpLinks />
            </aside>
          </div>
        </div>

        <button
          type="button"
          className="account-logout"
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
        >
          <span className="account-logout-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
              <path d="m15 8 4 4-4 4M9 12h10" />
            </svg>
          </span>
          <span>{copy.account.logout}</span>
        </button>
      </div>
    </Shell>
  );
}
