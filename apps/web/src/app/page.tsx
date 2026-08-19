"use client";

import { useEffect, useState } from "react";
import HelpLinks from "../components/HelpLinks";
import Link from "../components/LocaleLink";
import { useLocale } from "../components/LocaleProvider";
import Shell from "../components/Shell";
import { getToken } from "../lib/auth";
import { t } from "../lib/copy";
import { fetchSignupTrialPromo } from "../lib/signup-trial";

const extraIcons = {
  nodes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.5 3.6 8.5S14.4 17.9 12 20.5C9.6 17.9 8.4 15 8.4 12S9.6 6.1 12 3.5Z" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="4.5" width="13" height="9" rx="2" />
      <rect x="4" y="10.5" width="13" height="9" rx="2" />
    </svg>
  ),
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
      <path d="M3.5 9h17M8 17h8" />
    </svg>
  ),
};

export default function Home() {
  const locale = useLocale();
  const copy = t(locale).home;
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [trialPlan, setTrialPlan] = useState<string | null>(null);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setReady(true);
    void fetchSignupTrialPromo().then((promo) => {
      if (promo.enabled && promo.web) {
        setTrialPlan(promo.plan?.name?.trim() || copy.trialPlanFallback);
      }
    });
  }, [copy.trialPlanFallback]);

  return (
    <Shell flush>
      <section className="hero">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="hero-brand">{copy.brand}</p>
            <h1 className="hero-title">{copy.slogan}</h1>
            {!loggedIn && trialPlan ? (
              <p className="hero-trial-chip">{copy.trialChip(trialPlan)}</p>
            ) : null}
            <p className="hero-lead">
              {loggedIn
                ? copy.leadIn
                : trialPlan
                  ? copy.leadOutTrial(trialPlan)
                  : copy.leadOut}
            </p>
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
          <h2 className="section-title">{copy.extraTitle}</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num" aria-hidden>
                {extraIcons.nodes}
              </div>
              <div>
                <h3>{copy.extra1Title}</h3>
                <p>{copy.extra1Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num" aria-hidden>
                {extraIcons.plans}
              </div>
              <div>
                <h3>{copy.extra2Title}</h3>
                <p>{copy.extra2Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num" aria-hidden>
                {extraIcons.web}
              </div>
              <div>
                <h3>{copy.extra3Title}</h3>
                <p>{copy.extra3Body}</p>
              </div>
            </div>
          </div>
        </section>
        <HelpLinks />
      </div>
    </Shell>
  );
}
