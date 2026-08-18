"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import PromoNav from "../../../components/PromoNav";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
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

const STATUS_LABEL: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  paid: "已打款",
  rejected: "已拒绝",
};

function badgeClass(status: string) {
  if (status === "pending" || status === "approved") return "promo-badge promo-badge--pending";
  if (status === "paid") return "promo-badge promo-badge--ok";
  if (status === "rejected") return "promo-badge promo-badge--danger";
  return "promo-badge";
}

export default function PromoWithdrawPage() {
  const router = useLocaleRouter();
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
    reload().catch((e) => setError(friendlyError(e, "加载失败")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const yuan = Number(amountYuan);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError("请输入有效金额");
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
      setError("请填写 USDT 地址");
      return;
    }
    if (method === "bank" && (!bankName.trim() || !bankAccount.trim() || !bankHolder.trim())) {
      setError("请完整填写银行卡信息");
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
      setOk("提现申请已提交，预计 T+1 工作日审核");
      setAmountYuan("");
      await reload();
    } catch (err) {
      setError(friendlyError(err, "提现失败"));
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
          <h1>提现</h1>
        </div>
        <PromoNav />

      {overview && (
        <section className="promo-hero promo-hero--withdraw">
          <div className="promo-hero-primary">
            <div className="promo-hero-label">可提现余额</div>
            <div className="promo-hero-value">{formatCents(overview.available_cents)}</div>
            <span className="promo-hero-caption">申请后预计 T+1 工作日完成审核</span>
          </div>
          <div className="promo-hero-meta">
            <div className="promo-hero-meta-item">
              <span>待结算</span>
              <strong>{formatCents(overview.pending_cents)}</strong>
            </div>
            <div className="promo-hero-meta-item">
              <span>已提现</span>
              <strong>{formatCents(overview.withdrawn_cents)}</strong>
            </div>
          </div>
        </section>
      )}

      <section className="panel promo-section" aria-labelledby="withdraw-notes-title">
        <div className="promo-section-head">
          <h2 id="withdraw-notes-title" className="promo-section-title">
            提现说明
          </h2>
        </div>
        <ul className="promo-rule-bullets" style={{ marginTop: 4 }}>
          <li>
            最低提现{" "}
            {overview ? formatCents(overview.min_withdraw_cents) : "100.00"}
          </li>
          <li>
            手续费{" "}
            {overview ? formatBps(overview.withdraw_fee_bps) : "3.00%"}
          </li>
          <li>人工审核打款，预计 T+1 工作日处理</li>
        </ul>
      </section>

      <div className="promo-desktop-split">
        <form onSubmit={onSubmit} className="panel promo-section">
          <div className="promo-section-head">
            <h2 className="promo-section-title">提交提现申请</h2>
            <span className="promo-section-hint">请核对收款信息</span>
          </div>
          {error && <p className="alert-error" style={{ marginBottom: 12 }}>{error}</p>}
          {ok && <p className="alert-ok" style={{ marginBottom: 12 }}>{ok}</p>}

          <label className="field" style={{ display: "block", marginBottom: 12 }}>
            <span className="field-label">提现金额</span>
            <input
              className="field-input"
              type="number"
              min={0}
              step="0.01"
              value={amountYuan}
              onChange={(e) => setAmountYuan(e.target.value)}
              placeholder="例如 100"
              required
            />
          </label>

          {feePreview > 0 && (
            <p className="promo-section-hint" style={{ margin: "0 0 12px" }}>
              预计手续费 {formatCents(feePreview)}，到账约{" "}
              {formatCents(Math.round(Number(amountYuan) * 100) - feePreview)}
            </p>
          )}

          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>提现方式</div>
          <div className="promo-chips" style={{ marginTop: 0, marginBottom: 14 }}>
            {(overview?.withdraw_methods || ["usdt", "bank"]).map((m) => (
              <button
                key={m}
                type="button"
                className="promo-chip"
                data-active={method === m ? "true" : "false"}
                onClick={() => setMethod(m)}
              >
                {m === "usdt" ? "USDT" : m === "bank" ? "银行卡" : m}
              </button>
            ))}
          </div>

          {method === "usdt" ? (
            <label className="field" style={{ display: "block", marginBottom: 16 }}>
              <span className="field-label">USDT 地址（推荐 TRC20）</span>
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
                <span className="field-label">开户行</span>
                <input
                  className="field-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ display: "block", marginBottom: 12 }}>
                <span className="field-label">卡号</span>
                <input
                  className="field-input"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ display: "block", marginBottom: 16 }}>
                <span className="field-label">户名</span>
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
            {loading ? "提交中…" : "申请提现"}
          </button>
        </form>

        <section className="panel promo-section">
          <div className="promo-section-head">
            <h2 className="promo-section-title">提现记录</h2>
          </div>
          {items.length === 0 ? (
            <div className="promo-empty" style={{ marginTop: 8 }}>暂无提现记录</div>
          ) : (
            <div className="promo-list" style={{ marginTop: 8 }}>
              {items.map((it) => (
                <div key={it.id} className="promo-list-item">
                  <div className="promo-list-row">
                    <div className="promo-list-amount">{formatCents(it.amountCents)}</div>
                    <span className={badgeClass(it.status)}>
                      {STATUS_LABEL[it.status] || it.status}
                    </span>
                  </div>
                  <div className="promo-list-meta">
                    {it.method.toUpperCase()} · 手续费 {formatCents(it.feeCents)} · 实付{" "}
                    {formatCents(it.netCents)}
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
