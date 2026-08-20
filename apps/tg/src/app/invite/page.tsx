"use client";

import { useEffect, useState } from "react";
import TgShell from "../../components/TgShell";
import { apiFetch } from "../../lib/api";
import { friendlyError } from "../../lib/errors";
import { formatCents } from "../../lib/plan-format";
import { ensureSession } from "../../lib/session";
import { site, supportTelegramUrl, fetchTelegramPublicConfig } from "../../lib/site";
import {
  campaignSummary,
  fetchAuthInviteCampaign,
  requirementLines,
  type InviteCampaign,
} from "../../lib/campaigns";
import {
  fetchSignupTrialPromo,
  telegramSignupTrialPlan,
} from "../../lib/signup-trial";
import {
  haptic,
  hapticSuccess,
  openTelegramUrl,
  shareInvite,
} from "../../lib/telegram";

type Overview = {
  invite_code: string;
  promo_enabled: boolean;
  today_earnings_cents: number;
  total_earnings_cents: number;
  available_cents: number;
  pending_cents?: number;
  team_total: number;
  new_users_7d: number;
  min_withdraw_cents?: number;
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
      body: "通过您的邀请链接或邀请码注册的用户。他们付费后，按 L1 比例给您结算佣金。",
    };
  }
  if (level === 2) {
    return {
      title: "您的间接好友",
      body: "您的直接好友再邀请来的用户。他们付费后，按 L2 比例给您结算佣金。",
    };
  }
  if (level === 3) {
    return {
      title: "您的三级好友",
      body: "间接好友再邀请来的用户（下下级）。他们付费后，按 L3 比例给您结算佣金。",
    };
  }
  return {
    title: `您的 ${level} 级好友`,
    body: `由上一级（L${level - 1}）好友邀请注册的用户。他们付费后，按 L${level} 比例给您结算佣金。`,
  };
}

export default function TgInvitePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tools, setTools] = useState<Tools | null>(null);
  const [rules, setRules] = useState<PromoRules | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [loading, setLoading] = useState(true);
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const [trialPlan, setTrialPlan] = useState<string | null>(null);
  const [shareTemplate, setShareTemplate] = useState("");
  const [campaign, setCampaign] = useState<InviteCampaign | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedOk, setClaimedOk] = useState(false);
  const [tab, setTab] = useState<"reward" | "promo">("reward");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      try {
        const [o, t, r, promo, tgCfg, inviteCampaign] = await Promise.all([
          apiFetch<Overview>("/api/v1/promo/overview"),
          apiFetch<Tools>("/api/v1/promo/tools"),
          apiFetch<PromoRules>("/api/v1/promo/rules"),
          fetchSignupTrialPromo(),
          fetchTelegramPublicConfig(),
          fetchAuthInviteCampaign(),
        ]);
        if (cancelled) return;
        setOverview(o);
        setTools(t);
        setRules(r);
        setTrialPlan(telegramSignupTrialPlan(promo)?.name ?? null);
        setShareTemplate(tgCfg.invite_share_text);
        setCampaign(inviteCampaign);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(text: string, key: string) {
    if (!text) return;
    haptic("light");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      hapticSuccess();
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("复制失败，请长按选择文字");
    }
  }

  function shareText() {
    const l1 = rules?.levels.find((l) => l.level === 1);
    const tip = l1
      ? `好友付费你可得 ${formatRate(l1.rate_bps)} 永久回馈`
      : trialPlan
        ? `新用户注册即送「${trialPlan}」`
        : `一起用 ${site.brand}`;
    if (shareTemplate) {
      return shareTemplate
        .replaceAll("{brand}", site.brand)
        .replaceAll("{l1_rate}", l1 ? formatRate(l1.rate_bps) : "")
        .replaceAll("{trial_plan}", trialPlan || "");
    }
    return `我在用 ${site.brand}，${tip}，点链接：`;
  }

  function webInviteUrl(t: Tools) {
    return t.web_invite_url || t.invite_url;
  }

  function tgInviteUrl(t: Tools) {
    return t.tg_invite_url || null;
  }

  async function onClaimCampaign() {
    if (!campaign?.id) return;
    haptic("medium");
    setClaiming(true);
    setError("");
    try {
      await apiFetch(`/api/v1/campaigns/${campaign.id}/participate`, {
        method: "POST",
        body: JSON.stringify({ client: "h5" }),
      });
      setClaimedOk(true);
      const next = await fetchAuthInviteCampaign();
      setCampaign(next);
      hapticSuccess();
    } catch (e) {
      setError(friendlyError(e, "领取失败"));
    } finally {
      setClaiming(false);
    }
  }

  function onShareTelegram() {
    if (!tools) return;
    const url = tgInviteUrl(tools) || webInviteUrl(tools);
    if (!url) return;
    haptic("medium");
    shareInvite(url, shareText());
  }

  const l1Rate = rules?.levels.find((l) => l.level === 1)?.rate_bps;
  const activeLevels = (rules?.levels || []).filter((l) => l.rate_bps > 0);
  const progress = campaign?.invite_progress;
  const required = progress?.required_count ?? campaign?.required_count ?? 0;
  const current = progress?.current_count ?? 0;
  const pct = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  const perPlan = progress?.per_invite_plan || campaign?.per_invite_plan || null;
  const milestonePlan = campaign?.reward?.plan || null;
  const grantMode = progress?.grant_mode || campaign?.grant_mode || "auto";
  const perCap = Math.max(0, required - 1);
  const granted = progress?.per_invite_granted_count ?? 0;
  const reqs = progress?.requirements || campaign?.requirements;
  const reqLines = requirementLines(reqs);
  const campaignTitle = campaign?.ui.title?.trim() || "邀请达标";
  const campaignLead =
    campaign?.ui.subtitle?.trim() ||
    campaign?.ui.teaser?.trim() ||
    (campaign ? campaignSummary(campaign) : "");
  const showTabs = !loading && !!campaign;
  const showReward = !showTabs || tab === "reward";
  const showPromo = !showTabs || tab === "promo";

  return (
    <TgShell>
      <section className="invite-stage" aria-labelledby="invite-title">
        <div className="invite-stage-inner">
          <p className="invite-kicker">邀请有奖</p>
          <h1 id="invite-title" className="invite-title">
            {site.brand}
          </h1>
          <p className="invite-lead">
            {campaign
              ? "限时邀请奖励与长期返佣，同一邀请码。"
              : "邀请好友，享永久绑定的分佣"}
          </p>
          {trialPlan ? (
            <p className="invite-trial-chip">
              限时活动 · 注册即送「{trialPlan}」
            </p>
          ) : null}
          {!campaign && l1Rate != null && l1Rate > 0 ? (
            <div className="invite-hero-rate">
              <span>邀请回馈</span>
              <strong>{formatRate(l1Rate)}</strong>
              <em>永久 · 按实付金额</em>
            </div>
          ) : null}
        </div>
      </section>

      {error && <p className="alert-error">{error}</p>}
      {loading && (
        <p className="muted" style={{ marginTop: 16 }}>
          加载中…
        </p>
      )}

      {!loading && overview && !overview.promo_enabled && (
        <p className="alert-error">推广资格已停用，请联系客服。</p>
      )}

      {showTabs ? (
        <div className="invite-tabs" role="tablist" aria-label="邀请内容">
          <button
            type="button"
            className="invite-tab"
            role="tab"
            aria-selected={tab === "reward"}
            data-active={tab === "reward"}
            onClick={() => {
              haptic("light");
              setTab("reward");
            }}
          >
            邀请奖励
          </button>
          <button
            type="button"
            className="invite-tab"
            role="tab"
            aria-selected={tab === "promo"}
            data-active={tab === "promo"}
            onClick={() => {
              haptic("light");
              setTab("promo");
            }}
          >
            邀请返佣
          </button>
        </div>
      ) : null}

      {showReward && !loading && campaign ? (
        <section className="invite-campaign" aria-labelledby="invite-campaign-title">
          <div className="invite-campaign-head">
            <p className="invite-campaign-kicker">邀请达标</p>
            <h2 id="invite-campaign-title">{campaignTitle}</h2>
            {campaignLead ? <p className="invite-campaign-lead">{campaignLead}</p> : null}
          </div>

          <div className="invite-campaign-progress" aria-label="邀请进度">
            <div className="invite-campaign-progress-meta">
              <div>
                <strong>
                  {current}/{required}
                </strong>
                <span>合格邀请</span>
              </div>
              <div className="invite-campaign-pct">{pct}%</div>
            </div>
            <div className="invite-campaign-track">
              <div className="invite-campaign-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {perPlan || milestonePlan ? (
            <div className="invite-campaign-rewards">
              {perPlan ? (
                <div className="invite-campaign-reward">
                  <div className="invite-campaign-reward-kicker">每邀奖励</div>
                  <h3>每邀请 1 人送「{perPlan.name}」</h3>
                  <p>
                    已发放 {granted} / {perCap}
                    {perCap > 0 ? "（达标前）" : ""}
                  </p>
                </div>
              ) : null}
              {milestonePlan ? (
                <div className="invite-campaign-reward">
                  <div className="invite-campaign-reward-kicker">达标奖励</div>
                  <h3>
                    满 {required} 人送「{milestonePlan.name}」
                  </h3>
                  <p>
                    {campaign.already_participated || claimedOk
                      ? "已领取"
                      : grantMode === "claim"
                        ? "达标后可在本页领取"
                        : "达标后自动到账"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="invite-campaign-reqs">
            <h3>怎样算合格邀请</h3>
            <ul>
              {reqLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {grantMode === "claim" && campaign.can_participate ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              disabled={claiming}
              onClick={() => void onClaimCampaign()}
            >
              {claiming
                ? "领取中…"
                : campaign.ui.button_text?.trim() || "领取奖励"}
            </button>
          ) : null}
        </section>
      ) : null}

      {!loading && tools && (
        <section className="invite-share" aria-label="分享工具">
          <div className="invite-code-row">
            <div>
              <span className="invite-field-label">邀请码</span>
              <div className="invite-code">{tools.invite_code}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary invite-copy-btn"
              onClick={() => void copy(tools.invite_code, "code")}
            >
              {copied === "code" ? "已复制" : "复制"}
            </button>
          </div>

          <div className="invite-channel-actions">
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg invite-channel-btn"
              onClick={onShareTelegram}
            >
              <svg
                className="btn-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8-1.55 7.3c-.12.52-.42.65-.86.4l-2.38-1.75-1.15 1.1c-.13.13-.23.23-.47.23l.17-2.42 4.4-3.97c.19-.17-.04-.27-.3-.1l-5.44 3.42-2.34-.73c-.51-.16-.52-.51.1-.76l9.15-3.53c.42-.15.8.1.67.61z" />
              </svg>
              分享到 Telegram
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block invite-channel-btn"
              onClick={() => void copy(webInviteUrl(tools), "web")}
            >
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
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {copied === "web" ? "已复制通用链接" : "复制通用链接（微信等）"}
            </button>
          </div>

          <p className="invite-channel-hint">
            {tgInviteUrl(tools)
              ? "不同平台用不同的链接，转化率更高"
              : "尚未配置 Telegram 小程序直链，暂用通用网页链接分享。"}
          </p>

          {tgInviteUrl(tools) ? (
            <div className="invite-link-block">
              <div className="invite-link-head">
                <span className="invite-field-label">Telegram 分享链接（t.me）</span>
                <button
                  type="button"
                  className="invite-link-copy"
                  onClick={() => void copy(tgInviteUrl(tools)!, "tg")}
                >
                  {copied === "tg" ? "已复制" : "复制"}
                </button>
              </div>
              <div className="invite-link">{tgInviteUrl(tools)}</div>
            </div>
          ) : null}

          <div className="invite-link-block">
            <div className="invite-link-head">
              <span className="invite-field-label">通用分享链接（微信等其他媒体）</span>
              <button
                type="button"
                className="invite-link-copy"
                onClick={() => void copy(webInviteUrl(tools), "web")}
              >
                {copied === "web" ? "已复制" : "复制"}
              </button>
            </div>
            <div className="invite-link">{webInviteUrl(tools)}</div>
          </div>
        </section>
      )}

      {showPromo && !loading && rules && activeLevels.length > 0 && (
        <section className="invite-rules" aria-labelledby="rules-title">
          <div className="invite-rules-head">
            <h2 id="rules-title">邀请返佣规则</h2>
            <span>最高 {rules.max_level} 级</span>
          </div>

          <div
            className="invite-rate-strip"
            role="list"
            aria-label="层级回馈比例，点击查看说明"
          >
            {activeLevels.map((lv) => {
              const open = openLevel === lv.level;
              return (
                <button
                  key={lv.level}
                  type="button"
                  className="invite-rate-chip"
                  data-level={lv.level}
                  data-open={open}
                  role="listitem"
                  aria-expanded={open}
                  aria-controls={`invite-level-explain-${lv.level}`}
                  onClick={() => {
                    haptic("light");
                    setOpenLevel((cur) => (cur === lv.level ? null : lv.level));
                  }}
                >
                  <span>L{lv.level}</span>
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
              return (
                <div
                  id={`invite-level-explain-${lv.level}`}
                  className="invite-level-explain"
                  role="region"
                  aria-label={`L${lv.level} 说明`}
                >
                  <div className="invite-level-explain-top">
                    <strong>
                      L{lv.level} · {explain.title}
                    </strong>
                    <span>{formatRate(lv.rate_bps)}</span>
                  </div>
                  <p>{explain.body}</p>
                </div>
              );
            })()}

          <p className="invite-rate-hint">点按上方层级可查看对应好友关系说明</p>

          <ul className="invite-rule-bullets">
            <li>
              好友用你的链接/邀请码注册并付费后，按上表比例结算（L1 为直接好友）。
            </li>
            <li>
              按实付金额计算
              {rules.first_commission_base_bps !== rules.renew_commission_base_bps
                ? `；续费基数 ${formatRate(rules.renew_commission_base_bps)}`
                : ""}
              {(rules.iap_commission_base_bps < 10000 ||
                rules.play_commission_base_bps < 10000) &&
                "；应用商店渠道先扣渠道费再算佣金"}
              。
            </li>
            <li>
              约 {rules.settle_days} 天可提现
              {overview?.pending_cents != null && overview.pending_cents > 0
                ? `（待结算 ${formatCents(overview.pending_cents)}）`
                : ""}
              ；最低提现 {formatCents(rules.min_withdraw_cents)}
              {rules.withdraw_methods?.length
                ? `，支持 ${rules.withdraw_methods.map(methodLabel).join("/")}`
                : ""}
              。
            </li>
            {rules.catalog_spend_enabled ? (
              <li>佣金可兑话费、礼品卡或 VPN 套餐。</li>
            ) : null}
            <li>
              如果你是 KOL 或者有一定的社媒粉丝量，可以联系我们的客服获取更高级别的推广计划。
              {supportTelegramUrl() ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="invite-inline-link"
                    onClick={() => {
                      haptic("light");
                      openTelegramUrl(supportTelegramUrl());
                    }}
                  >
                    联系TG客服
                  </button>
                </>
              ) : null}
            </li>
            <li>禁止刷单、自买自返，违者取消资格。</li>
          </ul>
        </section>
      )}

      {showPromo && !loading && overview && (
        <section className="invite-earn" aria-label="收益概览">
          <div className="invite-earn-head">
            <h2>我的收益</h2>
            <span>近 7 日新增 {overview.new_users_7d} 人</span>
          </div>
          <div className="invite-earn-primary">
            <span>可提现</span>
            <strong>{formatCents(overview.available_cents)}</strong>
          </div>
          <div className="invite-earn-grid">
            <div>
              <span>今日</span>
              <strong>{formatCents(overview.today_earnings_cents)}</strong>
            </div>
            <div>
              <span>累计</span>
              <strong>{formatCents(overview.total_earnings_cents)}</strong>
            </div>
            <div>
              <span>累计邀请</span>
              <strong>{overview.team_total}</strong>
            </div>
          </div>
          <p className="invite-earn-foot">提现请到官网推广中心，或联系客服处理。</p>
        </section>
      )}
    </TgShell>
  );
}
