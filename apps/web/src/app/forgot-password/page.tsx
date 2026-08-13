"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { friendlyError } from "../../lib/errors";

type Step = "request" | "reset" | "done";

export default function ForgotPasswordPage() {
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
      setInfo(
        "若该邮箱已注册且已验证，验证码已发送。请查收邮件（含垃圾箱）。",
      );
      if (res.reset_code) {
        setDevCode(res.reset_code);
        setCode(res.reset_code);
      }
      setStep("reset");
    } catch (err) {
      setError(friendlyError(err, "发送失败"));
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
      setError(friendlyError(err, "重置失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell narrow hideNavigation>
      <div className="page-head">
        <h1>忘记密码</h1>
        <p>通过邮箱验证码设置新密码。</p>
      </div>

      {step === "request" && (
        <form onSubmit={onRequest} className="panel" style={{ marginTop: 16 }}>
          {error && (
            <p className="alert-error" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}
          <label className="field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">注册邮箱</span>
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
            {loading ? "发送中…" : "发送验证码"}
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
              返回登录
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
              开发环境验证码：<strong>{devCode}</strong>
            </p>
          )}
          {error && (
            <p className="alert-error" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}
          <label className="field" style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">邮箱</span>
            <input className="field-input" type="email" value={email} readOnly />
          </label>
          <label className="field" style={{ display: "block", marginBottom: 14 }}>
            <span className="field-label">邮件验证码</span>
            <input
              className="field-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="6 位数字"
            />
          </label>
          <label className="field" style={{ display: "block", marginBottom: 20 }}>
            <span className="field-label">新密码（至少 6 位）</span>
            <input
              className="field-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="设置新密码"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "提交中…" : "重置密码"}
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
              重新发送验证码
            </button>
          </p>
        </form>
      )}

      {step === "done" && (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="alert-ok" style={{ marginBottom: 16 }}>
            密码已重置，请使用新密码登录。
          </p>
          <Link href="/login" className="btn btn-primary btn-block">
            去登录
          </Link>
        </div>
      )}
    </Shell>
  );
}
