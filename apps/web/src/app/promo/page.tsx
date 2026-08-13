"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PromoNav from "../../components/PromoNav";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatCents } from "../../lib/money";
import { site, supportTelegramUrl } from "../../lib/site";

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

function methodLabel(m: string) {
  const map: Record<string, string> = {
    usdt: "USDT",
    bank: "银行卡",
    alipay: "支付宝",
    wechat: "微信",
  };
  return map[m] || m.toUpperCase();
}

function levelExplain(level: number): { title: string; body: string } {
  if (level === 1) {
    return {
      title: "您的直接好友",
      body: "通过您的邀请链接或邀请码注册的用户。他们付费后，按第 1 层比例给您结算佣金。",
    };
  }
  if (level === 2) {
    return {
      title: "您的间接好友",
      body: "您的直接好友再邀请来的用户。他们付费后，按第 2 层比例给您结算佣金。",
    };
  }
  if (level === 3) {
    return {
      title: "您的三层好友",
      body: "间接好友再邀请来的用户（下下级）。他们付费后，按第 3 层比例给您结算佣金。",
    };
  }
  return {
    title: `您的 ${level} 层好友`,
    body: `由上一层（第 ${level - 1} 层）好友邀请注册的用户。他们付费后，按第 ${level} 层比例给您结算佣金。`,
  };
}

export default function PromoPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [rules, setRules] = useState<PromoRules | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [openLevel, setOpenLevel] = useState<number | null>(1);
  const [loading, setLoading] = useState(true);

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
    ])
      .then(([o, t, r]) => {
        if (cancelled) return;
        setOverview(o);
        setTools(t);
        setRules(r);
        const first = (r.levels || []).find((l) => l.rate_bps > 0)?.level;
        if (first != null) setOpenLevel(first);
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!qrOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrOpen]);

  async function copy(text: string, key: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("复制失败，请手动长按选择");
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
          <h1>推广中心</h1>
        </div>
        <PromoNav />

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="promo-loading">加载中…</p>
        ) : (
          <>
            {overview && !overview.promo_enabled && (
              <p className="alert-error" style={{ marginTop: 12 }}>
                推广资格已停用，请联系客服。
              </p>
            )}

            <section className="promo-invite-stage" aria-labelledby="promo-invite-title">
              <div className="promo-invite-stage-inner">
                <p className="promo-invite-kicker">邀请有奖</p>
                <h2 id="promo-invite-title" className="promo-invite-title">
                  {site.brand}
                </h2>
                <p className="promo-invite-lead">邀请好友，享永久绑定的分佣</p>
                {l1Rate != null && l1Rate > 0 ? (
                  <div className="promo-invite-rate">
                    <span>邀请回馈</span>
                    <strong>{formatRate(l1Rate)}</strong>
                    <em>永久 · 按实付金额</em>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="promo-overview-layout">
              {tools && (
                <aside className="promo-section panel promo-tools-panel">
                  <div className="promo-section-head">
                    <h2 className="promo-section-title">推广工具</h2>
                    <span className="promo-section-hint">分享即绑定</span>
                  </div>

                  <div className="promo-tools-content">
                    <div className="promo-tools-copy">
                      <div className="promo-field-label">邀请码</div>
                      <div className="promo-code-box">
                        <div className="font-display">{tools.invite_code}</div>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }}
                          onClick={() => void copy(tools.invite_code, "code")}
                        >
                          {copied === "code" ? "已复制" : "复制"}
                        </button>
                      </div>

                      <div className="promo-link-block">
                        <div className="promo-link-head">
                          <span className="promo-field-label">邀请链接</span>
                          <button
                            type="button"
                            className="promo-link-copy"
                            onClick={() => void copy(webInviteUrl(tools), "web")}
                          >
                            {copied === "web" ? "已复制" : "复制"}
                          </button>
                        </div>
                        <div className="promo-link-box">{webInviteUrl(tools)}</div>
                      </div>

                      <div className="promo-channel-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          style={{ minHeight: 44 }}
                          onClick={() => void copy(webInviteUrl(tools), "web")}
                        >
                          {copied === "web" ? "已复制链接" : "复制邀请链接"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-block promo-qr-mobile-btn"
                          style={{ minHeight: 44 }}
                          onClick={() => setQrOpen(true)}
                        >
                          查看二维码
                        </button>
                      </div>
                    </div>

                    <div className="promo-tools-qr promo-tools-qr--desktop">
                      <div className="sub-qr-wrap">
                        <div className="sub-qr-card">
                          <QRCodeSVG value={qrValue} size={148} level="M" />
                        </div>
                        <p className="sub-qr-hint">扫码注册即永久绑定</p>
                      </div>
                    </div>
                  </div>
                </aside>
              )}

              <div className="promo-overview-main">
                {overview && (
                  <section className="promo-hero promo-hero--overview">
                    <div className="promo-hero-primary">
                      <div className="promo-hero-label">可提现余额</div>
                      <div className="promo-hero-value">
                        {formatCents(overview.available_cents)}
                      </div>
                      <span className="promo-hero-caption">
                        昨日 {formatCents(overview.yesterday_earnings_cents)} · 待结算{" "}
                        {formatCents(overview.pending_cents)}
                      </span>
                    </div>
                    <div className="promo-hero-meta">
                      <div className="promo-hero-meta-item">
                        <span>今日收益</span>
                        <strong>{formatCents(overview.today_earnings_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>累计收益</span>
                        <strong>{formatCents(overview.total_earnings_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>已提现</span>
                        <strong>{formatCents(overview.withdrawn_cents)}</strong>
                      </div>
                      <div className="promo-hero-meta-item">
                        <span>邀请人数</span>
                        <strong>{overview.team_total}</strong>
                      </div>
                    </div>
                    <div className="promo-hero-actions">
                      <Link
                        href="/promo/withdraw"
                        className="btn btn-primary"
                        style={{ minHeight: 44 }}
                      >
                        去提现
                      </Link>
                      <Link
                        href="/promo/team?tab=commissions"
                        className="btn btn-secondary"
                        style={{ minHeight: 44 }}
                      >
                        佣金明细
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
                        佣金规则
                      </h2>
                      <span className="promo-section-hint">
                        最高 {rules.max_level} 层
                      </span>
                    </div>

                    <div
                      className="promo-rate-strip"
                      role="list"
                      aria-label="层级回馈比例，点击查看说明"
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
                            <span>{lv.level} 层</span>
                            <strong>{formatRate(lv.rate_bps)}</strong>
                          </button>
                        );
                      })}
                    </div>

                    {openLevel != null &&
                      (() => {
                        const lv = activeLevels.find((l) => l.level === openLevel);
                        if (!lv) return null;
                        const explain = levelExplain(lv.level);
                        const count = overview?.levels[lv.level] || 0;
                        return (
                          <div
                            id={`promo-level-explain-${lv.level}`}
                            className="promo-level-explain"
                            role="region"
                            aria-label={`第 ${lv.level} 层说明`}
                          >
                            <div className="promo-level-explain-top">
                              <strong>
                                {lv.level} 层 · {explain.title}
                              </strong>
                              <span>{formatRate(lv.rate_bps)}</span>
                            </div>
                            <p>{explain.body}</p>
                            {overview ? (
                              <p className="promo-level-count">
                                当前 {count} 人
                                {lv.level === 1
                                  ? ` · 近 7 日新增 ${overview.new_users_7d}`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}

                    <ul className="promo-rule-bullets">
                      <li>
                        好友用你的链接/邀请码注册并付费后，按上表比例结算（第 1
                        层为直接好友）。
                      </li>
                      <li>
                        按实付金额计算
                        {rules.first_commission_base_bps !==
                        rules.renew_commission_base_bps
                          ? `；续费基数 ${formatRate(rules.renew_commission_base_bps)}`
                          : ""}
                        {(rules.iap_commission_base_bps < 10000 ||
                          rules.play_commission_base_bps < 10000) &&
                          "；应用商店渠道先扣渠道费再算佣金"}
                        。
                      </li>
                      <li>
                        约 {rules.settle_days} 天到可提现；最低提现{" "}
                        {formatCents(rules.min_withdraw_cents)}
                        {rules.withdraw_methods?.length
                          ? `，支持 ${rules.withdraw_methods.map(methodLabel).join("/")}`
                          : ""}
                        。
                      </li>
                      {rules.catalog_spend_enabled ? (
                        <li>佣金可兑话费、礼品卡或 VPN 套餐。</li>
                      ) : null}
                      <li>
                        KOL / 社媒达人可联系客服申请更高推广计划。
                        {supportUrl ? (
                          <>
                            {" "}
                            <a
                              className="promo-inline-link"
                              href={supportUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              联系TG客服
                            </a>
                          </>
                        ) : (
                          <>
                            {" "}
                            <Link className="promo-inline-link" href="/support">
                              联系客服
                            </Link>
                          </>
                        )}
                      </li>
                      <li>禁止刷单、自买自返，违者取消资格。</li>
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
            aria-label="邀请二维码"
            onClick={() => setQrOpen(false)}
          >
            <div
              className="confirm-sheet promo-qr-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="promo-section-head" style={{ marginBottom: 16 }}>
                <h2 className="promo-section-title">邀请二维码</h2>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: 32, padding: "0 12px", fontSize: 13 }}
                  onClick={() => setQrOpen(false)}
                >
                  关闭
                </button>
              </div>
              <div className="sub-qr-wrap">
                <div className="sub-qr-card">
                  <QRCodeSVG value={qrValue} size={180} level="M" />
                </div>
                <p className="sub-qr-hint">扫码注册即永久绑定邀请关系</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
