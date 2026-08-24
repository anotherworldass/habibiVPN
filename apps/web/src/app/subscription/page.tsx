"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import Shell from "../../components/Shell";
import { TrafficUsage } from "../../components/TrafficUsage";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { copyToClipboard } from "../../lib/clipboard";
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

type Plan = {
  is_free_claimable?: boolean;
  already_claimed?: boolean;
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

function isExpired(sub: Subscription) {
  if (sub.status === "expired") return true;
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) return true;
  return false;
}

function SubscriptionContent() {
  const locale = useLocale();
  const copy = t(locale);
  const router = useLocaleRouter();
  const search = useSearchParams();
  const claimed = search.get("claimed") === "1";
  const welcome = search.get("welcome") === "1";
  const queryId = search.get("id");

  const [subs, setSubs] = useState<Subscription[]>([]);
  const [hasClaimableFree, setHasClaimableFree] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<{
    key: keyof ClientUrls | "generic";
    label: string;
    url: string;
  } | null>(null);
  const manualUrlRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshOk, setRefreshOk] = useState(false);
  const [usageMode, setUsageMode] = useState<"official" | "third-party">("official");
  const [linkView, setLinkView] = useState<"link" | "qr">("link");
  const [qrSaved, setQrSaved] = useState(false);
  const qrSaveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    const deadline = welcome ? Date.now() + 12_000 : 0;

    async function fetchOnce(): Promise<Subscription[]> {
      const [subRes, planRes] = await Promise.all([
        apiFetch<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
        apiFetch<{ plans: Plan[] }>(
          `/api/v1/plans?client=h5&locale=${encodeURIComponent(locale)}`,
        ).catch(() => ({ plans: [] as Plan[] })),
      ]);
      const list = subRes.subscriptions || [];
      if (cancelled) return list;
      setSubs(list);
      const preferred =
        (queryId && list.find((s) => s.id === queryId)?.id) ||
        list.find((s) => s.status === "active")?.id ||
        list[0]?.id ||
        null;
      setSelectedId(preferred);
      setHasClaimableFree(
        (planRes.plans || []).some(
          (p) => p.is_free_claimable && !p.already_claimed,
        ),
      );
      return list;
    }

    void (async () => {
      try {
        let list = await fetchOnce();
        while (
          !cancelled &&
          welcome &&
          list.length === 0 &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          list = await fetchOnce();
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, copy.sub.loadFailed));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, queryId, locale, copy.sub.loadFailed, welcome]);

  const selected = useMemo(
    () => subs.find((s) => s.id === selectedId) || null,
    [subs, selectedId],
  );
  const subscriptionUrl =
    selected?.client_urls?.v2ray || selected?.subscription_url || null;
  const selectedExpired = selected ? isExpired(selected) : false;
  const displayUrl = manualCopy?.url || subscriptionUrl;

  useEffect(() => {
    if (!manualCopy) return;
    const el = manualUrlRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {
      // some WebViews reject setSelectionRange
    }
  }, [manualCopy]);

  async function selectPlan(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setCopied(false);
    setCopiedClient(null);
    setManualCopy(null);
    setQrSaved(false);
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
    if (!selected || isExpired(selected)) return;
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
      setManualCopy(null);
      setTimeout(() => setRefreshOk(false), 4000);
    } catch (e) {
      setError(friendlyError(e, copy.sub.refreshFailed));
      setConfirmRefresh(false);
    } finally {
      setRefreshing(false);
    }
  }

  async function copyUrl() {
    const url = displayUrl;
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setCopiedClient(null);
      setManualCopy(null);
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    setCopied(false);
    setCopiedClient(null);
    setLinkView("link");
    setManualCopy({
      key: "generic",
      label: copy.sub.linkTitle,
      url,
    });
  }

  async function copyClientUrl(key: keyof ClientUrls) {
    const url = selected?.client_urls?.[key] || subscriptionUrl;
    if (!url) return;
    const client = THIRD_PARTY_CLIENTS.find((item) => item.key === key);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(false);
      setCopiedClient(key);
      setManualCopy(null);
      setTimeout(() => setCopiedClient(null), 1600);
      return;
    }
    setCopied(false);
    setCopiedClient(null);
    setLinkView("link");
    setManualCopy({
      key,
      label: client?.label || key,
      url,
    });
  }

  function saveQr() {
    const canvas = qrSaveRef.current?.querySelector("canvas");
    if (!canvas) return;
    const href = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = href;
    a.download = "subscription-qr.png";
    a.click();
    setQrSaved(true);
    setTimeout(() => setQrSaved(false), 1600);
  }

  return (
    <Shell>
      <div className="subscription-page">
      <div className="page-head">
        <h1>{copy.sub.title}</h1>
        <p>{copy.sub.lead}</p>
      </div>

      {welcome && !loading && subs.length > 0 && (
        <p className="alert-ok" style={{ marginTop: 12 }}>
          {copy.sub.welcomeGranted}
        </p>
      )}
      {claimed && !welcome && (
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
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          {welcome ? copy.sub.granting : copy.sub.syncing}
        </p>
      )}

      {!loading && subs.length === 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {copy.sub.emptyTitle}
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            {hasClaimableFree ? copy.sub.emptyLead : copy.sub.emptyLeadBuy}
          </p>
          <Link
            href={hasClaimableFree ? "/plans?welcome=1" : "/plans"}
            className="btn btn-primary btn-block"
            style={{ marginTop: 16 }}
          >
            {hasClaimableFree ? copy.sub.claimCta : copy.sub.buyCta}
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
                      ? new Date(selected.expires_at).toLocaleString(
                          locale === "zh" ? "zh-CN" : "en-US",
                          {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
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

              {selectedExpired && (
                <Link
                  href="/plans"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 16 }}
                >
                  {copy.sub.buyCta}
                </Link>
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
                    <div className="sub-link-view-head">
                      <p className="client-copy-label">{copy.sub.linkTitle}</p>
                      <div className="view-toggle" role="group" aria-label={copy.sub.viewAria}>
                        <button
                          type="button"
                          data-active={linkView === "link"}
                          onClick={() => setLinkView("link")}
                        >
                          {copy.sub.linkTab}
                        </button>
                        <button
                          type="button"
                          data-active={linkView === "qr"}
                          onClick={() => setLinkView("qr")}
                        >
                          {copy.sub.qrTab}
                        </button>
                      </div>
                    </div>
                    {linkView === "qr" ? (
                      <div className="sub-qr-wrap">
                        <div className="sub-qr-card">
                          <QRCodeSVG value={subscriptionUrl} size={180} level="M" />
                        </div>
                        <div ref={qrSaveRef} className="sub-qr-save-canvas" aria-hidden>
                          <QRCodeCanvas value={subscriptionUrl} size={256} level="M" />
                        </div>
                        <p className="sub-qr-hint">{copy.sub.qrHint}</p>
                        <div className="sub-qr-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-block"
                            onClick={saveQr}
                          >
                            {qrSaved ? copy.sub.qrSaved : copy.sub.saveQr}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-block"
                            onClick={() => void copyUrl()}
                          >
                            {copied
                              ? copy.sub.copiedPaste
                              : manualCopy
                                ? copy.sub.copyFailed
                                : copy.sub.copyLink}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="client-copy-label">{copy.sub.clientCopyTitle}</p>
                        <div
                          className="client-copy-grid"
                          role="group"
                          aria-label={copy.sub.clientCopyTitle}
                        >
                          {THIRD_PARTY_CLIENTS.map(({ key, label }) => {
                            const justCopied = copiedClient === key;
                            const copyFailed = manualCopy?.key === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                className="client-copy-btn"
                                data-copied={justCopied}
                                data-failed={copyFailed}
                                onClick={() => void copyClientUrl(key)}
                              >
                                <strong>{label}</strong>
                                <span>
                                  {justCopied
                                    ? copy.sub.copiedShort
                                    : copyFailed
                                      ? copy.sub.copyFailed
                                      : copy.sub.copyShort}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {manualCopy ? (
                          <p className="client-copy-label">
                            {copy.sub.manualCopyTitle(manualCopy.label)}
                          </p>
                        ) : null}
                        <textarea
                          ref={manualUrlRef}
                          className="sub-url client-copy-generic-url"
                          data-manual={Boolean(manualCopy)}
                          readOnly
                          rows={3}
                          value={displayUrl || ""}
                          aria-label={
                            manualCopy?.key === "generic" || !manualCopy
                              ? copy.sub.linkTitle
                              : copy.sub.manualCopyTitle(manualCopy.label)
                          }
                          onClick={(e) => e.currentTarget.select()}
                          onFocus={(e) => {
                            e.currentTarget.select();
                            try {
                              e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
                            } catch {
                              // ignore
                            }
                          }}
                        />
                        {manualCopy ? (
                          <p className="sub-manual-hint">{copy.sub.manualCopyHint}</p>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          style={{ marginTop: 10 }}
                          onClick={() => void copyUrl()}
                        >
                          {copied
                            ? copy.sub.copiedPaste
                            : manualCopy?.key === "generic"
                              ? copy.sub.copyFailed
                              : copy.sub.copyLink}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--amber)" }}>
                    {copy.sub.noLink}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 16 }}
                  onClick={() => setConfirmRefresh(true)}
                  disabled={refreshing || selectedExpired}
                >
                  {copy.sub.refresh}
                </button>
                {selectedExpired && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13,
                      color: "var(--muted)",
                      lineHeight: 1.5,
                      textAlign: "center",
                    }}
                  >
                    {copy.sub.refreshDisabledExpired}
                  </p>
                )}
                {refreshOk && (
                  <p className="alert-ok" style={{ marginTop: 10 }}>
                    {copy.sub.refreshed}
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
