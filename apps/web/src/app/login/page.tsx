"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { FormEvent, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { bindSupportSession } from "../../lib/support";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

type LoginMode = "password" | "code";

export default function LoginPage() {
  const copy = t(useLocale());
  const router = useLocaleRouter();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  function goNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(
      next?.startsWith("/") && !next.startsWith("//") ? next : "/subscription",
    );
  }

  async function onSendCode() {
    setError("");
    setInfo("");
    setDevCode("");
    if (!email.trim()) {
      setError(copy.login.emailRequired);
      return;
    }
    setSendingCode(true);
    try {
      const res = await apiFetch<{
        ok: true;
        expires_in_seconds: number;
        verify_code?: string;
      }>("/api/v1/auth/login/send-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInfo(copy.login.codeSent);
      setCooldown(60);
      if (res.verify_code) {
        setDevCode(res.verify_code);
        setCode(res.verify_code);
      }
    } catch (err) {
      setError(friendlyError(err, copy.common.sendFailed));
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "password") {
        const res = await apiFetch<{ token: string }>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(res.token);
      } else {
        const res = await apiFetch<{ token: string }>("/api/v1/auth/login/code", {
          method: "POST",
          body: JSON.stringify({ email, code: code.trim() }),
        });
        setToken(res.token);
      }
      await bindSupportSession();
      goNext();
    } catch (err) {
      setError(friendlyError(err, copy.login.failed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell narrow hideNavigation>
      <div className="page-head">
        <h1>{copy.login.title}</h1>
        <p>{copy.login.lead}</p>
      </div>

      <form onSubmit={onSubmit} className="panel" style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            padding: 4,
            borderRadius: 10,
            background: "color-mix(in srgb, var(--muted) 12%, transparent)",
          }}
          role="tablist"
          aria-label={copy.login.modeAria}
        >
          {(
            [
              { key: "password", label: copy.login.passwordMode },
              { key: "code", label: copy.login.codeMode },
            ] as const
          ).map((item) => {
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setMode(item.key);
                  setError("");
                  setInfo("");
                }}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  background: active ? "var(--card, #fff)" : "transparent",
                  color: active ? "var(--teal-deep)" : "var(--muted)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="alert-error" style={{ marginBottom: 16 }}>
            {error}
          </p>
        )}
        {mode === "code" && info && (
          <p className="alert-ok" style={{ marginBottom: 16 }}>
            {info}
          </p>
        )}
        {mode === "code" && devCode && (
          <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
            {copy.common.devCode}<strong>{devCode}</strong>
          </p>
        )}

        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">{copy.common.email}</span>
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

        {mode === "password" ? (
          <>
            <label className="field" style={{ display: "block", marginBottom: 8 }}>
              <span className="field-label">{copy.common.password}</span>
              <input
                className="field-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={copy.login.passwordPh}
              />
            </label>
            <p style={{ margin: "0 0 16px", textAlign: "right", fontSize: 13 }}>
              <Link
                href="/forgot-password"
                style={{ color: "var(--teal-deep)", fontWeight: 600 }}
              >
                {copy.login.forgot}
              </Link>
            </p>
          </>
        ) : (
          <label className="field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">{copy.common.code}</span>
            <div style={{ display: "flex", gap: 8 }}>
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
                  ? copy.common.sending
                  : cooldown > 0
                    ? `${cooldown}s`
                    : copy.common.sendCode}
              </button>
            </div>
          </label>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? copy.login.submitting : copy.login.submit}
        </button>

        <p
          style={{
            margin: "16px 0 0",
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          {copy.login.noAccount}{" "}
          <Link href="/register" style={{ color: "var(--teal-deep)", fontWeight: 600 }}>
            {copy.login.goRegister}
          </Link>
        </p>
      </form>
    </Shell>
  );
}