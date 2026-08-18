"use client";

import Link from "../../components/LocaleLink";
import { FormEvent, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordPage() {
  const copy = t(useLocale());
  const copy = t(useLocale());
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    setDevCode("");
    try {
      const res = await apiFetch<{
        ok: true;
        reset_code?: string;
        expires_in_seconds?: number;
      }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInfo(copy.forgot.sent);
      if (res.reset_code) {
        setDevCode(res.reset_code);
        setCode(res.reset_code);
      }
      setStep("reset");
    } catch (err) {
      setError(friendlyError(err, copy.forgot.sendFailed));
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email,
          code,
          new_password: password,
        }),
      });
      setStep("done");
    } catch (err) {
      setError(friendlyError(err, copy.forgot.resetFailed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell narrow hideNavigation>
      <div className="page-head">
        <h1>{copy.forgot.title}</h1>
        <p>{copy.forgot.lead}</p>
      </div>

      {step === "request" && (
        <form onSubmit={onRequest} className="panel" style={{ marginTop: 16 }}>
          {error && (
            <p className="alert-error" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}
          <label className="field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">{copy.forgot.emailLabel}</span>
            <input
              className="field-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? copy.common.sending : copy.forgot.send}
          </button>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 13,
              color: "var(--muted)",
              textAlign: "center",
            }}
          >
            <Link href="/login" style={{ color: "var(--teal-deep)", fontWeight: 600 }}>
              {copy.forgot.backLogin}
            </Link>
          </p>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={onReset} className="panel" style={{ marginTop: 16 }}>
          {info && (
            <p className="alert-ok" style={{ marginBottom: 16 }}>
              {info}
            </p>
          )}
          {devCode && (
            <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
              {copy.common.devCode}<strong>{devCode}</strong>
            </p>
          )}
          {error && (
            <p className="alert-error" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}
          <label className="field" style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">{copy.common.email}</span>
            <input className="field-input" type="email" value={email} readOnly />
          </label>
          <label className="field" style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">{copy.forgot.mailCode}</span>
            <input
              className="field-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder={copy.login.codePh}
            />
          </label>
          <label className="field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">{copy.forgot.newPassword}</span>
            <input
              className="field-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={copy.forgot.newPasswordPh}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? copy.forgot.submitting : copy.forgot.reset}
          </button>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 13,
              color: "var(--muted)",
              textAlign: "center",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setStep("request");
                setError("");
                setInfo("");
              }}
              style={{
                background: "none",
                border: 0,
                color: "var(--teal-deep)",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {copy.forgot.resend}
            </button>
          </p>
        </form>
      )}

      {step === "done" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="alert-ok" style={{ marginBottom: 16 }}>
            {copy.forgot.done}
          </p>
          <Link href="/login" className="btn btn-primary btn-block">
            {copy.forgot.goLogin}
          </Link>
        </div>
      )}
    </Shell>
  );
}
