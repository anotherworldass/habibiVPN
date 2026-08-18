"use client";

import { useEffect, useState } from "react";
import HelpLinks from "../components/HelpLinks";
import Link from "../components/LocaleLink";
import { useLocale } from "../components/LocaleProvider";
import Shell from "../components/Shell";
import { getToken } from "../lib/auth";
import { t } from "../lib/copy";

export default function Home() {
  const locale = useLocale();
  const copy = t(locale).home;
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setReady(true);
  }, []);

  return (
    <Shell flush>
      <section className="hero">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <div className="hero-copy">
            <p className="hero-brand">{copy.brand}</p>
            <h1 className="hero-title">{copy.slogan}</h1>
            <p className="hero-lead">{loggedIn ? copy.leadIn : copy.leadOut}</p>
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
                    {copy.ctaStart}
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
                <p>{copy.step1Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <div>
                <h3>{copy.step2Title}</h3>
                <p>{copy.step2Body}</p>
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
              <div className="step-num">·</div>
              <div>
                <h3>{copy.extra1Title}</h3>
                <p>{copy.extra1Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">·</div>
              <div>
                <h3>{copy.extra2Title}</h3>
                <p>{copy.extra2Body}</p>
              </div>
            </div>
            <div className="step">
              <div className="step-num">·</div>
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
