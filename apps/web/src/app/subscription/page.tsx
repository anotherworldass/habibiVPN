"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import { TrafficUsage } from "../../components/TrafficUsage";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
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

const THIRD_PARTY_CLIENTS: Array<{
  key: keyof ClientUrls;
  label: string;
}> = [
  { key: "shadowrocket", label: "Shadowrocket" },
  { key: "clash_meta", label: "Clash" },
  { key: "hiddify", label: "Hiddify" },
  { key: "quantumult_x", label: "Quantumult X" },
  { key: "surge", label: "Surge" },
];

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
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [usageMode, setUsageMode] = useState<"official" | "third-party">("official");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    apiFetch<{ subscriptions: Subscription[] }>("/api/v1/subscriptions")
      .then((subRes) => {
        const list = subRes.subscriptions || [];
        setSubs(list);
        const preferred =
          (queryId && list.find((s) => s.id === queryId)?.id) ||
          list.find((s) => s.status === "active")?.id ||
          list[0]?.id ||
          null;
        setSelectedId(preferred);
      })
      .catch((e) => setError(friendlyError(e, copy.sub.loadFailed)))
      .finally(() => setLoading(false));
  }, [router, queryId, copy.sub.loadFailed]);

  const selected = useMemo(
    () => subs.find((s) => s.id === selectedId) || null,
    [subs, selectedId],
  );
  const subscriptionUrl =
    selected?.client_urls?.v2ray || selected?.subscription_url || null;

  async function selectPlan(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setCopied(false);
    setCopiedClient(null);
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
    setCopiedClient(null);
    setTimeout(() => setCopied(false), 1600);
  }

  async function copyClientUrl(key: keyof ClientUrls) {
    const url = selected?.client_urls?.[key] || subscriptionUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(false);
    setCopiedClient(key);
    setTimeout(() => setCopiedClient(null), 1600);
  }

  return (
    <Shell>
      <div className="subscription-page">
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
          {subs.length > 1 && (
          <div className="sub-plan-switcher-block">
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
          )}

          <div className="sub-desktop-layout">
          {selected && (
            <aside className="panel sub-plan-card">
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

              {!subscriptionUrl && (
                <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--amber)" }}>
                  {copy.sub.noLink}
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 16 }}
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
            </aside>
          )}

          <section className="section sub-guide-section">
            <div className="usage-tabs" role="tablist" aria-label={copy.sub.howAria}>
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "official"}
                className="usage-tab"
                data-active={usageMode === "official"}
                onClick={() => setUsageMode("official")}
              >
                {copy.sub.appTab}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={usageMode === "third-party"}
                className="usage-tab"
                data-active={usageMode === "third-party"}
                onClick={() => setUsageMode("third-party")}
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
                </div>
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
                {subscriptionUrl ? (
                  <>
                    <p className="client-copy-label">{copy.sub.clientCopyTitle}</p>
                    <div
                      className="client-copy-grid"
                      role="group"
                      aria-label={copy.sub.clientCopyTitle}
                    >
                      {THIRD_PARTY_CLIENTS.map(({ key, label }) => {
                        const justCopied = copiedClient === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            className="client-copy-btn"
                            data-copied={justCopied}
                            onClick={() => void copyClientUrl(key)}
                          >
                            <strong>{label}</strong>
                            <span>{justCopied ? copy.sub.copiedShort : copy.sub.copyShort}</span>
                          </button>
                        );
                      })}
                    </div>
                    <code className="sub-url client-copy-generic-url">
                      {subscriptionUrl}
                    </code>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ marginTop: 10 }}
                      onClick={() => void copyUrl()}
                    >
                      {copied ? copy.sub.copiedPaste : copy.sub.copyLink}
                    </button>
                  </>
                ) : (
                  <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--amber)" }}>
                    {copy.sub.noLink}
                  </p>
                )}
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

      </div>
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
