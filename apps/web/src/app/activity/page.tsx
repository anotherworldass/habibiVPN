"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import Shell from "../../components/Shell";
import InviteCrossCard from "../../components/InviteCrossCard";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import {
  campaignPlanName,
  fetchAuthInviteCampaign,
  fetchPublicInviteCampaign,
  inviteCampaignSummary,
  resolvedCampaignUi,
  type CampaignPlanBrief,
  type InviteCampaignAuth,
  type InviteCampaignPublic,
  type InviteRequirements,
} from "../../lib/campaigns";
import { t } from "../../lib/copy";
import { friendlyError } from "../../lib/errors";

type Tools = {
  invite_code: string;
  invite_url: string;
  web_invite_url?: string;
};

function webInviteUrl(tools: Tools) {
  return tools.web_invite_url || tools.invite_url;
}

function requirementLines(
  copy: ReturnType<typeof t>["activity"],
  reqs?: InviteRequirements | null,
) {
  if (!reqs) return [copy.reqSignup];
  const lines: string[] = [];
  if (reqs.paid) lines.push(copy.reqPaid);
  if (reqs.has_subscription) lines.push(copy.reqSub);
  if (reqs.has_traffic) {
    lines.push(reqs.min_traffic_bytes ? copy.reqTrafficMin : copy.reqTraffic);
  }
  return lines.length ? lines : [copy.reqSignup];
}

const planInfoIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11.2v5" />
    <circle cx="12" cy="8.2" r="0.95" fill="currentColor" stroke="none" />
  </svg>
);

function formatPlanDuration(
  plan: CampaignPlanBrief,
  copy: ReturnType<typeof t>,
) {
  if (plan.validity_calendar_months && plan.validity_calendar_months > 0) {
    return copy.activity.planMonths(plan.validity_calendar_months);
  }
  const sec = plan.validity_seconds;
  if (sec == null) return null;
  if (sec === 0) return copy.common.lifetime;
  if (sec % 86400 === 0) return `${sec / 86400} ${copy.common.days}`;
  if (sec % 3600 === 0) return `${sec / 3600} ${copy.common.hours}`;
  return null;
}

function formatPlanTraffic(plan: CampaignPlanBrief, copy: ReturnType<typeof t>) {
  const n = plan.data_limit_bytes;
  if (n == null) return null;
  if (n === 0) return copy.common.unlimited;
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

export default function ActivityPage() {
  const locale = useLocale();
  const copy = t(locale);
  const a = copy.activity;
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicCampaign, setPublicCampaign] = useState<InviteCampaignPublic | null>(null);
  const [authCampaign, setAuthCampaign] = useState<InviteCampaignAuth | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [copied, setCopied] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState<CampaignPlanBrief | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedOk, setClaimedOk] = useState(false);

  async function load() {
    const token = !!getToken();
    setLoggedIn(token);
    const pub = await fetchPublicInviteCampaign(locale);
    setPublicCampaign(pub);
    if (!token) {
      setAuthCampaign(null);
      setTools(null);
      return;
    }
    const [auth, promoTools] = await Promise.all([
      fetchAuthInviteCampaign(locale),
      apiFetch<Tools>("/api/v1/promo/tools").catch(() => null),
    ]);
    setAuthCampaign(auth);
    setTools(promoTools);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, copy.common.loadFailed));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (!qrOpen && !planOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQrOpen(false);
        setPlanOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen, planOpen]);

  const campaign = authCampaign || publicCampaign;
  const progress = authCampaign?.invite_progress;
  const required = progress?.required_count ?? campaign?.required_count ?? 0;
  const current = loggedIn ? progress?.current_count ?? 0 : 0;
  const perPlan = progress?.per_invite_plan || campaign?.per_invite_plan || null;
  const milestonePlan = campaign?.reward?.plan || null;
  const grantMode = progress?.grant_mode || campaign?.grant_mode || "auto";
  const perCap = Math.max(0, required - 1);
  const granted = progress?.per_invite_granted_count ?? 0;
  const reqs = progress?.requirements || campaign?.requirements;
  const pct = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  const ui = resolvedCampaignUi(campaign?.ui, locale);
  const title = ui.title || a.fallbackTitle;
  const subtitle = ui.subtitle || inviteCampaignSummary(a, campaign || {}, locale);
  const inviteUrl = tools ? webInviteUrl(tools) : "";
  const reqLines = useMemo(() => requirementLines(a, reqs), [a, reqs]);

  async function copyText(text: string, key: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setError(a.copyFail);
    }
  }

  async function onClaim() {
    if (!authCampaign?.id) return;
    setClaiming(true);
    setError("");
    try {
      await apiFetch(`/api/v1/campaigns/${authCampaign.id}/participate`, {
        method: "POST",
        body: JSON.stringify({ client: "h5" }),
      });
      setClaimedOk(true);
      await load();
    } catch (e) {
      setError(friendlyError(e, copy.common.claimFailed));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Shell>
      <div className="activity-page">
      {error ? (
        <p className="alert-error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <article className="activity-panel">
          <header className="activity-hero">
            <p className="activity-kicker">{a.kicker}</p>
            <h1>{a.loading}</h1>
          </header>
        </article>
      ) : !campaign ? (
        <>
          <article className="activity-panel">
            <header className="activity-hero">
              <p className="activity-kicker">{a.kicker}</p>
              <h1>{title}</h1>
              <p className="activity-lead">{a.empty}</p>
            </header>
          </article>
          <InviteCrossCard to="promo" />
        </>
      ) : (
        <>
        <article className="activity-panel">
          <header className="activity-hero">
            <p className="activity-kicker">{a.kicker}</p>
            <h1>{title}</h1>
            <p className="activity-lead">{subtitle}</p>
            <section className="activity-progress" aria-label={a.progressAria}>
              <div className="activity-progress-meta">
                <div>
                  <strong>
                    {current}/{required}
                  </strong>
                  <span>{a.qualified}</span>
                </div>
                <div className="activity-progress-pct">{pct}%</div>
              </div>
              <div className="activity-progress-track">
                <div className="activity-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              {!loggedIn ? <p className="activity-hint">{a.loginForProgress}</p> : null}
            </section>
          </header>

          <div className="activity-body">
            {perPlan || milestonePlan ? (
              <div className="activity-rewards">
                {perPlan ? (
                  <div className="activity-reward">
                    <div className="activity-reward-kicker">{a.perInviteKicker}</div>
                    <h2 className="activity-reward-title">
                      <span>
                        {a.perInviteTitle(campaignPlanName(locale, perPlan) || perPlan.name)}
                      </span>
                      <button
                        type="button"
                        className="activity-plan-info"
                        aria-label={a.planInfoAria}
                        onClick={() => setPlanOpen(perPlan)}
                      >
                        {planInfoIcon}
                      </button>
                    </h2>
                    <p>
                      {loggedIn ? a.perInviteGranted(granted, perCap) : a.perInviteHint(perCap)}
                    </p>
                  </div>
                ) : null}
                {milestonePlan ? (
                  <div className="activity-reward">
                    <div className="activity-reward-kicker">{a.milestoneKicker}</div>
                    <h2 className="activity-reward-title">
                      <span>
                        {a.milestoneTitle(
                          required,
                          campaignPlanName(locale, milestonePlan) || milestonePlan.name,
                        )}
                      </span>
                      <button
                        type="button"
                        className="activity-plan-info"
                        aria-label={a.planInfoAria}
                        onClick={() => setPlanOpen(milestonePlan)}
                      >
                        {planInfoIcon}
                      </button>
                    </h2>
                    <p>
                      {authCampaign?.already_participated || claimedOk
                        ? a.milestoneDone
                        : grantMode === "claim"
                          ? a.milestoneClaim
                          : a.milestoneAuto}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <section className="activity-section">
              <h2 className="activity-block-title">{a.reqTitle}</h2>
              <ul className="activity-req-list">
                {reqLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>

            {loggedIn && grantMode === "claim" && authCampaign?.can_participate ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={claiming}
                onClick={() => void onClaim()}
              >
                {claiming
                  ? copy.common.claiming
                  : ui.button_text || copy.common.claim}
              </button>
            ) : null}

            {loggedIn && tools ? (
              <section className="activity-section">
                <h2 className="activity-block-title">{a.shareTitle}</h2>
                <p className="activity-hint">{a.shareHint}</p>
                <div className="promo-field-label">{copy.promo.inviteCode}</div>
                <div className="promo-code-box">
                  <div className="font-display">{tools.invite_code}</div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }}
                    onClick={() => void copyText(tools.invite_code, "code")}
                  >
                    {copied === "code" ? copy.common.copied : copy.common.copy}
                  </button>
                </div>
                <div className="promo-link-block" style={{ marginTop: 12 }}>
                  <div className="promo-link-head">
                    <span className="promo-field-label">{copy.promo.inviteLink}</span>
                    <button
                      type="button"
                      className="promo-link-copy"
                      onClick={() => void copyText(inviteUrl, "web")}
                    >
                      {copied === "web" ? copy.common.copied : copy.common.copy}
                    </button>
                  </div>
                  <div className="promo-link-box">{inviteUrl}</div>
                </div>
                <div className="activity-share-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void copyText(inviteUrl, "web")}
                  >
                    {copied === "web" ? copy.promo.copiedLink : copy.promo.copyLink}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setQrOpen(true)}
                  >
                    {copy.promo.showQr}
                  </button>
                </div>
              </section>
            ) : null}

            {!loggedIn ? (
              <div className="hero-cta">
                <Link href="/register" className="btn btn-primary">
                  {a.ctaRegister}
                </Link>
                <Link href="/login?next=/activity" className="btn btn-secondary">
                  {a.ctaLogin}
                </Link>
              </div>
            ) : null}
          </div>
        </article>
        <InviteCrossCard to="promo" />
      </>
      )}
      </div>

      {qrOpen && inviteUrl ? (
        <div
          className="confirm-mask"
          role="dialog"
          aria-modal="true"
          aria-label={copy.promo.qrTitle}
          onClick={() => setQrOpen(false)}
        >
          <div className="confirm-sheet promo-qr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="promo-section-head" style={{ marginBottom: 16 }}>
              <h2 className="promo-section-title">{copy.promo.qrTitle}</h2>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
                onClick={() => setQrOpen(false)}
              >
                {copy.promo.close}
              </button>
            </div>
            <div className="sub-qr-wrap">
              <div className="sub-qr-card">
                <QRCodeSVG value={inviteUrl} size={180} level="M" />
              </div>
              <p className="sub-qr-hint">{copy.promo.qrHintLong}</p>
            </div>
          </div>
        </div>
      ) : null}

      {planOpen ? (
        <div
          className="confirm-mask"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-plan-title"
          onClick={() => setPlanOpen(null)}
        >
          <div className="confirm-sheet activity-plan-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="promo-section-head" style={{ marginBottom: 12 }}>
              <h2 id="activity-plan-title" className="promo-section-title">
                {a.planInfoTitle}
              </h2>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
                onClick={() => setPlanOpen(null)}
              >
                {copy.promo.close}
              </button>
            </div>
            <h3 className="activity-plan-sheet-name">
              {campaignPlanName(locale, planOpen) || planOpen.name}
            </h3>
            {planOpen.description ? (
              <p className="activity-plan-sheet-desc">{planOpen.description}</p>
            ) : null}
            {(() => {
              const duration = formatPlanDuration(planOpen, copy);
              const traffic = formatPlanTraffic(planOpen, copy);
              const devices =
                planOpen.device_slots != null && planOpen.device_slots > 0
                  ? String(planOpen.device_slots)
                  : null;
              if (!duration && !traffic && !devices && !planOpen.description) {
                return <p className="activity-plan-sheet-empty">{a.planInfoEmpty}</p>;
              }
              return (
                <dl className="activity-plan-sheet-specs">
                  {duration ? (
                    <div>
                      <dt>{copy.plans.duration}</dt>
                      <dd>{duration}</dd>
                    </div>
                  ) : null}
                  {traffic ? (
                    <div>
                      <dt>{copy.plans.traffic}</dt>
                      <dd>{traffic}</dd>
                    </div>
                  ) : null}
                  {devices ? (
                    <div>
                      <dt>{copy.sub.devices}</dt>
                      <dd>{devices}</dd>
                    </div>
                  ) : null}
                </dl>
              );
            })()}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
