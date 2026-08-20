"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import PromoNav from "../../components/PromoNav";
import InviteCrossCard from "../../components/InviteCrossCard";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import {
  fetchAuthInviteCampaign,
  type InviteCampaignAuth,
} from "../../lib/campaigns";
import { friendlyError } from "../../lib/errors";
import { formatCents } from "../../lib/money";
import { site, supportTelegramUrl } from "../../lib/site";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

type Overview = {
  invite_code: string;
  promo_enabled: boolean;
  today_earnings_cents: number;
  yesterday_earnings_cents: number;
  total_earnings_cents: number;
  available_cents: number;
  pending_cents: number;
  withdrawn_cents: number;
  levels: Record<number, number>;
  team_total: number;
  new_users_7d: number;
};

type Tools = {
  invite_code: string;
  invite_url: string;
  web_invite_url?: string;
  tg_invite_url?: string | null;
};

type PromoRules = {
  enabled: boolean;
  max_level: number;
  levels: { level: number; rate_bps: number }[];
  settle_days: number;
  min_withdraw_cents: number;
  withdraw_fee_bps: number;
  withdraw_methods: string[];
  catalog_spend_enabled: boolean;
  iap_commission_base_bps: number;
  play_commission_base_bps: number;
  first_commission_base_bps: number;
  renew_commission_base_bps: number;
};

function formatRate(bps: number) {
  const pct = bps / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function methodLabel(m: string, copy: ReturnType<typeof t>["promo"]) {
  const map: Record<string, string> = {
    usdt: "USDT",
    bank: copy.bank,
    alipay: copy.alipay,
    wechat: copy.wechat,
  };
  return map[m] || m.toUpperCase();
}

function levelExplain(level: number, copy: ReturnType<typeof t>["promo"]): { title: string; body: string } {
  if (level === 1) return { title: copy.lv1Title, body: copy.lv1Body };
  if (level === 2) return { title: copy.lv2Title, body: copy.lv2Body };
  if (level === 3) return { title: copy.lv3Title, body: copy.lv3Body };
  return { title: copy.lvNTitle(level), body: copy.lvNBody(level) };
}

export default function PromoPage() {
  const locale = useLocale();
  const copy = t(locale);
  const router = useLocaleRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [rules, setRules] = useState<PromoRules | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [openLevel, setOpenLevel] = useState<number | null>(1);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<InviteCampaignAuth | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    Promise.all([
      apiFetch<Overview>("/api/v1/promo/overview"),
      apiFetch<Tools>("/api/v1/promo/tools"),
      apiFetch<PromoRules>("/api/v1/promo/rules"),
      fetchAuthInviteCampaign(locale),
    ])
      .then(([o, t, r, campaign]) => {
        if (cancelled) return;
        setOverview(o);
        setTools(t);
        setRules(r);
        setActivity(campaign);
        const first = (r.levels || []).find((l) => l.rate_bps > 0)?.level;
        if (first != null) setOpenLevel(first);
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, copy.common.loadFailed));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  useEffect(() => {
    if (!qrOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen]);

  async function copyText(text: string, key: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError(copy.promo.copyFail);
    }
  }

  function webInviteUrl(t: Tools) {
    return t.web_invite_url || t.invite_url;
  }

  const l1Rate = rules?.levels.find((l) => l.level === 1)?.rate_bps;
  const activeLevels = (rules?.levels || []).filter((l) => l.rate_bps > 0);
  const supportUrl = supportTelegramUrl();
  const qrValue = tools ? webInviteUrl(tools) : "";

  return (
    <Shell>
      <div className="promo-page">
        <div className="page-head">
          <h1>{copy.promo.title}</h1>
        </div>
        <PromoNav />

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="promo-loading">{copy.promo.loading}</p>
        ) : (
          <>
            {overview && !overview.promo_enabled && (
              <p className="alert-error" style={{ marginTop: 12 }}>
                {copy.promo.disabled}
              </p>
            )}

            <section className="promo-invite-stage" aria-labelledby="promo-invite-title">
              <div className="promo-invite-stage-inner">
                <p className="promo-invite-kicker">{copy.promo.kicker}</p>
                <h2 id="promo-invite-title" className="promo-invite-title">
                  {site.brand}
                </h2>
                <p className="promo-invite-lead">{copy.promo.lead}</p>
                {l1Rate != null && l1Rate > 0 ? (
                  <div className="promo-invite-rate">
                    <span>{copy.promo.reward}</span>
                    <strong>{formatRate(l1Rate)}</strong>
                    <em>{copy.promo.rewardMeta}</em>
                  </div>
                ) : null}
              </div>
            </section>

            {activity ? <InviteCrossCard to="activity" campaign={activity} /> : null}

            <div className="promo-overview-layout">
              {tools && (
                <aside className="promo-section panel promo-tools-panel">
                  <div className="promo-section-head">
                    <h2 className="promo-section-title">{copy.promo.tools}</h2>
                    <span className="promo-section-hint">
                      {activity ? copy.promo.extraSameLink : copy.promo.toolsHint}
                    </span>
                  </div>

                  <div className="promo-tools-content">
                    <div className="promo-tools-copy">
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

                      <div className="promo-link-block">
                        <div className="promo-link-head">
                          <span className="promo-field-label">{copy.promo.inviteLink}</span>
                          <button
                            type="button"
                            className="promo-link-copy"
                            onClick={() => void copyText(webInviteUrl(tools), "web")}
                          >
                            {copied === "web" ? copy.common.copied : copy.common.copy}
                          </button>
                        </div>
                        <div className="promo-link-box">{webInviteUrl(tools)}</div>
                      </div>

                      <div className="promo-channel-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          style={{ minHeight: 44 }}
                          onClick={() => void copyText(webInviteUrl(tools), "web")}
                        >
                          {copied === "web" ? copy.promo.copiedLink : copy.promo.copyLink}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-block promo-qr-mobile-btn"
                          style={{ minHeight: 44 }}
                          onClick={() => setQrOpen(true)}
                        >
                          {copy.promo.showQr}
                        </button>
                      </div>
                    </div>

                    <div className="promo-tools-qr promo-tools-qr--desktop">
                      <div className="sub-qr-wrap">
                        <div className="sub-qr-card">
                          <QRCodeSVG value={qrValue} size={148} level="M" />
                        </div>
                        <p className="sub-qr-hint">{copy.promo.qrHint}</p>
                      </div>
                    </div>
                  </div>
                </aside>
              )}

              <div className="promo-overview-main">
                {overview && (
                  <section className="promo-hero promo-hero--overview">
                    <div className="promo-hero-primary">
                      <div className="promo-hero-label">{copy.promo.balance}</div>
                      <div className="promo-hero-value">
                        {formatCents(overview.available_cents)}
                      </div>
                      <span className="promo-hero-caption">
                        {copy.promo.yesterday} {formatCents(overview.yesterday_earnings_cents)} · {copy.promo.pending}{" "}
                        {formatCents(overview.pending_cents)}
                      </span>
                    </div>
                    <div className="promo-hero-meta">
                      <div className="promo-hero-meta-item">
                        <span>{copy.promo.today}</span>
                        <strong>{formatCents(overview.today_earnings_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>{copy.promo.total}</span>
                        <strong>{formatCents(overview.total_earnings_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>{copy.promo.withdrawn}</span>
                        <strong>{formatCents(overview.withdrawn_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>{copy.promo.invitees}</span>
                        <strong>{overview.team_total}</strong>
                      </div>
                    </div>
                    <div className="promo-hero-actions">
                      <Link
                        href="/promo/withdraw"
                        className="btn btn-primary"
                        style={{ minHeight: 44 }}
                      >
                        {copy.promo.goWithdraw}
                      </Link>
                      <Link
                        href="/promo/redeem"
                        className="btn btn-secondary"
                        style={{ minHeight: 44 }}
                      >
                        {copy.promo.goRedeem}
                      </Link>
                      <Link
                        href="/promo/team?tab=commissions"
                        className="btn btn-secondary"
                        style={{ minHeight: 44 }}
                      >
                        {copy.promo.commissions}
                      </Link>
                    </div>
                  </section>
                )}

                {rules && activeLevels.length > 0 && (
                  <section
                    className="promo-rules panel"
                    aria-labelledby="promo-rules-title"
                  >
                    <div className="promo-rules-head">
                      <h2 id="promo-rules-title" className="promo-section-title">
                        {copy.promo.rules}
                      </h2>
                      <span className="promo-section-hint">
                        {copy.promo.maxLevel(rules.max_level)}
                      </span>
                    </div>

                    <div
                      className="promo-rate-strip"
                      role="list"
                      aria-label={copy.promo.levelAria}
                    >
                      {activeLevels.map((lv) => {
                        const open = openLevel === lv.level;
                        return (
                          <button
                            key={lv.level}
                            type="button"
                            className="promo-rate-chip"
                            data-level={lv.level}
                            data-open={open}
                            role="listitem"
                            aria-expanded={open}
                            aria-controls={`promo-level-explain-${lv.level}`}
                            onClick={() =>
                              setOpenLevel((cur) =>
                                cur === lv.level ? null : lv.level,
                              )
                            }
                          >
                            <span>{copy.promo.level(lv.level)}</span>
                            <strong>{formatRate(lv.rate_bps)}</strong>
                          </button>
                        );
                      })}
                    </div>

                    {openLevel != null &&
                      (() => {
                        const lv = activeLevels.find((l) => l.level === openLevel);
                        if (!lv) return null;
                        const explain = levelExplain(lv.level, copy.promo);
                        const count = overview?.levels[lv.level] || 0;
                        return (
                          <div
                            id={`promo-level-explain-${lv.level}`}
                            className="promo-level-explain"
                            role="region"
                            aria-label={copy.promo.levelExplain(lv.level)}
                          >
                            <div className="promo-level-explain-top">
                              <strong>
                                {copy.promo.level(lv.level)} · {explain.title}
                              </strong>
                              <span>{formatRate(lv.rate_bps)}</span>
                            </div>
                            <p>{explain.body}</p>
                            {overview ? (
                              <p className="promo-level-count">
                                {copy.promo.people(count)}
                                {lv.level === 1
                                  ? copy.promo.new7d(overview.new_users_7d)
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}

                    <ul className="promo-rule-bullets">
                      <li>{copy.promo.ruleBody}</li>
                      <li>
                        {copy.promo.paidBase}
                        {rules.first_commission_base_bps !==
                        rules.renew_commission_base_bps
                          ? copy.promo.renewBase(
                              formatRate(rules.renew_commission_base_bps),
                            )
                          : ""}
                        {(rules.iap_commission_base_bps < 10000 ||
                          rules.play_commission_base_bps < 10000) &&
                          copy.promo.storeFee}
                        .
                      </li>
                      <li>
                        {copy.promo.settle(
                          rules.settle_days,
                          formatCents(rules.min_withdraw_cents),
                        )}
                        {rules.withdraw_methods?.length
                          ? `, ${rules.withdraw_methods.map((m) => methodLabel(m, copy.promo)).join("/")}`
                          : ""}
                        .
                      </li>
                      {rules.catalog_spend_enabled ? (
                        <li>
                          <Link className="promo-inline-link" href="/promo/redeem">
                            {copy.promo.catalog}
                          </Link>
                        </li>
                      ) : null}
                      <li>
                        {copy.promo.kol}
                        {supportUrl ? (
                          <>
                            {" "}
                            <a
                              className="promo-inline-link"
                              href={supportUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {copy.promo.tgSupport}
                            </a>
                          </>
                        ) : (
                          <>
                            {" "}
                            <Link className="promo-inline-link" href="/support">
                              {copy.promo.contact}
                            </Link>
                          </>
                        )}
                      </li>
                      <li>{copy.promo.ban}</li>
                    </ul>
                  </section>
                )}

              </div>
            </div>
          </>
        )}

        {qrOpen && tools && (
          <div
            className="confirm-mask"
            role="dialog"
            aria-modal="true"
            aria-label={copy.promo.qrTitle}
            onClick={() => setQrOpen(false)}
          >
            <div
              className="confirm-sheet promo-qr-sheet"
              onClick={(e) => e.stopPropagation()}
            >
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
                  <QRCodeSVG value={qrValue} size={180} level="M" />
                </div>
                <p className="sub-qr-hint">{copy.promo.qrHintLong}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
