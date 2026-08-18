"use client";

import { useSearchParams } from "next/navigation";
import Link from "../../components/LocaleLink";
import { useLocale } from "../../components/LocaleProvider";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { t } from "../../lib/copy";
import { Suspense, useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  validity_seconds?: number | null;
  data_limit_bytes?: number | null;
  is_free_claimable?: boolean;
  already_claimed?: boolean;
  group_id?: string | null;
};

type PlanGroup = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
};

function formatBytes(
  n: number | null | undefined,
  unlimited: string,
  traffic: string,
): { value: string; unit: string } | null {
  if (n == null) return null;
  if (n === 0) return { value: unlimited, unit: traffic };
  const gb = n / 1024 ** 3;
  if (gb >= 1) {
    return {
      value: gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1),
      unit: "GB",
    };
  }
  return { value: (n / 1024 ** 2).toFixed(0), unit: "MB" };
}

function formatDays(
  sec: number | null | undefined,
  days: string,
  hours: string,
): { value: string; unit: string } | null {
  if (sec == null) return null;
  if (sec % 86400 === 0) return { value: String(sec / 86400), unit: days };
  if (sec % 3600 === 0) return { value: String(sec / 3600), unit: hours };
  return null;
}

function PlanSpecs({
  days,
  traffic,
  durationLabel,
  trafficLabel,
}: {
  days: { value: string; unit: string } | null;
  traffic: { value: string; unit: string } | null;
  durationLabel: string;
  trafficLabel: string;
}) {
  if (!days && !traffic) return null;
  return (
    <p className="plan-specs">
      {days ? (
        <span>
          {durationLabel}{" "}
          <strong>
            {days.value}
            <small>{days.unit}</small>
          </strong>
        </span>
      ) : null}
      {days && traffic ? <span className="plan-specs-sep" aria-hidden>·</span> : null}
      {traffic ? (
        <span>
          {trafficLabel}{" "}
          <strong>
            {traffic.value}
            <small>{traffic.unit}</small>
          </strong>
        </span>
      ) : null}
    </p>
  );
}

function FreePlanCards({
  plans,
  loggedIn,
  claiming,
  onClaim,
}: {
  plans: Plan[];
  loggedIn: boolean;
  claiming: string | null;
  onClaim: (id: string) => void;
}) {
  const messages = t(useLocale());
  const plansCopy = messages.plans;
  if (!plans.length) return null;
  return (
    <section className="plans-section">
      <div className="plans-section-head">
        <h2>{plansCopy.freeTitle}</h2>
        <p>{plansCopy.freeLead}</p>
      </div>
      <div className="plans-grid">
        {plans.map((p) => {
          const traffic = formatBytes(
            p.data_limit_bytes,
            messages.common.unlimited,
            messages.common.traffic,
          );
          const days = formatDays(
            p.validity_seconds,
            messages.common.days,
            messages.common.hours,
          );
          return (
            <article key={p.id} className="plan-card plan-card--free">
              <span className="plan-badge plan-badge--free">{plansCopy.freeBadge}</span>
              <div className="plan-card-main">
                <h3 className="plan-card-title">{p.name}</h3>
                <div className="plan-price plan-price--free">¥0</div>
                <PlanSpecs
                  days={days}
                  traffic={traffic}
                  durationLabel={plansCopy.duration}
                  trafficLabel={plansCopy.traffic}
                />
                {p.description ? (
                  <p className="plan-card-desc">{p.description}</p>
                ) : null}
              </div>
              <div className="plan-card-cta">
                {!loggedIn ? (
                  <Link href="/register" className="btn btn-primary">
                    {plansCopy.registerClaim}
                  </Link>
                ) : p.already_claimed ? (
                  <Link href="/subscription" className="btn btn-secondary">
                    {plansCopy.goConnect}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={claiming === p.id}
                    onClick={() => onClaim(p.id)}
                  >
                    {claiming === p.id ? messages.common.claiming : plansCopy.freeBadge}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PaidPlanCards({
  plans,
  loggedIn,
  showEmpty,
  freeCount,
}: {
  plans: Plan[];
  loggedIn: boolean;
  showEmpty: boolean;
  freeCount: number;
}) {
  const messages = t(useLocale());
  const plansCopy = messages.plans;
  return (
    <section className="plans-section">
      <div className="plans-section-head">
        <h2>{plansCopy.paidTitle}</h2>
        <p>{plansCopy.paidLead}</p>
      </div>

      {showEmpty && plans.length === 0 && (
        <div className="plans-empty">
          {plansCopy.paidEmpty}
          {freeCount > 0 ? plansCopy.paidEmptyFree : ""}
        </div>
      )}

      <div className="plans-grid">
        {plans.map((p) => {
          const traffic = formatBytes(
            p.data_limit_bytes,
            messages.common.unlimited,
            messages.common.traffic,
          );
          const days = formatDays(
            p.validity_seconds,
            messages.common.days,
            messages.common.hours,
          );
          const dailyPrice =
            p.validity_seconds && p.validity_seconds > 0
              ? p.price_cents / 100 / (p.validity_seconds / 86400)
              : null;
          return (
            <article key={p.id} className="plan-card">
              <div className="plan-card-main">
                <h3 className="plan-card-title">{p.name}</h3>
                <div className="plan-price">
                  {(p.price_cents / 100).toFixed(2)}
                  <span>{p.currency}</span>
                </div>
                {dailyPrice != null ? (
                  <p className="plan-price-daily">
                    {plansCopy.perDay(dailyPrice.toFixed(2), p.currency)}
                  </p>
                ) : null}
                <PlanSpecs
                  days={days}
                  traffic={traffic}
                  durationLabel={plansCopy.duration}
                  trafficLabel={plansCopy.traffic}
                />
                {p.description ? (
                  <p className="plan-card-desc">{p.description}</p>
                ) : null}
              </div>
              <div className="plan-card-cta">
                <Link
                  href={
                    loggedIn
                      ? `/checkout/${encodeURIComponent(p.id)}`
                      : `/login?next=${encodeURIComponent(`/checkout/${p.id}`)}`
                  }
                  className="btn btn-primary"
                >
                  {plansCopy.buyNow}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlansContent() {
  const messages = t(useLocale());
  const plansCopy = messages.plans;
  const router = useLocaleRouter();
  const search = useSearchParams();
  const welcome = search.get("welcome") === "1";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [groups, setGroups] = useState<PlanGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
    setLoading(true);
    apiFetch<{ plans: Plan[]; groups?: PlanGroup[] }>("/api/v1/plans?client=h5")
      .then((res) => {
        const list = res.plans || [];
        const gs = res.groups || [];
        setPlans(list);
        setGroups(gs);
        const visible = gs.filter((g) => list.some((p) => p.group_id === g.id));
        if (visible.length) setActiveGroup(visible[0]!.id);
      })
      .catch((e) => setError(friendlyError(e, messages.common.loadFailed)))
      .finally(() => setLoading(false));
  }, []);

  async function claim(planId: string) {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    setClaiming(planId);
    setError("");
    try {
      const res = await apiFetch<{ subscription?: { id?: string } }>(
        "/api/v1/subscriptions/claim",
        {
          method: "POST",
          body: JSON.stringify({ plan_id: planId }),
        },
      );
      const id = res.subscription?.id;
      router.push(
        id
          ? `/subscription?claimed=1&id=${encodeURIComponent(id)}`
          : "/subscription?claimed=1",
      );
    } catch (e) {
      setError(friendlyError(e, messages.common.claimFailed));
    } finally {
      setClaiming(null);
    }
  }

  const visibleGroups = useMemo(
    () => groups.filter((g) => plans.some((p) => p.group_id === g.id)),
    [groups, plans],
  );
  const ungrouped = useMemo(
    () => plans.filter((p) => !p.group_id),
    [plans],
  );
  const showGroups =
    visibleGroups.length > 0 && plans.some((p) => !!p.group_id);

  const displayPlans = useMemo(() => {
    if (!showGroups) return plans;
    if (activeGroup === "__ungrouped__") return ungrouped;
    return plans.filter((p) => p.group_id === activeGroup);
  }, [showGroups, plans, activeGroup, ungrouped]);

  const freePlans = displayPlans.filter((p) => p.is_free_claimable);
  const paidPlans = displayPlans.filter((p) => !p.is_free_claimable);

  const tabItems = showGroups
    ? [
        ...visibleGroups.map((g) => ({ id: g.id, name: g.name })),
        ...(ungrouped.length
          ? [{ id: "__ungrouped__", name: plansCopy.other }]
          : []),
      ]
    : [];

  return (
    <Shell>
      <div className="plans-page">
        <div className="page-head plans-page-head">
          <div>
            <h1>{plansCopy.title}</h1>
            <p className="plans-page-lead-mobile">
              {plansCopy.leadMobile}
            </p>
          </div>
          <p className="plans-page-lead-desktop">
            {plansCopy.leadDesktop}
          </p>
        </div>

        {welcome && (
          <p className="alert-ok" style={{ marginTop: 12 }}>
            {plansCopy.welcome}
          </p>
        )}
        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading && <p className="plans-loading">{plansCopy.loading}</p>}

        {!loading && showGroups && tabItems.length > 0 && (
          <div className="plans-group-tabs" role="tablist">
            {tabItems.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeGroup === t.id}
                className={`plans-group-tab${activeGroup === t.id ? " is-active" : ""}`}
                onClick={() => setActiveGroup(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="plans-empty">{plansCopy.empty}</div>
        )}

        {!loading && freePlans.length > 0 && (
          <FreePlanCards
            plans={freePlans}
            loggedIn={loggedIn}
            claiming={claiming}
            onClaim={claim}
          />
        )}

        {!loading && plans.length > 0 && (
          <PaidPlanCards
            plans={paidPlans}
            loggedIn={loggedIn}
            showEmpty={!error}
            freeCount={freePlans.length}
          />
        )}

        {!loading && (
          <Link
            href={loggedIn ? "/promo" : "/login?next=/promo"}
            className="plans-invite-entry"
          >
            <span className="plans-invite-icon" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span className="plans-invite-body">
              <span className="plans-invite-title">{plansCopy.inviteTitle}</span>
              <span className="plans-invite-desc">
                {plansCopy.inviteDesc}
              </span>
            </span>
            <span className="plans-invite-chevron" aria-hidden>
              ›
            </span>
          </Link>
        )}
      </div>
    </Shell>
  );
}

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="plans-loading">{t(useLocale()).common.loading}</p>
        </Shell>
      }
    >
      <PlansContent />
    </Suspense>
  );
}
