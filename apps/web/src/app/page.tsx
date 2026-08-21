"use client";

import { useEffect, useState, type ReactNode } from "react";
import HelpLinks from "../components/HelpLinks";
import Link from "../components/LocaleLink";
import { useLocale } from "../components/LocaleProvider";
import Shell from "../components/Shell";
import { getToken } from "../lib/auth";
import { t } from "../lib/copy";
import {
  detectDownloadPlatform,
  orderDownloadPlatforms,
  type DownloadPlatformId,
} from "../lib/platform";
import { downloadPlatforms } from "../lib/site";
import { fetchSignupTrialPromo } from "../lib/signup-trial";

const giftIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <rect x="4" y="11" width="16" height="9" rx="1.6" />
    <path d="M4 11h16M12 11v9M12 11c0-3-1.2-5-3.4-5S6 9.2 8.2 11H12c2.2-1.8 3.2-5 1.4-5S12 8 12 11Z" />
  </svg>
);

const promoIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 16.5l5-5 3.5 3.5L20 7.5" />
    <path d="M20 7.5h-4.8M20 7.5v4.8" />
  </svg>
);

const featureIcons = [
  <svg key="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M12 3.5 5.5 6.2v5.1c0 4.1 2.7 7.8 6.5 9.2 3.8-1.4 6.5-5.1 6.5-9.2V6.2L12 3.5Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>,
  <svg key="speed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M5 16.5A7.5 7.5 0 0 1 18.5 9" />
    <path d="M12 12.5 16 8.5" />
    <circle cx="12" cy="16.5" r="1.4" />
    <path d="M4.5 16.5h15" />
  </svg>,
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.5 3.6 8.5S14.4 17.9 12 20.5C9.6 17.9 8.4 15 8.4 12S9.6 6.1 12 3.5Z" />
  </svg>,
  <svg key="access" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12h8M12 8v8" />
  </svg>,
];

const heroMesh = (
  <svg className="hero-mesh" viewBox="0 0 520 520" aria-hidden>
    <g className="hero-mesh-stack">
      <rect x="200" y="200" width="120" height="120" rx="14" transform="rotate(45 260 260)" />
      <rect x="175" y="175" width="170" height="170" rx="20" transform="rotate(22.5 260 260)" />
      <rect x="150" y="150" width="220" height="220" rx="26" />
    </g>
    <g className="hero-mesh-links">
      <path d="M410 260 335 130.1 185 130.1 110 260 185 389.9 335 389.9Z" />
      <path d="M459.2 145 260 30 60.8 145 60.8 375 260 490 459.2 375Z" />
      <path d="M260 260 410 260M260 260 335 130.1M260 260 185 130.1M260 260 110 260M260 260 185 389.9M260 260 335 389.9" />
      <path d="M410 260 459.2 145M410 260 459.2 375M335 130.1 459.2 145M335 130.1 260 30M185 130.1 260 30M185 130.1 60.8 145M110 260 60.8 145M110 260 60.8 375M185 389.9 60.8 375M185 389.9 260 490M335 389.9 260 490M335 389.9 459.2 375" />
    </g>
    <g className="hero-mesh-nodes">
      <circle cx="459.2" cy="145" r="4" />
      <circle cx="260" cy="30" r="4" />
      <circle cx="60.8" cy="145" r="4" />
      <circle cx="60.8" cy="375" r="4" />
      <circle cx="260" cy="490" r="4" />
      <circle cx="459.2" cy="375" r="4" />
      <circle cx="410" cy="260" r="5.5" className="is-lit" />
      <circle cx="335" cy="130.1" r="5.5" />
      <circle cx="185" cy="130.1" r="5.5" className="is-lit" />
      <circle cx="110" cy="260" r="5.5" />
      <circle cx="185" cy="389.9" r="5.5" />
      <circle cx="335" cy="389.9" r="5.5" className="is-lit" />
      <circle cx="260" cy="260" r="8" className="is-core" />
    </g>
  </svg>
);

const downloadIcons: Record<DownloadPlatformId, ReactNode> = {
  ios: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
    </svg>
  ),
  android: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 18c0 .6.4 1 1 1h1v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H6v10ZM3.5 8C2.7 8 2 8.7 2 9.5v6c0 .8.7 1.5 1.5 1.5S5 16.3 5 15.5v-6C5 8.7 4.3 8 3.5 8Zm17 0c-.8 0-1.5.7-1.5 1.5v6c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-6c0-.8-.7-1.5-1.5-1.5ZM15.5 1.1l1.2-2.1c.1-.2 0-.5-.2-.6-.2-.1-.5 0-.6.2l-1.2 2.2A7.3 7.3 0 0 0 12 0c-.9 0-1.8.2-2.7.8L8.1-1.4c-.1-.2-.4-.3-.6-.2-.2.1-.3.4-.2.6L8.5 1.1A6.9 6.9 0 0 0 5.1 6h13.8a6.9 6.9 0 0 0-3.4-4.9ZM9.5 3.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Zm5 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6Z" />
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.5 10.2 4.4v7.1H3V5.5Zm8.1-1.2L21 2.8v8.7h-9.9V4.3ZM3 13.5h7.2v7.1L3 19.5v-6Zm8.1 0H21v8.7l-9.9-1.4v-7.3Z" />
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3s1.7-.8 3.1-.8 1.9.8 3.1.8 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.8 5.6c.7-.9 1.2-2.1 1.1-3.3-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.2-1.6Z" />
    </svg>
  ),
};

const platformById = Object.fromEntries(downloadPlatforms.map((p) => [p.id, p])) as Record<
  DownloadPlatformId,
  (typeof downloadPlatforms)[number]
>;

function richText(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export default function Home() {
  const locale = useLocale();
  const copy = t(locale).home;
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [trialPlan, setTrialPlan] = useState<string | null>(null);
  const [leadIndex, setLeadIndex] = useState(0);
  const [inviteTab, setInviteTab] = useState<"gift" | "promo">("gift");
  const [downloadPlatform, setDownloadPlatform] = useState<DownloadPlatformId | null>(null);

  useEffect(() => {
    setDownloadPlatform(detectDownloadPlatform());
  }, []);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setReady(true);
    void fetchSignupTrialPromo().then((promo) => {
      if (promo.enabled && promo.web) {
        setTrialPlan(promo.plan?.name?.trim() || copy.trialPlanFallback);
      }
    });
  }, [copy.trialPlanFallback, locale]);

  useEffect(() => {
    const count = t(locale).home.leadIn.length;
    setLeadIndex(0);
    if (count < 2) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setLeadIndex((i) => (i + 1) % count);
    }, 2200);
    return () => window.clearInterval(id);
  }, [locale]);

  const orderedPlatforms = orderDownloadPlatforms(downloadPlatform).map((id) => platformById[id]);

  return (
    <Shell flush>
      <section className="hero">
        <div className="hero-bg" aria-hidden>
          <div className="hero-grid" />
          <div className="hero-beam" />
          {heroMesh}
        </div>
        <div className="hero-content">
          <div className="hero-copy">
            <h1 className="hero-title">{copy.slogan}</h1>
            {!loggedIn && trialPlan ? (
              <p className="hero-trial-chip">{copy.trialChip(trialPlan)}</p>
            ) : null}
            <p className="hero-lead hero-lead-rotating" aria-live="polite">
              <span key={leadIndex} className="hero-lead-swap">
                {copy.leadIn[leadIndex]}
              </span>
            </p>
            {!loggedIn && !trialPlan ? (
              <p className="hero-lead">{copy.leadOut}</p>
            ) : null}
            <div className="hero-cta">
              {!ready ? null : loggedIn ? (
                <>
                  <Link href="/subscription" className="btn btn-primary">
                    {copy.ctaConnect}
                  </Link>
                  <Link href="/plans" className="btn btn-secondary">
                    {copy.ctaPlans}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/register" className="btn btn-primary">
                    {trialPlan ? copy.ctaStartTrial : copy.ctaStart}
                  </Link>
                  <Link href="/login" className="btn btn-secondary">
                    {copy.ctaLogin}
                  </Link>
                </>
              )}
            </div>
            <div className="hero-downloads">
              <p className="hero-downloads-label">{copy.downloadLabel}</p>
              <div className="hero-download-row">
                {orderedPlatforms.map((platform) => {
                  const isCurrent = downloadPlatform === platform.id;
                  return (
                    <Link
                      key={platform.id}
                      href={`/download?platform=${platform.id}`}
                      className={
                        isCurrent
                          ? "hero-download-btn hero-download-btn--primary"
                          : "hero-download-btn hero-download-btn--icon"
                      }
                      aria-label={isCurrent ? undefined : platform.label}
                      title={isCurrent ? undefined : platform.label}
                    >
                      <span className="hero-download-icon" aria-hidden>
                        {downloadIcons[platform.id]}
                      </span>
                      {isCurrent ? platform.label : null}
                    </Link>
                  );
                })}
                <Link href="/download" className="hero-download-btn hero-download-btn--more">
                  {copy.downloadMore}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="habibi-pad">
        <section className="section">
          <h2 className="section-title">{copy.stepsTitle}</h2>
          <p className="section-lead">{copy.stepsLead}</p>
          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <div>
                <h3>{copy.step1Title}</h3>
                <p>{trialPlan ? copy.step1BodyTrial : copy.step1Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div>
                <h3>{trialPlan ? copy.step2TitleTrial : copy.step2Title}</h3>
                <p>{trialPlan ? copy.step2BodyTrial : copy.step2Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <div>
                <h3>{copy.step3Title}</h3>
                <p>{copy.step3Body}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ marginTop: 28 }}>
          <div className="home-invite-panel" data-tab={inviteTab}>
            <div className="home-invite-tabs" role="tablist" aria-label={copy.inviteTabsAria}>
              <button
                type="button"
                role="tab"
                id="home-invite-tab-gift"
                aria-selected={inviteTab === "gift"}
                aria-controls="home-invite-panel-gift"
                className="home-invite-tab"
                onClick={() => setInviteTab("gift")}
              >
                {copy.inviteTabGift}
              </button>
              <button
                type="button"
                role="tab"
                id="home-invite-tab-promo"
                aria-selected={inviteTab === "promo"}
                aria-controls="home-invite-panel-promo"
                className="home-invite-tab"
                onClick={() => setInviteTab("promo")}
              >
                {copy.inviteTabPromo}
              </button>
            </div>
            {inviteTab === "gift" ? (
              <Link
                href="/activity"
                id="home-invite-panel-gift"
                role="tabpanel"
                aria-labelledby="home-invite-tab-gift"
                className="home-invite-banner"
              >
                <p className="home-invite-kicker">
                  <span className="home-invite-icon" aria-hidden>
                    {giftIcon}
                  </span>
                  {copy.inviteKicker}
                </p>
                <h2 className="home-invite-title">{copy.inviteTitle}</h2>
                <p className="home-invite-lead">{copy.inviteLead}</p>
                <div className="home-invite-foot">
                  <dl className="home-invite-stats">
                    <div>
                      <dt>{copy.invitePerValue}</dt>
                      <dd>{copy.invitePerLabel}</dd>
                    </div>
                    <div>
                      <dt>{copy.inviteGoalValue}</dt>
                      <dd>{copy.inviteGoalLabel}</dd>
                    </div>
                  </dl>
                  <span className="home-invite-cta">{copy.inviteCta}</span>
                </div>
              </Link>
            ) : (
              <Link
                href="/promo"
                id="home-invite-panel-promo"
                role="tabpanel"
                aria-labelledby="home-invite-tab-promo"
                className="home-invite-banner"
              >
                <p className="home-invite-kicker">
                  <span className="home-invite-icon" aria-hidden>
                    {promoIcon}
                  </span>
                  {copy.promoKicker}
                </p>
                <h2 className="home-invite-title">{copy.promoTitle}</h2>
                <p className="home-invite-lead">{copy.promoLead}</p>
                <div className="home-invite-foot">
                  <dl className="home-invite-stats">
                    <div>
                      <dt>{copy.promoPerValue}</dt>
                      <dd>{copy.promoPerLabel}</dd>
                    </div>
                    <div>
                      <dt>{copy.promoGoalValue}</dt>
                      <dd>{copy.promoGoalLabel}</dd>
                    </div>
                  </dl>
                  <span className="home-invite-cta">{copy.promoCta}</span>
                </div>
              </Link>
            )}
          </div>
        </section>

        <section className="section" style={{ marginTop: 28 }}>
          <h2 className="section-title">{copy.featuresTitle}</h2>
          <div className="home-features">
            {copy.features.map((feature, i) => (
              <article key={feature.title} className="home-feature">
                <div className="home-feature-icon" aria-hidden>
                  {featureIcons[i]}
                </div>
                <div className="home-feature-body">
                  <h3>{feature.title}</h3>
                  <p>{richText(feature.body)}</p>
                  {feature.stats.length ? (
                    <dl className="home-feature-stats">
                      {feature.stats.map((stat) => (
                        <div key={stat.value} className="home-feature-stat">
                          <dt>{stat.value}</dt>
                          <dd>{stat.label}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        <HelpLinks />
      </div>
    </Shell>
  );
}
