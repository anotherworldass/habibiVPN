"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TgShell from "../../../components/TgShell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";
import {
  formatBytes,
  formatDays,
  formatPrice,
  resetPolicyLabel,
  type PlanLike,
} from "../../../lib/plan-format";
import { ensureSession } from "../../../lib/session";
import { haptic, openExternal } from "../../../lib/telegram";

type PaymentChannel = {
  id: string;
  code: string;
  name: string;
  method: string;
};

function methodLabel(method: string) {
  if (method === "wechat_qr") return "微信";
  if (method === "alipay_native") return "支付宝";
  return "在线支付";
}

export default function TgCheckoutPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanLike | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      if (!getToken()) {
        setError("请先完成登录会话");
        setLoading(false);
        return;
      }
      try {
        const [planResult, channelResult] = await Promise.all([
          apiFetch<{ plans: PlanLike[] }>("/api/v1/plans?client=h5"),
          apiFetch<{ channels: PaymentChannel[] }>(
            `/api/v1/payment-channels?plan_id=${encodeURIComponent(params.planId)}`,
          ),
        ]);
        if (cancelled) return;
        const current = (planResult.plans || []).find(
          (item) => item.id === params.planId && !item.is_free_claimable,
        );
        if (!current) throw new Error("plan.not_found");
        const available = channelResult.channels || [];
        setPlan(current);
        setChannels(available);
        setSelectedChannelId(available[0]?.id || "");
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "加载订单失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.planId]);

  async function submitOrder() {
    if (!plan || !selectedChannelId) return;
    haptic("medium");
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{
        order: { id: string; payment_url?: string | null };
      }>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.id,
          channel_id: selectedChannelId,
        }),
      });
      const payUrl = result.order.payment_url;
      if (payUrl) {
        openExternal(payUrl);
        router.push("/connect?paid=1");
        return;
      }
      setError("未获得支付链接，请稍后重试或联系客服");
      setSubmitting(false);
    } catch (e) {
      setError(friendlyError(e, "创建支付订单失败"));
      setSubmitting(false);
    }
  }

  const specs = plan
    ? [
        formatDays(plan.validity_seconds),
        formatBytes(plan.data_limit_bytes),
        resetPolicyLabel(plan.reset_policy, plan.custom_reset_interval),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <TgShell hideNav>
      <Link href="/plans" className="muted" style={{ fontWeight: 700 }}>
        ← 返回套餐
      </Link>
      <h1 className="page-title" style={{ marginTop: 12 }}>
        确认购买
      </h1>
      <p className="page-lead">选择支付方式后跳转完成付款。</p>

      {error && <p className="alert-error">{error}</p>}
      {loading && <p className="muted" style={{ marginTop: 16 }}>加载中…</p>}

      {!loading && plan && (
        <>
          <div className="card">
            <div className="plan-card-top">
              <h2>{plan.name}</h2>
              <div className="plan-price">
                {formatPrice(plan.price_cents, plan.currency)}
              </div>
            </div>
            {specs ? <p className="plan-specs">{specs}</p> : null}
          </div>

          <p className="section-label">支付方式</p>
          {channels.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0 }}>暂无可用支付通道，请联系客服。</p>
            </div>
          ) : (
            <div className="channel-list">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  className="channel-item"
                  data-active={ch.id === selectedChannelId}
                  onClick={() => {
                    haptic("light");
                    setSelectedChannelId(ch.id);
                  }}
                >
                  <span className="channel-dot" aria-hidden />
                  <span>
                    <strong style={{ display: "block", fontSize: 15 }}>
                      {ch.name}
                    </strong>
                    <span className="muted">{methodLabel(ch.method)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="stack">
            <button
              type="button"
              className="btn btn-primary btn-block btn-lg"
              disabled={
                submitting || !selectedChannelId || channels.length === 0
              }
              onClick={() => void submitOrder()}
            >
              {submitting ? "创建订单中…" : "去支付"}
            </button>
          </div>
        </>
      )}
    </TgShell>
  );
}
