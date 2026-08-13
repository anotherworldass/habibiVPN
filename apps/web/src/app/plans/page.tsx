"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

function formatBytes(n?: number | null): { value: string; unit: string } | null {
  if (n == null) return null;
  if (n === 0) return { value: "不限", unit: "流量" };
  const gb = n / 1024 ** 3;
  if (gb >= 1) {
    return {
      value: gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1),
      unit: "GB",
    };
  }
  return { value: (n / 1024 ** 2).toFixed(0), unit: "MB" };
}

function formatDays(sec?: number | null): { value: string; unit: string } | null {
  if (sec == null) return null;
  if (sec % 86400 === 0) return { value: String(sec / 86400), unit: "天" };
  if (sec % 3600 === 0) return { value: String(sec / 3600), unit: "小时" };
  return null;
}

function PlanSpecs({
  days,
  traffic,
}: {
  days: { value: string; unit: string } | null;
  traffic: { value: string; unit: string } | null;
}) {
  if (!days && !traffic) return null;
  return (
    <p className="plan-specs">
      {days ? (
        <span>
          时长{" "}
          <strong>
            {days.value}
            <small>{days.unit}</small>
          </strong>
        </span>
      ) : null}
      {days && traffic ? <span className="plan-specs-sep" aria-hidden>·</span> : null}
      {traffic ? (
        <span>
          流量{" "}
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
  if (!plans.length) return null;
  return (
    <section className="plans-section">
      <div className="plans-section-head">
        <h2>限时免费</h2>
        <p>适合先试用，一键开通。</p>
      </div>
      <div className="plans-grid">
        {plans.map((p) => {
          const traffic = formatBytes(p.data_limit_bytes);
          const days = formatDays(p.validity_seconds);
          return (
            <article key={p.id} className="plan-card plan-card--free">
              <span className="plan-badge plan-badge--free">免费领取</span>
              <div className="plan-card-main">
                <h3 className="plan-card-title">{p.name}</h3>
                <div className="plan-price plan-price--free">¥0</div>
                <PlanSpecs days={days} traffic={traffic} />
                {p.description ? (
                  <p className="plan-card-desc">{p.description}</p>
                ) : null}
              </div>
              <div className="plan-card-cta">
                {!loggedIn ? (
                  <Link href="/register" className="btn btn-primary">
                    注册领取
                  </Link>
                ) : p.already_claimed ? (
                  <Link href="/subscription" className="btn btn-secondary">
                    去连接
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={claiming === p.id}
                    onClick={() => onClaim(p.id)}
                  >
                    {claiming === p.id ? "开通中…" : "免费领取"}
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
  return (
    <section className="plans-section">
      <div className="plans-section-head">
        <h2>套餐</h2>
        <p>支付成功后自动开通</p>
      </div>

      {showEmpty && plans.length === 0 && (
        <div className="plans-empty">
          暂无付费套餐
          {freeCount > 0 ? "，可先领取上方免费试用" : ""}
        </div>
      )}

      <div className="plans-grid">
        {plans.map((p) => {
          const traffic = formatBytes(p.data_limit_bytes);
          const days = formatDays(p.validity_seconds);
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
                    约 {dailyPrice.toFixed(2)} {p.currency} / 天
                  </p>
                ) : null}
                <PlanSpecs days={days} traffic={traffic} />
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
                  立即购买
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
  const router = useRouter();
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
      .catch((e) => setError(friendlyError(e, "加载失败")))
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
      setError(friendlyError(e, "领取失败"));
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
          ? [{ id: "__ungrouped__", name: "其他" }]
          : []),
      ]
    : [];

  return (
    <Shell>
      <div className="plans-page">
        <div className="page-head plans-page-head">
          <div>
            <h1>套餐</h1>
            <p className="plans-page-lead-mobile">
              先看时长与流量，再决定领取或购买。
            </p>
          </div>
          <p className="plans-page-lead-desktop">
            开通后可在「连接」复制订阅链接
          </p>
        </div>

        {welcome && (
          <p className="alert-ok" style={{ marginTop: 12 }}>
            注册成功。先领取免费试用，马上就能导入客户端。
          </p>
        )}
        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading && <p className="plans-loading">加载套餐中…</p>}

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
          <div className="plans-empty">暂无上架套餐</div>
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
              <span className="plans-invite-title">邀请好友得奖励</span>
              <span className="plans-invite-desc">
                分享邀请链接，好友付费你拿佣金
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
          <p className="plans-loading">加载中…</p>
        </Shell>
      }
    >
      <PlansContent />
    </Suspense>
  );
}
