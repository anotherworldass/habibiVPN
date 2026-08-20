"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import TgShell from "../../components/TgShell";
import { TrafficUsage } from "../../components/TrafficUsage";
import { apiFetch } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import {
  type ConnectMode,
  type UserPreferences,
  fetchPreferences,
  saveConnectPreference,
} from "../../lib/preferences";
import { formatResetAt, resetPolicyLabel } from "../../lib/plan-format";
import { copyText } from "../../lib/clipboard";
import { ensureSession } from "../../lib/session";
import { appDownloadUrl, isPlaceholderUrl, site } from "../../lib/site";
import {
  fetchSignupTrialPromo,
  telegramSignupTrialPlan,
} from "../../lib/signup-trial";
import { haptic, hapticSuccess } from "../../lib/telegram";

type ClientUrls = {
  clash_meta?: string;
  hiddify?: string;
  v2ray?: string;
  shadowrocket?: string;
  surge?: string;
  quantumult_x?: string;
};

type Subscription = {
  id: string;
  plan_name: string | null;
  plan_code: string | null;
  status: string;
  expires_at: string | null;
  subscription_url: string | null;
  client_urls?: ClientUrls | null;
  used_traffic_bytes?: number | null;
  data_limit_bytes?: number | null;
  reset_policy?: string | null;
  custom_reset_interval?: string | null;
  next_reset_at?: string | null;
};

type GuideMode = "vpn" | "airport";

/** Compact airport-mode copy targets — keep the list short. */
const AIRPORT_CLIENTS: Array<{
  key: keyof ClientUrls;
  label: string;
}> = [
  { key: "shadowrocket", label: "Shadowrocket" },
  { key: "clash_meta", label: "Clash" },
  { key: "hiddify", label: "Hiddify" },
  { key: "quantumult_x", label: "Quantumult X" },
  { key: "surge", label: "Surge" },
];

function DownloadIcon() {
  return (
    <svg
      className="btn-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function statusLabel(status: string) {
  if (status === "active") return "可用";
  if (status === "expired") return "已到期";
  if (status === "disabled") return "已停用";
  return status;
}

function defaultGuide(mode: ConnectMode): GuideMode {
  if (mode === "subscription_client") return "airport";
  return "vpn";
}

function trafficResetInfo(
  sub: Subscription,
): { policy: string; when: string | null } | null {
  const policy = resetPolicyLabel(
    sub.reset_policy,
    sub.custom_reset_interval,
  );
  if (!policy) return null;
  return { policy, when: formatResetAt(sub.next_reset_at) };
}

function ConnectContent() {
  const search = useSearchParams();
  const claimed = search.get("claimed") === "1";
  const paid = search.get("paid") === "1";
  const queryId = search.get("id");

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [showPrefPrompt, setShowPrefPrompt] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [guideMode, setGuideMode] = useState<GuideMode>("vpn");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const [trialPlan, setTrialPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      try {
        const [subRes, pref, promo] = await Promise.all([
          apiFetch<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
          fetchPreferences().catch(() => null),
          fetchSignupTrialPromo(),
        ]);
        if (cancelled) return;
        const list = subRes.subscriptions || [];
        setSubs(list);
        setTrialPlan(telegramSignupTrialPlan(promo)?.name ?? null);
        const preferred =
          (queryId && list.find((s) => s.id === queryId)?.id) ||
          list.find((s) => s.status === "active")?.id ||
          list[0]?.id ||
          null;
        setSelectedId(preferred);
        setPrefs(pref);
        setGuideMode(defaultGuide(pref?.connect_mode ?? "unset"));
        if (claimed && (!pref || pref.connect_mode === "unset")) {
          setShowPrefPrompt(true);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryId, claimed]);

  const selected = useMemo(
    () => subs.find((s) => s.id === selectedId) || null,
    [subs, selectedId],
  );

  const selectedReset = selected ? trafficResetInfo(selected) : null;
  const mode: ConnectMode = prefs?.connect_mode ?? "unset";

  async function pickPref(next: ConnectMode) {
    haptic("medium");
    setSavingPref(true);
    setError("");
    try {
      const saved = await saveConnectPreference({
        connect_mode: next,
        source: "claim_prompt",
      });
      setPrefs(saved);
      setGuideMode(defaultGuide(next));
      setShowPrefPrompt(false);
      hapticSuccess();
    } catch (e) {
      setError(friendlyError(e, "保存偏好失败"));
    } finally {
      setSavingPref(false);
    }
  }

  function markInferredAirportPref() {
    if (mode !== "unset") return;
    void saveConnectPreference({
      connect_mode: "subscription_client",
      source: "inferred",
    })
      .then((saved) => {
        setPrefs(saved);
        setGuideMode("airport");
      })
      .catch(() => {});
  }

  async function copyUrl() {
    if (!selected?.subscription_url) return;
    haptic("light");
    setError("");
    const ok = await copyText(selected.subscription_url);
    if (!ok) {
      setError("复制失败，请长按选择链接");
      return;
    }
    setCopied(true);
    setCopiedClient(null);
    hapticSuccess();
    markInferredAirportPref();
    setTimeout(() => setCopied(false), 1600);
  }

  async function copyClientUrl(key: keyof ClientUrls, label: string) {
    const url = selected?.client_urls?.[key];
    if (!url) {
      // No convert URL yet — fall back to generic subscription link.
      await copyUrl();
      if (selected?.subscription_url) {
        setToast(`${label} 专用链接暂无，已复制通用链接`);
        window.setTimeout(() => setToast(""), 2200);
      }
      return;
    }
    haptic("light");
    setError("");
    const ok = await copyText(url);
    if (!ok) {
      setError("复制失败，请长按选择链接");
      return;
    }
    setCopiedClient(key);
    setCopied(false);
    hapticSuccess();
    markInferredAirportPref();
    setToast(`已复制 ${label}`);
    window.setTimeout(() => setToast(""), 1800);
    setTimeout(() => setCopiedClient(null), 1600);
  }

  async function copyDownloadLink() {
    haptic("light");
    setError("");
    const url = appDownloadUrl();
    if (isPlaceholderUrl(url)) {
      setToast("下载页即将上线");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }
    const ok = await copyText(url);
    if (!ok) {
      setError("复制失败，请长按选择链接");
      return;
    }
    hapticSuccess();
    setToast("下载链接已经复制，请在浏览器打开");
    window.setTimeout(() => setToast(""), 2800);
  }

  function switchGuide(next: GuideMode) {
    haptic("light");
    setGuideMode(next);
  }

  return (
    <TgShell>
      <h1 className="page-title">我的套餐</h1>
      <p className="page-lead">
        查看已开通套餐，按 VPN 模式或机场模式接入使用。
      </p>

      {claimed && !showPrefPrompt && (
        <p className="alert-ok">套餐已开通。</p>
      )}
      {paid && (
        <p className="alert-ok">
          已打开支付页。付款成功后回到这里刷新即可看到新套餐。
        </p>
      )}
      {error && <p className="alert-error">{error}</p>}
      {toast && <p className="alert-ok">{toast}</p>}
      {loading && <p className="muted" style={{ marginTop: 16 }}>同步中…</p>}

      {showPrefPrompt && (
        <div className="card card--accent">
          <h2>你更想怎么用？</h2>
          <p>选一次就好，之后按你的习惯推荐教程。可随时在「我的」里改。</p>
          <div className="stack">
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={savingPref}
              onClick={() => void pickPref("official_app")}
            >
              VPN 模式 · 本站 App
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block btn-lg"
              disabled={savingPref}
              onClick={() => void pickPref("subscription_client")}
            >
              机场模式 · 第三方客户端
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={savingPref}
              onClick={() => setShowPrefPrompt(false)}
            >
              暂时跳过
            </button>
          </div>
        </div>
      )}

      {!loading && subs.length === 0 && (
        <div className="card card--accent">
          <h2>还没有套餐</h2>
          <p>
            {trialPlan
              ? `新用户注册即送「${trialPlan}」。若尚未到账，请稍后刷新，或去套餐页开通。`
              : "选择套餐开通后，系统会自动生成订阅链接。"}
          </p>
          <div className="stack">
            <Link href="/plans" className="btn btn-primary btn-block btn-lg">
              查看套餐
            </Link>
          </div>
        </div>
      )}

      {!loading && subs.length > 0 && !showPrefPrompt && (
        <>
          {subs.length > 1 && (
            <div className="plan-switcher-block">
              <p className="section-label">
                我的套餐（{subs.length}）
              </p>
              <div
                className="plan-switcher"
                role="tablist"
                aria-label="切换套餐"
              >
                {subs.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="plan-switch-item"
                      data-active={active}
                      onClick={() => {
                        haptic("light");
                        setSelectedId(s.id);
                        setCopied(false);
                        setCopiedClient(null);
                        setError("");
                      }}
                    >
                      <span className="plan-switch-name">
                        {s.plan_name || s.plan_code || "套餐"}
                      </span>
                      <span className="plan-switch-meta">
                        {statusLabel(s.status)}
                        {s.expires_at
                          ? ` · ${new Date(s.expires_at).toLocaleDateString()}`
                          : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selected && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="plan-card-top">
                <h2>{selected.plan_name || selected.plan_code || "套餐"}</h2>
                <span className="badge badge--ok">
                  {statusLabel(selected.status)}
                </span>
              </div>
              {selected.expires_at && (
                <p>到期：{new Date(selected.expires_at).toLocaleString()}</p>
              )}
              <TrafficUsage
                usedBytes={selected.used_traffic_bytes ?? 0}
                limitBytes={selected.data_limit_bytes}
                footer={
                  selectedReset ? (
                    <span className="traffic-usage-reset">
                      {selectedReset.policy}
                      {selectedReset.when ? (
                        <>
                          <i aria-hidden>·</i>
                          {selectedReset.when}
                        </>
                      ) : null}
                    </span>
                  ) : null
                }
              />
              {!selected.subscription_url ? (
                <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
                  订阅链接生成中，请稍后刷新。
                </p>
              ) : null}
            </div>
          )}

        </>
      )}

      {!loading && !showPrefPrompt && (
        <section className="guide-section" aria-labelledby="guide-title">
          <div className="guide-head">
            <h2 id="guide-title">使用教程</h2>
            <span>两种接入方式</span>
          </div>

          <div className="guide-tabs" role="tablist" aria-label="使用方式">
            <button
              type="button"
              role="tab"
              aria-selected={guideMode === "vpn"}
              className="guide-tab"
              data-active={guideMode === "vpn"}
              onClick={() => switchGuide("vpn")}
            >
              VPN 模式
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={guideMode === "airport"}
              className="guide-tab"
              data-active={guideMode === "airport"}
              onClick={() => switchGuide("airport")}
            >
              机场模式
            </button>
          </div>

          {guideMode === "vpn" ? (
            <article className="guide-card">
              <p className="guide-kicker">推荐 · 最简单</p>
              <h3>本站 App 一键连接</h3>
              <p className="guide-desc">
                下载安装 {site.brand} App，用当前账号登录，套餐与线路自动同步，无需手动导入订阅。
              </p>
              <ol className="guide-steps">
                <li>
                  <span>1</span>
                  下载 APP
                </li>
                <li>
                  <span>2</span>
                  打开 App，登录同一账号（或使用已绑定邮箱）
                </li>
                <li>
                  <span>3</span>
                  选择线路，点击连接即可上网
                </li>
              </ol>
              <p className="guide-note">
                适合不想折腾客户端的用户。App 上线前可先用机场模式。
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={() => void copyDownloadLink()}
              >
                <DownloadIcon />
                下载 App
              </button>
            </article>
          ) : (
            <article className="guide-card">
              <p className="guide-kicker">兼容第三方</p>
              <h3>导入订阅到客户端</h3>
              <p className="guide-desc">
                按客户端复制专用链接，导入成功率更高；也可用通用订阅链接。
              </p>
              <ol className="guide-steps">
                <li>
                  <span>1</span>
                  上方选好要使用的套餐
                </li>
                <li>
                  <span>2</span>
                  复制对应客户端链接（或通用链接）
                </li>
                <li>
                  <span>3</span>
                  客户端内添加订阅 / 从 URL 导入
                </li>
                <li>
                  <span>4</span>
                  更新节点后选择线路连接
                </li>
              </ol>
              <p className="guide-note">
                订阅链接等同于账号密码，请勿发给他人。
              </p>
              {selected?.subscription_url ? (
                <>
                  <p className="client-copy-label">按客户端复制</p>
                  <div
                    className="client-copy-grid"
                    role="group"
                    aria-label="客户端专用链接"
                  >
                    {AIRPORT_CLIENTS.map(({ key, label }) => {
                      const justCopied = copiedClient === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          className="client-copy-btn"
                          data-copied={justCopied}
                          onClick={() => void copyClientUrl(key, label)}
                        >
                          <strong>{label}</strong>
                          <span>{justCopied ? "已复制" : "复制"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="sub-url client-copy-generic-url">
                    <span className="sub-url-label">订阅网址</span>
                    {selected.subscription_url}
                  </div>
                  <button
                    type="button"
                    className="client-copy-generic"
                    onClick={() => void copyUrl()}
                  >
                    {copied ? "已复制通用链接" : "复制通用订阅链接"}
                  </button>
                </>
              ) : (
                <Link href="/" className="btn btn-secondary btn-block">
                  先去领取套餐
                </Link>
              )}
            </article>
          )}
        </section>
      )}

      <div className="stack">
        <Link href="/invite" className="btn btn-ghost btn-block">
          <svg
            className="btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          邀请好友得奖励
        </Link>
      </div>
    </TgShell>
  );
}

export default function TgConnectPage() {
  return (
    <Suspense
      fallback={
        <TgShell>
          <p className="muted">加载中…</p>
        </TgShell>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
