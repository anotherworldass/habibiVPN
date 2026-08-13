"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PromoNav from "../../../components/PromoNav";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";
import { formatBps, formatCents } from "../../../lib/money";

type InviteItem = {
  user_id: string;
  email_masked: string;
  level: number;
  status: string;
  created_at: string;
};

type CommissionItem = {
  id: string;
  level: number;
  amount_cents: number;
  order_amount_cents: number;
  rate_bps: number;
  status: string;
  settle_at: string;
  created_at: string;
  payer_email_masked: string;
};

type PromoRules = {
  max_level: number;
  levels: { level: number; rate_bps: number }[];
};

type Overview = {
  team_total: number;
  new_users_7d: number;
  new_payers_7d: number;
  today_team_recharge_cents: number;
  team_total_recharge_cents: number;
};

type Tab = "invites" | "commissions";

const COMMISSION_STATUS_LABEL: Record<string, string> = {
  pending: "待结算",
  settled: "已结算",
  invalid: "已失效",
};

function commissionBadgeClass(status: string) {
  if (status === "pending") return "promo-badge promo-badge--pending";
  if (status === "settled") return "promo-badge promo-badge--ok";
  if (status === "invalid") return "promo-badge promo-badge--danger";
  return "promo-badge";
}

function parseTab(raw: string | null): Tab {
  return raw === "commissions" ? "commissions" : "invites";
}

function PromoTeamPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));

  const [inviteItems, setInviteItems] = useState<InviteItem[]>([]);
  const [level, setLevel] = useState<number | "">("");
  const [maxLevel, setMaxLevel] = useState(0);

  const [commissionItems, setCommissionItems] = useState<CommissionItem[]>([]);
  const [commissionStatus, setCommissionStatus] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  function switchTab(next: Tab) {
    setTab(next);
    const qs = next === "commissions" ? "?tab=commissions" : "";
    router.replace(`/promo/team${qs}`, { scroll: false });
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    Promise.all([
      apiFetch<PromoRules>("/api/v1/promo/rules"),
      apiFetch<Overview>("/api/v1/promo/overview"),
    ])
      .then(([r, o]) => {
        if (cancelled) return;
        const fromLevels = (r.levels || [])
          .map((l) => l.level)
          .filter((n) => n > 0);
        const configured = Math.max(r.max_level || 0, ...fromLevels, 0);
        setMaxLevel(configured);
        setOverview(o);
        setLevel((cur) =>
          cur !== "" && configured > 0 && cur > configured ? "" : cur,
        );
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, "加载失败"));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (tab !== "invites") return;
    const qs = new URLSearchParams({ limit: "50", offset: "0" });
    if (level !== "") qs.set("level", String(level));
    setLoading(true);
    setError("");
    apiFetch<{ total: number; items: InviteItem[] }>(`/api/v1/promo/team?${qs}`)
      .then((res) => {
        setInviteItems(res.items);
      })
      .catch((e) => setError(friendlyError(e, "加载失败")))
      .finally(() => setLoading(false));
  }, [router, tab, level]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (tab !== "commissions") return;
    const qs = new URLSearchParams({ limit: "50", offset: "0" });
    if (commissionStatus) qs.set("status", commissionStatus);
    setLoading(true);
    setError("");
    apiFetch<{ total: number; items: CommissionItem[] }>(
      `/api/v1/promo/commissions?${qs}`,
    )
      .then((res) => {
        setCommissionItems(res.items);
      })
      .catch((e) => setError(friendlyError(e, "加载失败")))
      .finally(() => setLoading(false));
  }, [router, tab, commissionStatus]);

  const levelOptions =
    maxLevel > 0 ? Array.from({ length: maxLevel }, (_, i) => i + 1) : [];

  return (
    <Shell>
      <div className="promo-page">
        <div className="page-head">
          <h1>邀请与佣金</h1>
        </div>
        <PromoNav />

        {overview && (
          <section className="promo-section panel" style={{ marginTop: 14 }}>
            <div className="promo-section-head">
              <h2 className="promo-section-title">邀请速览</h2>
              <button
                type="button"
                className="promo-section-link"
                onClick={() => switchTab("commissions")}
              >
                查看佣金
              </button>
            </div>
            <div className="promo-stat-grid">
              <div className="promo-stat-card">
                <span>邀请人数</span>
                <strong>{overview.team_total}</strong>
              </div>
              <div className="promo-stat-card">
                <span>近 7 日新增</span>
                <strong>{overview.new_users_7d}</strong>
              </div>
              <div className="promo-stat-card">
                <span>近 7 日充值人数</span>
                <strong>{overview.new_payers_7d}</strong>
              </div>
              <div className="promo-stat-card">
                <span>今日邀请充值</span>
                <strong>{formatCents(overview.today_team_recharge_cents)}</strong>
              </div>
              <div className="promo-stat-card">
                <span>邀请累计充值</span>
                <strong>{formatCents(overview.team_total_recharge_cents)}</strong>
              </div>
            </div>
          </section>
        )}

        <div className="promo-chips" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="promo-chip"
            data-active={tab === "invites" ? "true" : "false"}
            onClick={() => switchTab("invites")}
          >
            邀请好友
          </button>
          <button
            type="button"
            className="promo-chip"
            data-active={tab === "commissions" ? "true" : "false"}
            onClick={() => switchTab("commissions")}
          >
            佣金流水
          </button>
        </div>

        {tab === "invites" && levelOptions.length > 0 && (
          <div className="promo-chips">
            <button
              type="button"
              className="promo-chip"
              data-active={level === "" ? "true" : "false"}
              onClick={() => setLevel("")}
            >
              全部
            </button>
            {levelOptions.map((lv) => (
              <button
                key={lv}
                type="button"
                className="promo-chip"
                data-active={level === lv ? "true" : "false"}
                onClick={() => setLevel(lv)}
              >
                {lv} 层
              </button>
            ))}
          </div>
        )}

        {tab === "commissions" && (
          <div className="promo-chips">
            {[
              { v: "", t: "全部" },
              { v: "pending", t: "待结算" },
              { v: "settled", t: "已结算" },
              { v: "invalid", t: "已失效" },
            ].map((o) => (
              <button
                key={o.v || "all"}
                type="button"
                className="promo-chip"
                data-active={commissionStatus === o.v ? "true" : "false"}
                onClick={() => setCommissionStatus(o.v)}
              >
                {o.t}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="promo-loading">加载中…</p>
        ) : tab === "invites" ? (
          inviteItems.length === 0 ? (
            <div className="promo-empty">
              暂无邀请记录
              <br />
              分享邀请链接后，好友注册会出现在这里
            </div>
          ) : (
            <div className="promo-list">
              {inviteItems.map((it) => (
                <div key={it.user_id} className="promo-list-item">
                  <div className="promo-list-row">
                    <div className="promo-list-title">{it.email_masked}</div>
                    <span className="promo-badge promo-badge--ok">{it.level} 层</span>
                  </div>
                  <div className="promo-list-meta">
                    {new Date(it.created_at).toLocaleString()} ·{" "}
                    {it.status === "active" ? "正常" : it.status}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : commissionItems.length === 0 ? (
          <div className="promo-empty">
            暂无佣金记录
            <br />
            邀请好友充值后会在此显示
          </div>
        ) : (
          <div className="promo-list">
            {commissionItems.map((it) => (
              <div key={it.id} className="promo-list-item">
                <div className="promo-list-row">
                  <div className="promo-list-amount">
                    +{formatCents(it.amount_cents)}
                  </div>
                  <span className={commissionBadgeClass(it.status)}>
                    {COMMISSION_STATUS_LABEL[it.status] || it.status}
                  </span>
                </div>
                <div className="promo-list-meta">
                  {it.level} 层 · {formatBps(it.rate_bps)} · 订单{" "}
                  {formatCents(it.order_amount_cents)}
                  <br />
                  来自 {it.payer_email_masked}
                  <br />
                  {new Date(it.created_at).toLocaleString()}
                  {it.status === "pending" && (
                    <> · 预计 {new Date(it.settle_at).toLocaleDateString()} 结算</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function PromoTeamPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="promo-page">
            <div className="page-head">
              <h1>邀请与佣金</h1>
            </div>
            <PromoNav />
            <p className="promo-loading">加载中…</p>
          </div>
        </Shell>
      }
    >
      <PromoTeamPageInner />
    </Suspense>
  );
}
