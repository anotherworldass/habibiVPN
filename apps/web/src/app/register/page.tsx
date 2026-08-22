"use client";

import { useSearchParams } from "next/navigation";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { t } from "../../lib/copy";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { bindSupportSession } from "../../lib/support";
import { buildWebClientMeta } from "../../lib/device";
import {
  clearInviteCode,
  normalizeInviteCode,
  peekInviteCode,
  saveInviteCode,
} from "../../lib/invite";
import { fetchSignupTrialPromo } from "../../lib/signup-trial";

function RegisterForm() {
  const router = useLocaleRouter();
  const messages = t(useLocale());
  const registerCopy = messages.register;
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLocked, setInviteLocked] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState("");
  const [requireCode, setRequireCode] = useState(true);

  useEffect(() => {
    const fromUrl = normalizeInviteCode(searchParams.get("ref"));
    if (fromUrl) {
      saveInviteCode(fromUrl);
      setInviteCode(fromUrl);
      setInviteLocked(true);
      return;
    }
    const remembered = peekInviteCode();
    if (remembered) {
      setInviteCode(remembered);
      setInviteLocked(true);
    }
  }, [searchParams]);

  useEffect(() => {
    void apiFetch<{ require_register_code?: boolean }>("/api/v1/auth/register-policy")
      .then((policy) => {
        setRequireCode(policy.require_register_code !== false);
      })
      .catch(() => {
        setRequireCode(true);
      });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function onSendCode() {
    setError("");
    setInfo("");
    setDevCode("");
    if (!email.trim() || password.length < 6) {
      setError(registerCopy.needEmailPassword);
      return;
    }
    setSendingCode(true);
    try {
      const body: {
        email: string;
        password: string;
        invite_code?: string;
        client_meta?: ReturnType<typeof buildWebClientMeta>;
      } = { email, password, client_meta: buildWebClientMeta() };
      const inv = inviteCode.trim();
      if (inv) body.invite_code = inv;
      const res = await apiFetch<{
        ok: true;
        expires_in_seconds: number;
        verify_code?: string;
      }>("/api/v1/auth/register/send-code", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setInfo(registerCopy.codeSent);
      setCooldown(60);
      if (res.verify_code) {
        setDevCode(res.verify_code);
        setCode(res.verify_code);
      }
    } catch (err) {
      setError(friendlyError(err, messages.common.sendFailed));
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body: {
        email: string;
        password: string;
        code?: string;
        invite_code?: string;
        client_meta?: ReturnType<typeof buildWebClientMeta>;
      } = {
        email,
        password,
        client_meta: buildWebClientMeta(),
      };
      if (requireCode) body.code = code.trim();
      const inv = inviteCode.trim();
      if (inv) body.invite_code = inv;
      const res = await apiFetch<{ token: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(res.token);
      await bindSupportSession();
      clearInviteCode();
      const promo = await fetchSignupTrialPromo();
      router.push(
        promo.enabled && promo.web
          ? "/subscription?welcome=1"
          : "/plans?welcome=1",
      );
    } catch (err) {
      setError(friendlyError(err, registerCopy.failed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{registerCopy.title}</h1>
        <p>{registerCopy.lead}</p>
      </div>

      <form onSubmit={onSubmit} className="panel" style={{ marginTop: 16, gap: 0 }}>
        {error && (
          <p className="alert-error" style={{ marginBottom: 16 }}>
            {error}
          </p>
        )}
        {info && (
          <p className="alert-ok" style={{ marginBottom: 16 }}>
            {info}
          </p>
        )}
        {devCode && (
          <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
            {messages.common.devCode}<strong>{devCode}</strong>
          </p>
        )}

        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">{messages.common.email}</span>
          <input
            className="field-input"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">{registerCopy.passwordLabel}</span>
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={registerCopy.passwordPh}
          />
        </label>

        {requireCode ? (
        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">{messages.common.code}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="field-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required={requireCode}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder={registerCopy.codePh}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={sendingCode || cooldown > 0}
              onClick={() => void onSendCode()}
              style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}
            >
              {sendingCode
                ? messages.common.sending
                : cooldown > 0
                  ? `${cooldown}s`
                  : messages.common.sendCode}
            </button>
          </div>
        </label>
        ) : null}

        <label className="field" style={{ display: "block", marginBottom: 20 }}>
          <span className="field-label">
            {inviteLocked ? registerCopy.inviteLocked : registerCopy.inviteOptional}
          </span>
          <input
            className="field-input"
            type="text"
            autoComplete="off"
            value={inviteCode}
            readOnly={inviteLocked}
            onChange={(e) => {
              if (!inviteLocked) setInviteCode(e.target.value.toUpperCase());
            }}
            placeholder={registerCopy.invitePh}
            style={
              inviteLocked
                ? {
                    background: "color-mix(in srgb, var(--teal) 8%, white)",
                    color: "var(--teal-deep)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    cursor: "default",
                  }
                : undefined
            }
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? registerCopy.submitting : registerCopy.submit}
        </button>

        <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
          {registerCopy.hasAccount}{" "}
          <Link href="/login" style={{ color: "var(--teal-deep)", fontWeight: 600 }}>
            {registerCopy.goLogin}
          </Link>
        </p>
      </form>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Shell narrow hideNavigation>
      <Suspense fallback={<div className="page-head"><h1>{t(useLocale()).register.createTitle}</h1></div>}>
        <RegisterForm />
      </Suspense>
    </Shell>
  );
}
