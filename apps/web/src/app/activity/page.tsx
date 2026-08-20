"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import {
  fetchAuthInviteCampaign,
  fetchPublicInviteCampaign,
  inviteCampaignSummary,
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
  const [claiming, setClaiming] = useState(false);
  const [claimedOk, setClaimedOk] = useState(false);

  async function load() {
    const token = !!getToken();
    setLoggedIn(token);
    const pub = await fetchPublicInviteCampaign();
    setPublicCampaign(pub);
    if (!token) {
      setAuthCampaign(null);
      setTools(null);
      return;
    }
    const [auth, promoTools] = await Promise.all([
      fetchAuthInviteCampaign(),
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
    if (!qrOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen]);

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
  const title = campaign?.ui?.title?.trim() || a.fallbackTitle;
  const subtitle = campaign?.ui?.subtitle?.trim() || inviteCampaignSummary(a, campaign || {});
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
      <div className="page-head">
        <p className="activity-kicker">{a.kicker}</p>
        <h1>{loading ? a.loading : title}</h1>
        {campaign ? <p className="section-lead">{subtitle}</p> : null}
      </div>

      {error ? (
        <p className="alert-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="section-lead" style={{ marginTop: 16 }}>
          {a.loading}
        </p>
      ) : !campaign ? (
        <p className="section-lead" style={{ marginTop: 16 }}>
          {a.empty}
        </p>
      ) : (
        <>
          <section className="activity-card" aria-label={a.progressAria}>
            <div className="activity-progress-meta">
              <strong>
                {current}/{required}
              </strong>
              <span>{a.qualified}</span>
            </div>
            <div className="activity-progress-track">
              <div className="activity-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            {!loggedIn ? <p className="activity-hint">{a.loginForProgress}</p> : null}
          </section>

          <div className="activity-rewards">
            {perPlan ? (
              <div className="activity-reward">
                <div className="activity-reward-kicker">{a.perInviteKicker}</div>
                <h2>{a.perInviteTitle(perPlan.name)}</h2>
                <p>
                  {loggedIn ? a.perInviteGranted(granted, perCap) : a.perInviteHint(perCap)}
                </p>
              </div>
            ) : null}
            {milestonePlan ? (
              <div className="activity-reward">
                <div className="activity-reward-kicker">{a.milestoneKicker}</div>
                <h2>{a.milestoneTitle(required, milestonePlan.name)}</h2>
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

          <section className="activity-card">
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
              style={{ marginTop: 16 }}
              disabled={claiming}
              onClick={() => void onClaim()}
            >
              {claiming
                ? copy.common.claiming
                : campaign.ui?.button_text?.trim() || copy.common.claim}
            </button>
          ) : null}

          {loggedIn && tools ? (
            <section className="activity-card" style={{ marginTop: 16 }}>
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
              <div className="promo-channel-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => void copyText(inviteUrl, "web")}
                >
                  {copied === "web" ? copy.promo.copiedLink : copy.promo.copyLink}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => setQrOpen(true)}
                >
                  {copy.promo.showQr}
                </button>
              </div>
            </section>
          ) : null}

          {!loggedIn ? (
            <div className="hero-cta" style={{ marginTop: 20 }}>
              <Link href="/register" className="btn btn-primary">
                {a.ctaRegister}
              </Link>
              <Link href="/login?next=/activity" className="btn btn-secondary">
                {a.ctaLogin}
              </Link>
            </div>
          ) : null}
        </>
      )}

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
    </Shell>
  );
}
