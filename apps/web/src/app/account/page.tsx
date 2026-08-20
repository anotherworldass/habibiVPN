"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { useEffect, useState } from "react";
import HelpLinks from "../../components/HelpLinks";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { clearToken, getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { useLocale } from "../../components/LocaleProvider";
import {
  fetchPublicInviteCampaign,
  inviteCampaignSummary,
  type InviteCampaignPublic,
} from "../../lib/campaigns";
import { t } from "../../lib/copy";

type Me = {
  id: string;
  uid?: number;
  email?: string | null;
  subscription_count?: number;
  has_subscription?: boolean;
};

export default function AccountPage() {
  const copy = t(useLocale());
  const router = useLocaleRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [activity, setActivity] = useState<InviteCampaignPublic | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    apiFetch<{ user: Me }>("/api/v1/me")
      .then((res) => setMe(res.user))
      .catch((e) => setError(friendlyError(e, copy.common.loadFailed)))
      .finally(() => setReady(true));
    void fetchPublicInviteCampaign().then(setActivity);
  }, [router]);

  const uidText = ready ? (me?.uid != null ? String(me.uid) : "—") : "…";
  const emailText = ready ? me?.email || "—" : copy.account.loadingEmail;
  const planCount = ready ? me?.subscription_count ?? 0 : null;

  return (
    <Shell>
      <div className="account-page">
        <div className="page-head account-page-head">
          <div>
            <h1>{copy.account.title}</h1>
            <p className="account-page-lead-mobile">{copy.account.leadMobile}</p>
          </div>
          <p className="account-page-lead-desktop">
            {copy.account.leadDesktop}
          </p>
        </div>

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="account-desktop">
          <section className="account-identity" aria-label={copy.account.identityAria}>
            <div className="account-identity-copy">
              <span className="account-eyebrow">{copy.account.uid}</span>
              <div className="account-uid-value">{uidText}</div>
              <div className="account-email">{emailText}</div>
            </div>

            <Link href="/subscription" className="account-plan-chip">
              <strong>{planCount == null ? "…" : planCount}</strong>
              <span>{copy.account.plans}</span>
            </Link>

            <div className="account-identity-actions">
              <Link href="/subscription" className="btn btn-primary">
                {copy.account.openConnect}
              </Link>
              <Link href="/plans" className="btn btn-secondary">
                {copy.account.planCenter}
              </Link>
            </div>
          </section>

          <div className="account-desktop-body">
            <div className="account-desktop-main">
              <div className="account-link-stack">
                {activity ? (
                  <Link href="/activity" className="account-promo-card account-promo-card--featured">
                    <span className="account-promo-icon" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="4" y="11" width="16" height="9" rx="1.6" />
                        <path d="M4 11h16M12 11v9M12 11c0-3-1.2-5-3.4-5S6 9.2 8.2 11H12c2.2-1.8 3.2-5 1.4-5S12 8 12 11Z" />
                      </svg>
                    </span>
                    <div className="promo-entry-body">
                      <div className="promo-entry-kicker">{copy.account.activityKicker}</div>
                      <div className="promo-entry-title">
                        {activity.ui?.title?.trim() || copy.activity.fallbackTitle}
                      </div>
                      <div className="promo-entry-desc">
                        {inviteCampaignSummary(copy.activity, activity)}
                      </div>
                    </div>
                    <span className="account-chevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                ) : null}
                <Link href="/promo" className={activity ? "account-promo-card" : "account-promo-card account-promo-card--featured"}>
                  <span className="account-promo-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 12h16M12 4v16" />
                      <path d="M6.5 6.5h11v11h-11z" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-kicker">{copy.account.featured}</div>
                    <div className="promo-entry-title">{copy.account.promoTitle}</div>
                    <div className="promo-entry-desc">
                      {copy.account.promoDesc}
                    </div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>

                <Link href="/orders" className="account-nav-card">
                  <span className="account-nav-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M6 4h12a1 1 0 0 1 1 1v15l-3.5-2-3.5 2-3.5-2L5 20V5a1 1 0 0 1 1-1Z" />
                      <path d="M9 9h6M9 13h4" />
                    </svg>
                  </span>
                  <div className="promo-entry-body">
                    <div className="promo-entry-title">{copy.account.ordersTitle}</div>
                    <div className="promo-entry-desc">{copy.account.ordersDesc}</div>
                  </div>
                  <span className="account-chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </div>

              <button
                type="button"
                className="account-logout"
                onClick={() => {
                  clearToken();
                  router.push("/login");
                }}
              >
                <span className="account-logout-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                    <path d="m15 8 4 4-4 4M9 12h10" />
                  </svg>
                </span>
                <span>{copy.account.logout}</span>
              </button>
            </div>

            <aside className="account-desktop-aside">
              <HelpLinks />
            </aside>
          </div>
        </div>
      </div>
    </Shell>
  );
}
