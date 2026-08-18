"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import PromoNav from "../../../components/PromoNav";
import Shell from "../../../components/Shell";
import { useLocale } from "../../../components/LocaleProvider";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { t } from "../../../lib/copy";
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
  const copy = t(useLocale());
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const statusLabel: Record<string, string> = {
    pending: copy.promoTeam.pending,
    settled: copy.promoTeam.settled,
    invalid: copy.promoTeam.invalid,
  };
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
        if (!cancelled) setError(friendlyError(e, copy.common.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [router, copy.common.loadFailed]);

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
      .catch((e) => setError(friendlyError(e, copy.common.loadFailed)))
      .finally(() => setLoading(false));
  }, [router, tab, level, copy.common.loadFailed]);

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
      .catch((e) => setError(friendlyError(e, copy.common.loadFailed)))
      .finally(() => setLoading(false));
  }, [router, tab, commissionStatus, copy.common.loadFailed]);

  const levelOptions =
    maxLevel > 0 ? Array.from({ length: maxLevel }, (_, i) => i + 1) : [];

  return (
    <Shell>
      <div className="promo-page">
        <div className="page-head">
          <h1>{copy.promoTeam.title}</h1>
        </div>
        <PromoNav />

        {overview && (
          <section className="promo-section panel" style={{ marginTop: 14 }}>
            <div className="promo-section-head">
              <h2 className="promo-section-title">{copy.promoTeam.snapshot}</h2>
              <button
                type="button"
                className="promo-section-link"
                onClick={() => switchTab("commissions")}
              >
                {copy.promoTeam.viewCommissions}
              </button>
            </div>
            <div className="promo-stat-grid">
              <div className="promo-stat-card">
                <span>{copy.promoTeam.invitees}</span>
                <strong>{overview.team_total}</strong>
              </div>
              <div className="promo-stat-card">
                <span>{copy.promoTeam.new7d}</span>
                <strong>{overview.new_users_7d}</strong>
              </div>
              <div className="promo-stat-card">
                <span>{copy.promoTeam.paid7d}</span>
                <strong>{overview.new_payers_7d}</strong>
              </div>
              <div className="promo-stat-card">
                <span>{copy.promoTeam.todayPay}</span>
                <strong>{formatCents(overview.today_team_recharge_cents)}</strong>
              </div>
              <div className="promo-stat-card">
                <span>{copy.promoTeam.totalPay}</span>
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
            {copy.promoTeam.inviteFriends}
          </button>
          <button
            type="button"
            className="promo-chip"
            data-active={tab === "commissions" ? "true" : "false"}
            onClick={() => switchTab("commissions")}
          >
            {copy.promoTeam.flow}
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
              {copy.promoTeam.all}
            </button>
            {levelOptions.map((lv) => (
              <button
                key={lv}
                type="button"
                className="promo-chip"
                data-active={level === lv ? "true" : "false"}
                onClick={() => setLevel(lv)}
              >
                {copy.promoTeam.layer(lv)}
              </button>
            ))}
          </div>
        )}

        {tab === "commissions" && (
          <div className="promo-chips">
            {[
              { v: "", t: copy.promoTeam.all },
              { v: "pending", t: copy.promoTeam.pending },
              { v: "settled", t: copy.promoTeam.settled },
              { v: "invalid", t: copy.promoTeam.invalid },
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
          <p className="promo-loading">{copy.promo.loading}</p>
        ) : tab === "invites" ? (
          inviteItems.length === 0 ? (
            <div className="promo-empty">
              {copy.promoTeam.emptyInvite}
              <br />
              {copy.promoTeam.emptyInviteHint}
            </div>
          ) : (
            <div className="promo-list">
              {inviteItems.map((it) => (
                <div key={it.user_id} className="promo-list-item">
                  <div className="promo-list-row">
                    <div className="promo-list-title">{it.email_masked}</div>
                    <span className="promo-badge promo-badge--ok">{copy.promoTeam.layer(it.level)}</span>
                  </div>
                  <div className="promo-list-meta">
                    {new Date(it.created_at).toLocaleString()} ·{" "}
                    {it.status === "active" ? copy.promoTeam.active : it.status}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : commissionItems.length === 0 ? (
          <div className="promo-empty">
            {copy.promoTeam.emptyComm}
            <br />
            {copy.promoTeam.emptyCommHint}
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
                    {statusLabel[it.status] || it.status}
                  </span>
                </div>
                <div className="promo-list-meta">
                  {copy.promoTeam.layer(it.level)} · {formatBps(it.rate_bps)} · {copy.promoTeam.order}{" "}
                  {formatCents(it.order_amount_cents)}
                  <br />
                  {copy.promoTeam.from} {it.payer_email_masked}
                  <br />
                  {new Date(it.created_at).toLocaleString()}
                  {it.status === "pending" && (
                    <> · {copy.promoTeam.settleOn(new Date(it.settle_at).toLocaleDateString())}</>
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
  const copy = t(useLocale());
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="promo-page">
            <div className="page-head">
              <h1>{copy.promoTeam.title}</h1>
            </div>
            <PromoNav />
            <p className="promo-loading">{copy.promo.loading}</p>
          </div>
        </Shell>
      }
    >
      <PromoTeamPageInner />
    </Suspense>
  );
}
