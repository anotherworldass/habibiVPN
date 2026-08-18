"use client";

import Link from "../../../components/LocaleLink";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";

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
};

type PaymentChannel = {
  id: string;
  code: string;
  name: string;
  method: string;
  provider: {
    code: string;
    name: string;
  };
};

function methodIcon(method: string) {
  if (method === "wechat_qr") return "微";
  if (method === "alipay_native") return "支";
  return "付";
}

function methodLabel(method: string) {
  if (method === "wechat_qr") return "微信扫码";
  if (method === "alipay_native") return "支付宝";
  return "在线支付";
}

function formatDays(seconds?: number | null) {
  if (!seconds) return null;
  return seconds % 86400 === 0 ? `${seconds / 86400} 天` : null;
}

function formatTraffic(bytes?: number | null) {
  if (bytes == null) return null;
  if (bytes === 0) return "不限流量";
  return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

export default function CheckoutPage() {
  const params = useParams<{ planId: string }>();
  const router = useLocaleRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/checkout/${params.planId}`)}`);
      return;
    }
    Promise.all([
      apiFetch<{ plans: Plan[] }>("/api/v1/plans"),
      apiFetch<{ channels: PaymentChannel[] }>(
        `/api/v1/payment-channels?plan_id=${encodeURIComponent(params.planId)}`,
      ),
    ])
      .then(([planResult, channelResult]) => {
        const current = planResult.plans.find(
          (item) => item.id === params.planId && !item.is_free_claimable,
        );
        if (!current) throw new Error("plan.not_found");
        const available = channelResult.channels || [];
        setPlan(current);
        setChannels(available);
        setSelectedChannelId(available[0]?.id || "");
      })
      .catch((reason) => setError(friendlyError(reason, "加载订单信息失败")))
      .finally(() => setLoading(false));
  }, [params.planId, router]);

  async function submitOrder() {
    if (!plan || !selectedChannelId) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{ order: { id: string } }>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.id,
          channel_id: selectedChannelId,
        }),
      });
      router.push(`/payment/${encodeURIComponent(result.order.id)}`);
    } catch (reason) {
      setError(friendlyError(reason, "创建支付订单失败"));
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <div className="checkout-page">
        <header className="checkout-header">
          <div className="checkout-header-top">
            <Link href="/plans" className="checkout-back">
              <span aria-hidden>←</span>
              返回套餐
            </Link>
            <span className="checkout-secure">
              <span aria-hidden>✓</span>
              安全支付
            </span>
          </div>
          <div className="checkout-header-main">
            <div>
              <p className="checkout-eyebrow">CHECKOUT</p>
              <h1>确认订单</h1>
              <p>核对套餐内容，选择支付方式后提交订单。</p>
            </div>
            <ol className="checkout-steps" aria-label="购买进度">
              <li data-active="true"><span>1</span>确认订单</li>
              <li><span>2</span>完成支付</li>
              <li><span>3</span>自动开通</li>
            </ol>
          </div>
        </header>

        {error ? <p className="alert-error checkout-alert">{error}</p> : null}
        {loading ? <p className="checkout-loading">加载订单信息中…</p> : null}

        {plan ? (
          <div className="checkout-layout">
            <aside className="panel checkout-summary">
              <div className="checkout-section-label">订单概要</div>
              <h2>{plan.name}</h2>
              {(() => {
                const meta = [formatDays(plan.validity_seconds), formatTraffic(plan.data_limit_bytes)]
                  .filter(Boolean)
                  .join(" · ");
                return meta ? <p className="checkout-plan-meta">{meta}</p> : null;
              })()}
              {plan.description ? <p className="checkout-description">{plan.description}</p> : null}
              <div className="checkout-price-row">
                <span>订单金额</span>
                <strong>
                  <small>¥</small>
                  {(plan.price_cents / 100).toFixed(2)}
                </strong>
              </div>
              <div className="checkout-summary-foot">
                <span>币种</span>
                <b>{plan.currency}</b>
              </div>
            </aside>

            <section className="panel checkout-payment">
              <div className="checkout-payment-head">
                <div>
                  <div className="checkout-section-label">支付方式</div>
                  <h2>选择支付通道</h2>
                </div>
                <span>共 {channels.length} 个可用通道</span>
              </div>

              {channels.length ? (
                <div className="checkout-channel-list">
                  {channels.map((channel) => {
                    const selected = channel.id === selectedChannelId;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        className="checkout-channel"
                        data-selected={selected}
                        onClick={() => setSelectedChannelId(channel.id)}
                      >
                        <span
                          className="checkout-channel-icon"
                          data-method={channel.method}
                          aria-hidden
                        >
                          {methodIcon(channel.method)}
                        </span>
                        <span className="checkout-channel-copy">
                          <strong>{channel.name}</strong>
                          <small>{methodLabel(channel.method)} · 即时到账</small>
                        </span>
                        <span className="checkout-radio" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="checkout-empty">暂无适用于该套餐金额和币种的支付通道。</p>
              )}

              <div className="checkout-actions">
                <div className="checkout-pay-total">
                  <span>应付金额</span>
                  <strong>{(plan.price_cents / 100).toFixed(2)} {plan.currency}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-primary checkout-submit"
                  disabled={!selectedChannelId || submitting}
                  onClick={() => void submitOrder()}
                >
                  {submitting ? "正在创建订单…" : "提交订单并支付"}
                  {!submitting ? <span aria-hidden>→</span> : null}
                </button>
                <p>提交即表示你已确认套餐及支付信息，支付成功后系统将自动开通。</p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
