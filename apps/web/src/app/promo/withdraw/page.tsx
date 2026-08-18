"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import PromoNav from "../../../components/PromoNav";
import Shell from "../../../components/Shell";
import { useLocale } from "../../../components/LocaleProvider";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { t } from "../../../lib/copy";
import { friendlyError } from "../../../lib/errors";
import { formatBps, formatCents } from "../../../lib/money";

type Overview = {
  available_cents: number;
  pending_cents: number;
  withdrawn_cents: number;
  frozen_cents: number;
  min_withdraw_cents: number;
  withdraw_fee_bps: number;
  withdraw_methods: string[];
};

type Withdrawal = {
  id: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  method: string;
  status: string;
  createdAt: string;
};

function badgeClass(status: string) {
  if (status === "pending" || status === "approved") return "promo-badge promo-badge--pending";
  if (status === "paid") return "promo-badge promo-badge--ok";
  if (status === "rejected") return "promo-badge promo-badge--danger";
  return "promo-badge";
}

export default function PromoWithdrawPage() {
  const copy = t(useLocale());
  const router = useLocaleRouter();
  const statusLabel: Record<string, string> = {
    pending: copy.promoWithdraw.stPending,
    approved: copy.promoWithdraw.stApproved,
    paid: copy.promoWithdraw.stPaid,
    rejected: copy.promoWithdraw.stRejected,
  };
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [amountYuan, setAmountYuan] = useState("");
  const [method, setMethod] = useState("usdt");
  const [usdtAddress, setUsdtAddress] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  async function reload() {
    const [o, w] = await Promise.all([
      apiFetch<Overview>("/api/v1/promo/overview"),
      apiFetch<{ items: Withdrawal[] }>("/api/v1/promo/withdrawals?limit=30&offset=0"),
    ]);
    setOverview(o);
    setItems(w.items);
    if (o.withdraw_methods?.length && !o.withdraw_methods.includes(method)) {
      setMethod(o.withdraw_methods[0]!);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    reload().catch((e) => setError(friendlyError(e, copy.common.loadFailed)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const yuan = Number(amountYuan);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError(copy.promoWithdraw.invalidAmount);
      return;
    }
    const amountCents = Math.round(yuan * 100);
    const account =
      method === "usdt"
        ? { address: usdtAddress.trim(), network: "TRC20" }
        : {
            bank_name: bankName.trim(),
            account: bankAccount.trim(),
            holder: bankHolder.trim(),
          };

    if (method === "usdt" && !usdtAddress.trim()) {
      setError(copy.promoWithdraw.needUsdt);
      return;
    }
    if (method === "bank" && (!bankName.trim() || !bankAccount.trim() || !bankHolder.trim())) {
      setError(copy.promoWithdraw.needBank);
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/v1/promo/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          amount_cents: amountCents,
          method,
          account,
        }),
      });
      setOk(copy.promoWithdraw.ok);
      setAmountYuan("");
      await reload();
    } catch (err) {
      setError(friendlyError(err, copy.promoWithdraw.fail));
    } finally {
      setLoading(false);
    }
  }

  const feePreview =
    overview && amountYuan
      ? Math.floor((Math.round(Number(amountYuan) * 100) * overview.withdraw_fee_bps) / 10000)
      : 0;

  return (
    <Shell>
      <div className="promo-page">
        <div className="page-head">
          <h1>{copy.promoWithdraw.title}</h1>
        </div>
        <PromoNav />

      {overview && (
        <section className="promo-hero promo-hero--withdraw">
          <div className="promo-hero-primary">
            <div className="promo-hero-label">{copy.promoWithdraw.balance}</div>
            <div className="promo-hero-value">{formatCents(overview.available_cents)}</div>
            <span className="promo-hero-caption">{copy.promoWithdraw.reviewHint}</span>
          </div>
          <div className="promo-hero-meta">
            <div className="promo-hero-meta-item">
              <span>{copy.promoWithdraw.pending}</span>
              <strong>{formatCents(overview.pending_cents)}</strong>
            </div>
            <div className="promo-hero-meta-item">
              <span>{copy.promoWithdraw.withdrawn}</span>
              <strong>{formatCents(overview.withdrawn_cents)}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="panel promo-section" aria-labelledby="withdraw-notes-title">
        <div className="promo-section-head">
          <h2 id="withdraw-notes-title" className="promo-section-title">
            {copy.promoWithdraw.notes}
          </h2>
        </div>
        <ul className="promo-rule-bullets" style={{ marginTop: 4 }}>
          <li>
            {copy.promoWithdraw.min}{" "}
            {overview ? formatCents(overview.min_withdraw_cents) : "100.00"}
          </li>
          <li>
            {copy.promoWithdraw.fee}{" "}
            {overview ? formatBps(overview.withdraw_fee_bps) : "3.00%"}
          </li>
          <li>{copy.promoWithdraw.reviewLi}</li>
        </ul>
      </section>

      <div className="promo-desktop-split">
        <form onSubmit={onSubmit} className="panel promo-section">
          <div className="promo-section-head">
            <h2 className="promo-section-title">{copy.promoWithdraw.formTitle}</h2>
            <span className="promo-section-hint">{copy.promoWithdraw.formHint}</span>
          </div>
          {error && <p className="alert-error" style={{ marginBottom: 12 }}>{error}</p>}
          {ok && <p className="alert-ok" style={{ marginBottom: 12 }}>{ok}</p>}

          <label className="field" style={{ display: "block", marginBottom: 12 }}>
            <span className="field-label">{copy.promoWithdraw.amount}</span>
            <input
              className="field-input"
              type="number"
              min={0}
              step="0.01"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
              placeholder={copy.promoWithdraw.amountPh}
              required
            />
          </label>

          {feePreview > 0 && (
            <p className="promo-section-hint" style={{ margin: "0 0 12px" }}>
              {copy.promoWithdraw.feePreview(
                formatCents(feePreview),
                formatCents(Math.round(Number(amountYuan) * 100) - feePreview),
              )}
            </p>
          )}

          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{copy.promoWithdraw.method}</div>
          <div className="promo-chips" style={{ marginTop: 0, marginBottom: 14 }}>
            {(overview?.withdraw_methods || ["usdt", "bank"]).map((m) => (
              <button
                key={m}
                type="button"
                className="promo-chip"
                data-active={method === m ? "true" : "false"}
                onClick={() => setMethod(m)}
              >
                {m === "usdt" ? copy.promoWithdraw.usdt : m === "bank" ? copy.promoWithdraw.bank : m}
              </button>
            ))}
          </div>

          {method === "usdt" ? (
            <label className="field" style={{ display: "block", marginBottom: 16 }}>
              <span className="field-label">{copy.promoWithdraw.usdtLabel}</span>
              <input
                className="field-input"
                value={usdtAddress}
                onChange={(e) => setUsdtAddress(e.target.value)}
                placeholder="T..."
                required
              />
            </label>
          ) : (
            <>
              <label className="field" style={{ display: "block", marginBottom: 12 }}>
                <span className="field-label">{copy.promoWithdraw.bankName}</span>
                <input
                  className="field-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ display: "block", marginBottom: 12 }}>
                <span className="field-label">{copy.promoWithdraw.cardNo}</span>
                <input
                  className="field-input"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ display: "block", marginBottom: 16 }}>
                <span className="field-label">{copy.promoWithdraw.holder}</span>
                <input
                  className="field-input"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  required
                />
              </label>
            </>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? copy.promoWithdraw.submitting : copy.promoWithdraw.submit}
          </button>
        </form>

        <section className="panel promo-section">
          <div className="promo-section-head">
            <h2 className="promo-section-title">{copy.promoWithdraw.history}</h2>
          </div>
          {items.length === 0 ? (
            <div className="promo-empty" style={{ marginTop: 8 }}>{copy.promoWithdraw.empty}</div>
          ) : (
            <div className="promo-list" style={{ marginTop: 8 }}>
              {items.map((it) => (
                <div key={it.id} className="promo-list-item">
                  <div className="promo-list-row">
                    <div className="promo-list-amount">{formatCents(it.amountCents)}</div>
                    <span className={badgeClass(it.status)}>
                      {statusLabel[it.status] || it.status}
                    </span>
                  </div>
                  <div className="promo-list-meta">
                    {it.method.toUpperCase()} · {copy.promoWithdraw.feePaid(formatCents(it.feeCents), formatCents(it.netCents))}
                    <br />
                    {new Date(it.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>
    </Shell>
  );
}
