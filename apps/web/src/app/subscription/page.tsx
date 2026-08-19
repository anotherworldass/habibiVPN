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
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

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
  plan_id: string | null;
  plan_code: string | null;
  plan_name: string | null;
  status: string;
  expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  subscription_url: string | null;
  client_urls?: ClientUrls | null;
  online_ip_limit: number | null;
  next_plan_ref: string | null;
  upstream_username?: string;
};

function statusLabel(status: string, copy: ReturnType<typeof t>["sub"]) {
  if (status === "active") return copy.statusActive;
  if (status === "expired") return copy.statusExpired;
  if (status === "disabled") return copy.statusDisabled;
  if (status === "none") return copy.statusNone;
  return status;
}

function planLabel(sub: Subscription, fallback: string) {
  return sub.plan_name || sub.plan_code || sub.next_plan_ref || fallback;
}

function clashImportUrl(url: string) {
  return `clash://install-config?url=${encodeURIComponent(url)}&name=${encodeURIComponent(site.brand)}`;
}

function shadowrocketImportUrl(url: string) {
  return `sub://${btoa(url)}#${encodeURIComponent(site.brand)}`;
}

function SubscriptionContent() {
  const copy = t(useLocale());
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
      .catch((e) => setError(friendlyError(e, copy.sub.loadFailed)))
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
  const subscriptionUrl =
    selected?.client_urls?.v2ray || selected?.subscription_url || null;
  const clashSubscriptionUrl =
    selected?.client_urls?.clash_meta || subscriptionUrl;
  const shadowrocketSubscriptionUrl =
    selected?.client_urls?.shadowrocket || subscriptionUrl;

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
      setError(friendlyError(e, copy.sub.syncFailed));
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
      setError(friendlyError(e, copy.sub.refreshFailed));
      setConfirmRefresh(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function copyUrl() {
    if (!subscriptionUrl) return;
    await navigator.clipboard.writeText(subscriptionUrl);
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
        <h1>{copy.sub.title}</h1>
        <p>{copy.sub.lead}</p>
      </div>

      {claimed && (
        <p className="alert-ok" style={{ marginTop: 12 }}>
          {copy.sub.claimed}
        </p>
      )}
      {error && (
        <p className="alert-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {loading && (
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>{copy.sub.syncing}</p>
      )}

      {!loading && subs.length === 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {copy.sub.emptyTitle}
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            {copy.sub.emptyLead}
          </p>
          <Link href="/plans?welcome=1" className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
            {copy.sub.claimCta}
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
              {copy.sub.myPlans}{subs.length > 1 ? `（${subs.length}）` : ""}
            </div>
            <div
              className="plan-switcher"
              role="tablist"
              aria-label={copy.sub.switchAria}
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
                    <span className="plan-switch-name">{planLabel(sub, copy.sub.fallbackPlan)}</span>
                    <span className="plan-switch-meta">{statusLabel(sub.status, copy.sub)}</span>
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
                    {planLabel(selected, copy.sub.fallbackPlan)}
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                    {selected.upstream_username || copy.sub.fallbackSub}
                    {syncing ? ` · ${copy.sub.syncingDot}` : ""}
                  </p>
                </div>
                {selected.status === "active" ? (
                  <span className="status-chip">
                    <span className="status-dot" />
                    {statusLabel(selected.status, copy.sub)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                    {statusLabel(selected.status, copy.sub)}
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
                  <div style={{ color: "var(--muted)" }}>{copy.sub.expires}</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    {selected.expires_at
                      ? new Date(selected.expires_at).toLocaleDateString()
                      : "-"}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--muted)" }}>{copy.sub.devices}</div>
                  <div style={{ marginTop: 4, fontWeight: 600 }}>
                    {selected.online_ip_limit ?? "-"}
                  </div>
                </div>
              </div>

              <TrafficUsage
                usedBytes={selected.used_traffic_bytes}
                limitBytes={selected.data_limit_bytes}
              />

              {subscriptionUrl ? (
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
                      {copy.sub.linkTitle}
                    </div>
                    <div className="view-toggle" role="tablist" aria-label={copy.sub.viewAria}>
                      <button
                        type="button"
                        role="tab"
                        data-active={linkView === "link"}
                        aria-selected={linkView === "link"}
                        onClick={() => setLinkView("link")}
                      >
                        {copy.sub.linkTab}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        data-active={linkView === "qr"}
                        aria-selected={linkView === "qr"}
                        onClick={() => setLinkView("qr")}
                      >
                        {copy.sub.qrTab}
                      </button>
                    </div>
                  </div>

                  {linkView === "link" ? (
                    <code className="sub-url">{subscriptionUrl}</code>
                  ) : (
                    <div className="sub-qr-wrap">
                      <div className="sub-qr-card">
                        <QRCodeCanvas
                          value={subscriptionUrl}
                          size={196}
                          level="M"
                          includeMargin
                          bgColor="#ffffff"
                          fgColor="#0a1628"
                          ref={qrCanvasRef}
                        />
                      </div>
                      <p className="sub-qr-hint">{copy.sub.qrHint}</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ minWidth: 140 }}
                        onClick={saveQr}
                      >
                        {qrSaved ? copy.sub.qrSaved : copy.sub.saveQr}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 12 }}
                    onClick={copyUrl}
                  >
                    {copied ? copy.sub.copiedPaste : copy.sub.copyLink}
                  </button>
                  <div className="client-import">
                    <div className="client-import-head">
                      <strong>{copy.sub.importTitle}</strong>
                      <span>{copy.sub.importNeedApp}</span>
                    </div>
                    <div className="client-import-grid">
                      <a
                        href={clashImportUrl(clashSubscriptionUrl || subscriptionUrl)}
                        className="client-import-button"
                      >
                        <span className="client-import-logo client-import-logo--clash" aria-hidden>
                          C
                        </span>
                        <span>
                          <strong>{copy.sub.importClash}</strong>
                          <small>{copy.sub.importClashHint}</small>
                        </span>
                      </a>
                      <a
                        href={shadowrocketImportUrl(
                          shadowrocketSubscriptionUrl || subscriptionUrl,
                        )}
                        className="client-import-button"
                      >
                        <span className="client-import-logo client-import-logo--rocket" aria-hidden>
                          S
                        </span>
                        <span>
                          <strong>{copy.sub.importSr}</strong>
                          <small>iPhone / iPad</small>
                        </span>
                      </a>
                    </div>
                    <p className="client-import-note">
                      {copy.sub.importNote}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 10 }}
                    onClick={() => setConfirmRefresh(true)}
                    disabled={refreshing}
                  >
                    {copy.sub.refresh}
                  </button>
                  {refreshOk && (
                    <p className="alert-ok" style={{ marginTop: 10 }}>
                      {copy.sub.refreshed}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, color: "var(--amber)", margin: 0 }}>
                    {copy.sub.noLink}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: 10 }}
                    onClick={() => setConfirmRefresh(true)}
                    disabled={refreshing}
                  >
                    {copy.sub.refresh}
                  </button>
                </div>
              )}
            </div>
          )}

          <section className="section sub-import-panel" style={{ paddingTop: 28 }}>
            <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
              {copy.sub.howTitle}
            </h2>
            <p className="section-lead">{copy.sub.howLead}</p>
            <div className="usage-tabs" role="tablist" aria-label={copy.sub.howAria}>
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "official"}
                className="usage-tab"
                data-active={usageMode === "official"}
                onClick={() => selectUsageMode("official")}
              >
                {copy.sub.appTab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "third-party"}
                className="usage-tab"
                data-active={usageMode === "third-party"}
                onClick={() => selectUsageMode("third-party")}
              >
                {copy.sub.thirdTab}
              </button>
            </div>
            <div className="usage-guide">
              {usageMode === "official" ? (
              <article className="usage-card usage-card--primary">
                <div className="usage-card-head">
                  <div>
                    <span className="usage-card-kicker">{copy.sub.appKicker}</span>
                    <h3>{copy.sub.appTitle}</h3>
                  </div>
                  <span className="usage-card-badge">{copy.sub.appBadge}</span>
                </div>
                <p className="usage-card-desc">
                  {copy.sub.appBody}
                </p>
                <div className="usage-download-row">
                  <Link href="/download" className="btn btn-primary usage-download-btn">
                    {copy.sub.appDownload}
                  </Link>
                  <div className="usage-platform-links" aria-label={copy.sub.platformAria}>
                    <Link href="/download">iOS</Link>
                    <Link href="/download">Android</Link>
                    <Link href="/download">Windows</Link>
                    <Link href="/download">macOS</Link>
                  </div>
                </div>
                <ol className="usage-mini-steps">
                  <li><span>1</span>{copy.sub.appStep1}</li>
                  <li><span>2</span>{copy.sub.appStep2}</li>
                  <li><span>3</span>{copy.sub.appStep3}</li>
                </ol>
                <Link href="/guide" className="usage-card-link">
                  {copy.sub.fullGuide}
                  <span aria-hidden>→</span>
                </Link>
              </article>
              ) : (
              <article className="usage-card">
                <div className="usage-card-head">
                  <div>
                    <span className="usage-card-kicker">{copy.sub.thirdKicker}</span>
                    <h3>{copy.sub.thirdTitle}</h3>
                  </div>
                </div>
                <p className="usage-card-desc">
                  {copy.sub.thirdBody}
                </p>
                <ol className="usage-mini-steps">
                  <li><span>1</span>{copy.sub.thirdStep1}</li>
                  <li><span>2</span>{copy.sub.thirdStep2}</li>
                  <li><span>3</span>{copy.sub.thirdStep3}</li>
                  <li><span>4</span>{copy.sub.thirdStep4}</li>
                </ol>
                <p className="usage-card-note">{copy.sub.thirdNote}</p>
                <Link href="/download" className="usage-card-link">
                  {copy.sub.alsoApp}
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
              {copy.sub.confirmTitle}
            </h3>
            <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--ink-soft)" }}>
              {copy.sub.confirmBody}
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={refreshing}
                onClick={refreshUrl}
              >
                {refreshing ? copy.sub.refreshing : copy.sub.confirmOk}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={refreshing}
                onClick={() => setConfirmRefresh(false)}
              >
                {copy.common.cancel}
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
          <p style={{ paddingTop: 24, color: "var(--muted)", fontSize: 14 }}>{t(useLocale()).common.loading}</p>
        </Shell>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
