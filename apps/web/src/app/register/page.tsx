"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { setToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { bindSupportSession } from "../../lib/support";
import {
  clearInviteCode,
  normalizeInviteCode,
  peekInviteCode,
  saveInviteCode,
} from "../../lib/invite";

function RegisterForm() {
  const router = useRouter();
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
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function onSendCode() {
    setError("");
    setInfo("");
    setDevCode("");
    if (!email.trim() || password.length < 6) {
      setError("请先填写邮箱和至少 6 位密码，再获取验证码");
      return;
    }
    setSendingCode(true);
    try {
      const body: {
        email: string;
        password: string;
        invite_code?: string;
      } = { email, password };
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
      setInfo("验证码已发送，请查收邮件（含垃圾箱）。");
      setCooldown(60);
      if (res.verify_code) {
        setDevCode(res.verify_code);
        setCode(res.verify_code);
      }
    } catch (err) {
      setError(friendlyError(err, "发送验证码失败"));
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
        code: string;
        invite_code?: string;
      } = {
        email,
        password,
        code: code.trim(),
      };
      const inv = inviteCode.trim();
      if (inv) body.invite_code = inv;
      const res = await apiFetch<{ token: string }>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(res.token);
      await bindSupportSession();
      clearInviteCode();
      router.push("/plans?welcome=1");
    } catch (err) {
      setError(friendlyError(err, "注册失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>创建账号</h1>
        <p>验证邮箱后即可注册并免费领取试用套餐。</p>
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
            开发环境验证码：<strong>{devCode}</strong>
          </p>
        )}

        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">邮箱</span>
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
          <span className="field-label">密码（至少 6 位）</span>
          <input
            className="field-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="设置登录密码"
          />
        </label>

        <label className="field" style={{ display: "block", marginBottom: 14 }}>
          <span className="field-label">邮箱验证码</span>
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
              placeholder="6 位数字"
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
                ? "发送中…"
                : cooldown > 0
                  ? `${cooldown}s`
                  : "获取验证码"}
            </button>
          </div>
        </label>

        <label className="field" style={{ display: "block", marginBottom: 20 }}>
          <span className="field-label">
            {inviteLocked ? "邀请码（来自邀请链接）" : "邀请码（可选）"}
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
            placeholder="好友邀请码"
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
          {loading ? "创建中…" : "注册并领取套餐"}
        </button>

        <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
          已有账号？{" "}
          <Link href="/login" style={{ color: "var(--teal-deep)", fontWeight: 600 }}>
            去登录
          </Link>
        </p>
      </form>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Shell narrow hideNavigation>
      <Suspense fallback={<div className="page-head"><h1>创建账号</h1></div>}>
        <RegisterForm />
      </Suspense>
    </Shell>
  );
}
