"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TgShell from "../components/TgShell";
import { friendlyError } from "../lib/errors";
import { formatBytes, formatDays } from "../lib/plan-format";
import {
  type ConnectMode,
  type UserPreferences,
  fetchPreferences,
  saveConnectPreference,
} from "../lib/preferences";
import { ensureSession } from "../lib/session";
import { site } from "../lib/site";
import {
  fetchSignupTrialPromo,
  telegramSignupTrialPlan,
} from "../lib/signup-trial";
import {
  getTelegramUser,
  haptic,
  hapticSuccess,
  isTelegramWebApp,
} from "../lib/telegram";

const INVITE_HINTS = [
  "好友付费后按邀请规则持续拿回馈",
  "佣金也可兑换话费或 VPN 套餐",
] as const;

function prefShortLabel(mode: ConnectMode) {
  if (mode === "official_app") return "独立 App";
  if (mode === "subscription_client") return "订阅客户端";
  return "";
}

export default function TgHomePage() {
  const [trialPlan, setTrialPlan] = useState<{
    name: string;
    validity_seconds: number | null;
    data_limit_bytes: number | null;
  } | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [savingPref, setSavingPref] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [error, setError] = useState("");
  const [tgName, setTgName] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [inTelegram, setInTelegram] = useState<boolean | null>(null);

  useEffect(() => {
    setInTelegram(isTelegramWebApp());
  }, []);

  useEffect(() => {
    let fadeTimer = 0;
    const timer = window.setInterval(() => {
      setHintVisible(false);
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => {
        setHintIndex((i) => (i + 1) % INVITE_HINTS.length);
        setHintVisible(true);
      }, 280);
    }, 3200);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  useEffect(() => {
    const user = getTelegramUser();
    if (user) {
      setTgName(
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          user.username ||
          "",
      );
    }

    let cancelled = false;
    (async () => {
      await ensureSession();
      try {
        const [pref, promo] = await Promise.all([
          fetchPreferences().catch(() => null),
          fetchSignupTrialPromo(),
        ]);
        if (cancelled) return;
        setPrefs(pref);
        setTrialPlan(telegramSignupTrialPlan(promo));
        setSurveyOpen(!pref || pref.connect_mode === "unset");
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function pickPref(mode: ConnectMode) {
    haptic("medium");
    setSavingPref(true);
    setError("");
    try {
      const saved = await saveConnectPreference({
        connect_mode: mode,
        source: "onboarding",
      });
      setPrefs(saved);
      setSurveyOpen(false);
      hapticSuccess();
    } catch (e) {
      setError(friendlyError(e, "保存偏好失败"));
    } finally {
      setSavingPref(false);
    }
  }

  const days = formatDays(trialPlan?.validity_seconds);
  const traffic = formatBytes(trialPlan?.data_limit_bytes);
  const specs = [days, traffic].filter(Boolean).join(" · ");
  const connectMode = prefs?.connect_mode ?? "unset";

  return (
    <TgShell home>
      <section className="brand-stage" aria-label={site.brand}>
        <div className="brand-stage-inner">
          <h1 className="brand-stage-name">{site.brand}</h1>
          <p className="brand-stage-tag">
            {tgName ? `${tgName}，` : ""}
            {site.slogan}
            {trialPlan ? `。新用户注册即送「${trialPlan.name}」。` : "。"}
          </p>
          {trialPlan ? (
            <p className="brand-stage-chip">
              限时活动 · 注册即送「{trialPlan.name}」
            </p>
          ) : null}
          <div className="brand-stage-cta stack" style={{ marginTop: 20 }}>
            <Link
              href={trialPlan ? "/connect" : "/plans"}
              className="btn btn-on-dark btn-block btn-lg"
            >
              {trialPlan ? "去连接" : "查看套餐"}
            </Link>
            <div>
              <Link
                href="/invite"
                className="btn btn-on-dark-ghost btn-block btn-lg"
              >
                邀请好友得奖励
              </Link>
              <p
                className="brand-stage-hint"
                data-visible={hintVisible}
                aria-live="polite"
              >
                {INVITE_HINTS[hintIndex]}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error && <p className="alert-error">{error}</p>}

      {trialPlan ? (
        <div className="card card--accent card--claim">
          <div className="plan-card-top">
            <span className="badge">限时活动</span>
            <div className="plan-price plan-price--free">¥0</div>
          </div>
          <h2 style={{ marginTop: 12 }}>{trialPlan.name}</h2>
          {specs ? <p className="plan-specs">{specs}</p> : null}
          <p>新用户注册即送，无需付款。适合先试网速与稳定性。</p>
        </div>
      ) : null}

      {connectMode !== "unset" && !surveyOpen ? (
        <button
          type="button"
          className="survey-compact"
          onClick={() => {
            haptic("light");
            setSurveyOpen(true);
          }}
        >
          <span className="survey-compact-copy">
            <span className="survey-compact-label">VPN使用习惯</span>
            <strong>{prefShortLabel(connectMode)}</strong>
          </span>
          <span className="survey-compact-action">修改</span>
        </button>
      ) : (
        <section className="survey-card" aria-labelledby="pref-survey-title">
          <div className="survey-head">
            <span className="survey-kicker">使用习惯设置</span>
            <span className="survey-meta">选一项即可</span>
          </div>
          <h2 id="pref-survey-title" className="survey-title">
            你平时更习惯哪种连接方式？
          </h2>
          <p className="survey-lead">
            告诉我们你的使用习惯，后续连接页会优先推荐更适合你的步骤，少走弯路。
          </p>

          <div
            className="survey-options"
            role="radiogroup"
            aria-label="连接方式偏好"
          >
            <button
              type="button"
              role="radio"
              aria-checked={connectMode === "official_app"}
              className="survey-option"
              data-active={connectMode === "official_app"}
              disabled={savingPref}
              onClick={() => void pickPref("official_app")}
            >
              <span className="survey-option-check" aria-hidden />
              <span className="survey-option-body">
                <strong>独立 App</strong>
                <span>下载登录后一键连接，不用手动导入订阅</span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={connectMode === "subscription_client"}
              className="survey-option"
              data-active={connectMode === "subscription_client"}
              disabled={savingPref}
              onClick={() => void pickPref("subscription_client")}
            >
              <span className="survey-option-check" aria-hidden />
              <span className="survey-option-body">
                <strong>订阅客户端</strong>
                <span>如 Shadowrocket、Clash、Hiddify，粘贴链接即可</span>
              </span>
            </button>
          </div>

          <p className="survey-footnote">
            {connectMode !== "unset"
              ? "选完会自动收起。也可稍后在「我的」里改。"
              : "可随时在「我的」里修改，各端同步。"}
          </p>
        </section>
      )}

      <div className="stack">
        <Link href="/plans" className="btn btn-ghost btn-block">
          查看全部套餐
        </Link>
      </div>

      {inTelegram === false && (
        <p className="home-footnote">浏览器预览 · 正式请在 Telegram 内打开</p>
      )}
    </TgShell>
  );
}
