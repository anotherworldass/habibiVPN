"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TgShell from "../../components/TgShell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import {
  formatBytes,
  formatDays,
  formatPrice,
  resetPolicyLabel,
  trafficKindLabel,
  type PlanGroupLike,
  type PlanLike,
} from "../../lib/plan-format";
import { ensureSession } from "../../lib/session";
import { haptic, hapticSuccess } from "../../lib/telegram";

function planSpecs(p: PlanLike) {
  return [
    formatDays(p.validity_seconds),
    formatBytes(p.data_limit_bytes),
    resetPolicyLabel(p.reset_policy, p.custom_reset_interval),
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function TgPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanLike[]>([]);
  const [groups, setGroups] = useState<PlanGroupLike[]>([]);
  const [activeGroup, setActiveGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      try {
        const res = await apiFetch<{
          plans: PlanLike[];
          groups?: PlanGroupLike[];
        }>("/api/v1/plans?client=h5");
        if (cancelled) return;
        const list = res.plans || [];
        const gs = res.groups || [];
        setPlans(list);
        setGroups(gs);
        const visible = gs.filter((g) => list.some((p) => p.group_id === g.id));
        if (visible.length) setActiveGroup(visible[0]!.id);
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

  async function claim(planId: string) {
    haptic("medium");
    setClaiming(planId);
    setError("");
    try {
      if (!getToken()) {
        const token = await ensureSession();
        if (!token) throw new Error("请稍后重试");
      }
      const res = await apiFetch<{ subscription?: { id?: string } }>(
        "/api/v1/subscriptions/claim",
        {
          method: "POST",
          body: JSON.stringify({ plan_id: planId }),
        },
      );
      hapticSuccess();
      const id = res.subscription?.id;
      router.push(
        id
          ? `/connect?claimed=1&id=${encodeURIComponent(id)}`
          : "/connect?claimed=1",
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
    <TgShell>
      <h1 className="page-title">套餐</h1>
      <p className="page-lead">开通后即可连接</p>

      {error && <p className="alert-error">{error}</p>}
      {loading && <p className="muted" style={{ marginTop: 16 }}>加载套餐中…</p>}

      {!loading && showGroups && tabItems.length > 0 && (
        <div className="plans-group-bar">
          <div className="plans-group-tabs" role="tablist" aria-label="套餐分组">
            {tabItems.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeGroup === t.id}
                className={`plans-group-tab${activeGroup === t.id ? " is-active" : ""}`}
                onClick={() => {
                  haptic("light");
                  setActiveGroup(t.id);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && freePlans.length > 0 && (
        <>
          <p className="section-label">免费领取</p>
          {freePlans.map((p) => {
            const specs = planSpecs(p);
            return (
              <article key={p.id} className="plan-card plan-card--free">
                <span className="plan-corner-badge">免费</span>
                <div className="plan-card-top">
                  <div className="plan-card-heading">
                    <h3 className="plan-card-title">{p.name}</h3>
                  </div>
                  <div className="plan-price plan-price--free">¥0</div>
                </div>
                {specs ? <p className="plan-specs">{specs}</p> : null}
                {p.description ? (
                  <p className="plan-card-desc">{p.description}</p>
                ) : null}
                <div className="plan-card-cta">
                  {p.already_claimed ? (
                    <Link href="/connect" className="btn btn-secondary btn-block">
                      已领取，看套餐
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      disabled={claiming === p.id}
                      onClick={() => void claim(p.id)}
                    >
                      {claiming === p.id ? "开通中…" : "一键免费领取"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </>
      )}

      {!loading && (
        <>
          <p className="section-label">付费套餐</p>
          {paidPlans.length === 0 && (
            <div className="card">
              <p style={{ margin: 0 }}>
                暂无付费套餐
                {freePlans.length > 0 ? "，可先领取免费试用" : ""}
              </p>
            </div>
          )}
          {paidPlans.map((p) => {
            const specs = planSpecs(p);
            const kind = trafficKindLabel(p.data_limit_bytes);
            return (
              <article key={p.id} className="plan-card">
                <div className="plan-card-top">
                  <div className="plan-card-heading">
                    {kind ? (
                      <span
                        className={`badge${kind === "无限流量" ? " badge--ok" : ""}`}
                      >
                        {kind}
                      </span>
                    ) : null}
                    <h3 className="plan-card-title">{p.name}</h3>
                  </div>
                  <div className="plan-price">
                    {formatPrice(p.price_cents, p.currency)}
                  </div>
                </div>
                {specs ? <p className="plan-specs">{specs}</p> : null}
                {p.description ? (
                  <p className="plan-card-desc">{p.description}</p>
                ) : null}
                <div className="plan-card-cta plan-card-cta--end">
                  <Link
                    href={`/checkout/${encodeURIComponent(p.id)}`}
                    className="btn btn-primary plan-buy-btn"
                  >
                    立即购买
                  </Link>
                </div>
              </article>
            );
          })}
        </>
      )}

      <div className="stack">
        <Link href="/invite" className="btn btn-secondary btn-block">
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          邀请好友得奖励
        </Link>
      </div>
    </TgShell>
  );
}
