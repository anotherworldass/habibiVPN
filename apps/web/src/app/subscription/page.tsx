"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Shell from "../../components/Shell";
import { TrafficUsage } from "../../components/TrafficUsage";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import {
  prefFromUsageMode,
  saveConnectPreference,
  usageModeFromPref,
} from "../../lib/preferences";
import { site } from "../../lib/site";

type Subscription = {
  id: string;
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  status: string;
  expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  subscription_url: string | null;
  online_ip_limit: number | null;
  next_plan_ref: string | null;
  upstream_username?: string;
};

function statusLabel(status: string) {
  if (status === "active") return "可用";
  if (status === "expired") return "已到期";
  if (status === "disabled") return "已停用";
  if (status === "none") return "未开通";
  return status;
}

function planLabel(sub: Subscription) {
  return sub.plan_name || sub.plan_code || sub.next_plan_ref || "套餐";
}

function clashImportUrl(url: string) {
  return `clash://install-config?url=${encodeURIComponent(url)}&name=${encodeURIComponent(site.brand)}`;
}

function shadowrocketImportUrl(url: string) {
  return `sub://${btoa(url)}#${encodeURIComponent(site.brand)}`;
}

function SubscriptionContent() {
  const router = useLocaleRouter();
  const search = useSearchParams();
  const claimed = search.get("claimed") === "1";
  const queryId = search.get("id");

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [linkView, setLinkView] = useState<"link" | "qr">("link");
  const [usageMode, setUsageMode] = useState<"official" | "third-party">("official");
  const [qrSaved, setQrSaved] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    Promise.all([
      apiFetch<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
      apiFetch<{
        user: {
          preferences?: {
            connect_mode: "unset" | "official_app" | "subscription_client";
          };
        };
      }>("/api/v1/me").catch(() => null),
    ])
      .then(([subRes, meRes]) => {
        const list = subRes.subscriptions || [];
        setSubs(list);
        const preferred =
          (queryId && list.find((s) => s.id === queryId)?.id) ||
          list.find((s) => s.status === "active")?.id ||
          list[0]?.id ||
          null;
        setSelectedId(preferred);
        const mode = meRes?.user?.preferences?.connect_mode;
        if (mode && mode !== "unset") {
          setUsageMode(usageModeFromPref(mode));
        }
      })
      .catch((e) => setError(friendlyError(e, "加载失败")))
      .finally(() => setLoading(false));
  }, [router, queryId]);

  function selectUsageMode(next: "official" | "third-party") {
    setUsageMode(next);
    void saveConnectPreference({
      connect_mode: prefFromUsageMode(next),
      source: "connect_page",
    }).catch(() => {
      /* keep local UI even if sync fails */
    });
  }

  const selected = useMemo(
    () => subs.find((s) => s.id === selectedId) || null,
    [subs, selectedId],
  );

  async function selectPlan(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setCopied(false);
    setLinkView("link");
    setRefreshOk(false);
    setSyncing(true);
    setError("");
    try {
      const res = await apiFetch<{ subscription: Subscription }>(
        `/api/v1/subscriptions/${id}`,
      );
      if (res.subscription) {
        setSubs((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...res.subscription } : s)),
        );
      }
    } catch (e) {
      // Keep cached info if sync fails
      setError(friendlyError(e, "同步该套餐失败，显示本地缓存"));
    } finally {
      setSyncing(false);
    }
  }


  async function refreshUrl() {
    if (!selected) return;
    setRefreshing(true);
    setError("");
    setRefreshOk(false);
    try {
      const res = await apiFetch<{
        subscription: Subscription;
        subscription_url_changed?: boolean;
      }>(`/api/v1/subscriptions/${selected.id}/refresh-url`, {
        method: "POST",
        body: "{}",
      });
      if (res.subscription) {
        setSubs((prev) =>
          prev.map((s) => (s.id === selected.id ? { ...s, ...res.subscription } : s)),
        );
      }
      setConfirmRefresh(false);
      setRefreshOk(true);
      setCopied(false);
      setTimeout(() => setRefreshOk(false), 4000);
    } catch (e) {
      setError(friendlyError(e, "更新订阅地址失败"));
      setConfirmRefresh(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function copyUrl() {
    if (!selected?.subscription_url) return;
    await navigator.clipboard.writeText(selected.subscription_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function saveQr() {
    const canvas = qrCanvasRef.current;
    if (!canvas || !selected) return;
    const name = (selected.plan_code || selected.plan_name || "subscription")
      .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
      .slice(0, 40);
    const link = document.createElement("a");
    link.download = `habibi-${name}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setQrSaved(true);
    setTimeout(() => setQrSaved(false), 1600);
  }

  return (
    <Shell>
      <div className="page-head">
        <h1>连接</h1>
        <p>切换套餐查看对应订阅信息，复制链接导入客户端。</p>
      </div>

      {claimed && (
        <p className="alert-ok" style={{ marginTop: 12 }}>
          套餐已开通。可在上方切换套餐，复制对应订阅链接。
        </p>
      )}
      {error && (
        <p className="alert-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {loading && (
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>同步订阅中…</p>
      )}

      {!loading && subs.length === 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            还没有可用连接
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            先领取免费试用套餐，系统会自动生成订阅链接。
          </p>
          <Link href="/plans?welcome=1" className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
            去领取套餐
          </Link>
        </div>
      )}

      {!loading && subs.length > 0 && (
        <>
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--muted)",
                marginBottom: 8,
                letterSpacing: "0.04em",
              }}
            >
              我的套餐 {subs.length > 1 ? `（${subs.length}）` : ""}
            </div>
            <div
              className="plan-switcher"
              role="tablist"
              aria-label="切换套餐"
            >
              {subs.map((sub) => {
                const active = sub.id === selectedId;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className="plan-switch-item"
                    data-active={active}
                    onClick={() => selectPlan(sub.id)}
                  >
                    <span className="plan-switch-name">{planLabel(sub)}</span>
                    <span className="plan-switch-meta">{statusLabel(sub.status)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sub-desktop-grid">
          {selected && (
            <div className="panel" style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div>
                  <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                    {planLabel(selected)}
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                    {selected.upstream_username || `${site.brand} 订阅`}
                    {syncing ? " · 同步中…" : ""}
                  </p>
                </div>
                {selected.status === "active" ? (
                  <span className="status-chip">
                    <span className="status-dot" />
                    {statusLabel(selected.status)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                    {statusLabel(selected.status)}
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 16,
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ color: "var(--muted)" }}>到期</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    {selected.expires_at
                      ? new Date(selected.expires_at).toLocaleDateString()
                      : "-"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--muted)" }}>可用设备数</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    {selected.online_ip_limit ?? "-"}
                  </div>
                </div>
              </div>

              <TrafficUsage
                usedBytes={selected.used_traffic_bytes}
                limitBytes={selected.data_limit_bytes}
              />

              {selected.subscription_url ? (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      当前套餐订阅链接
                    </div>
                    <div className="view-toggle" role="tablist" aria-label="链接展示方式">
                      <button
                        type="button"
                        role="tab"
                        data-active={linkView === "link"}
                        aria-selected={linkView === "link"}
                        onClick={() => setLinkView("link")}
                      >
                        链接
                      </button>
                      <button
                        type="button"
                        role="tab"
                        data-active={linkView === "qr"}
                        aria-selected={linkView === "qr"}
                        onClick={() => setLinkView("qr")}
                      >
                        二维码
                      </button>
                    </div>
                  </div>

                  {linkView === "link" ? (
                    <code className="sub-url">{selected.subscription_url}</code>
                  ) : (
                    <div className="sub-qr-wrap">
                      <div className="sub-qr-card">
                        <QRCodeCanvas
                          value={selected.subscription_url}
                          size={196}
                          level="M"
                          includeMargin
                          bgColor="#ffffff"
                          fgColor="#0a1628"
                          ref={qrCanvasRef}
                        />
                      </div>
                      <p className="sub-qr-hint">用客户端扫码导入订阅</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ minWidth: 140 }}
                        onClick={saveQr}
                      >
                        {qrSaved ? "已保存" : "保存二维码"}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 12 }}
                    onClick={copyUrl}
                  >
                    {copied ? "已复制，去客户端粘贴" : "复制订阅链接"}
                  </button>
                  <div className="client-import">
                    <div className="client-import-head">
                      <strong>一键导入客户端</strong>
                      <span>请先安装对应应用</span>
                    </div>
                    <div className="client-import-grid">
                      <a
                        href={clashImportUrl(selected.subscription_url)}
                        className="client-import-button"
                      >
                        <span className="client-import-logo client-import-logo--clash" aria-hidden>
                          C
                        </span>
                        <span>
                          <strong>导入 Clash</strong>
                          <small>电脑 / Android</small>
                        </span>
                      </a>
                      <a
                        href={shadowrocketImportUrl(selected.subscription_url)}
                        className="client-import-button"
                      >
                        <span className="client-import-logo client-import-logo--rocket" aria-hidden>
                          S
                        </span>
                        <span>
                          <strong>导入 Shadowrocket</strong>
                          <small>iPhone / iPad</small>
                        </span>
                      </a>
                    </div>
                    <p className="client-import-note">
                      点击后会唤起客户端；未安装或唤起失败时，请复制上方链接手动添加订阅。
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 10 }}
                    onClick={() => setConfirmRefresh(true)}
                    disabled={refreshing}
                  >
                    更新订阅地址
                  </button>
                  {refreshOk && (
                    <p className="alert-ok" style={{ marginTop: 10 }}>
                      已生成新链接，请重新复制并导入客户端。旧链接已失效。
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, color: "var(--amber)", margin: 0 }}>
                    暂无订阅链接，可尝试更新订阅地址，或联系管理员。
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 10 }}
                    onClick={() => setConfirmRefresh(true)}
                    disabled={refreshing}
                  >
                    更新订阅地址
                  </button>
                </div>
              )}
            </div>
          )}

          <section className="section sub-import-panel" style={{ paddingTop: 28 }}>
            <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
              如何使用
            </h2>
            <p className="section-lead">新手推荐使用本站 APP，也支持常见第三方客户端。</p>
            <div className="usage-tabs" role="tablist" aria-label="选择使用方式">
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "official"}
                className="usage-tab"
                data-active={usageMode === "official"}
                onClick={() => selectUsageMode("official")}
              >
                本站 APP
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "third-party"}
                className="usage-tab"
                data-active={usageMode === "third-party"}
                onClick={() => selectUsageMode("third-party")}
              >
                第三方工具
              </button>
            </div>
            <div className="usage-guide">
              {usageMode === "official" ? (
              <article className="usage-card usage-card--primary">
                <div className="usage-card-head">
                  <div>
                    <span className="usage-card-kicker">推荐 · 最简单</span>
                    <h3>使用本站 APP</h3>
                  </div>
                  <span className="usage-card-badge">无需导入</span>
                </div>
                <p className="usage-card-desc">
                  下载并安装本站 APP，使用当前账号登录，套餐和线路会自动同步。
                </p>
                <div className="usage-download-row">
                  <Link href="/download" className="btn btn-primary usage-download-btn">
                    下载本站 APP
                  </Link>
                  <div className="usage-platform-links" aria-label="选择平台">
                    <Link href="/download">iOS</Link>
                    <Link href="/download">Android</Link>
                    <Link href="/download">Windows</Link>
                    <Link href="/download">macOS</Link>
                  </div>
                </div>
                <ol className="usage-mini-steps">
                  <li><span>1</span>下载并安装本站 APP</li>
                  <li><span>2</span>登录 {site.brand} 账号</li>
                  <li><span>3</span>选择线路，点击连接</li>
                </ol>
                <Link href="/guide" className="usage-card-link">
                  查看完整使用教程
                  <span aria-hidden>→</span>
                </Link>
              </article>
              ) : (
              <article className="usage-card">
                <div className="usage-card-head">
                  <div>
                    <span className="usage-card-kicker">兼容更多客户端</span>
                    <h3>使用第三方工具</h3>
                  </div>
                </div>
                <p className="usage-card-desc">
                  适用于 Shadowrocket、Clash、Hiddify 等支持订阅链接的工具。
                </p>
                <ol className="usage-mini-steps">
                  <li><span>1</span>在上方选择要使用的套餐</li>
                  <li><span>2</span>点击「复制订阅链接」</li>
                  <li><span>3</span>打开工具，添加订阅并粘贴链接</li>
                  <li><span>4</span>更新节点后选择线路连接</li>
                </ol>
                <p className="usage-card-note">订阅链接相当于密码，请勿转发给他人。</p>
                <Link href="/download" className="usage-card-link">
                  也可下载本站 APP（更简单）
                  <span aria-hidden>→</span>
                </Link>
              </article>
              )}
            </div>
          </section>
          </div>
        </>
      )}

      {confirmRefresh && (
        <div className="confirm-mask" role="dialog" aria-modal="true" aria-labelledby="refresh-title">
          <div className="confirm-sheet">
            <h3 id="refresh-title" className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              确认更新？
            </h3>
            <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--ink-soft)" }}>
              更新地址会重新生成新的订阅链接，旧链接立即失效，客户端需重新导入。
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={refreshing}
                onClick={refreshUrl}
              >
                {refreshing ? "更新中…" : "确认更新"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={refreshing}
                onClick={() => setConfirmRefresh(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </Shell>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p style={{ paddingTop: 24, color: "var(--muted)", fontSize: 14 }}>加载中…</p>
        </Shell>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
