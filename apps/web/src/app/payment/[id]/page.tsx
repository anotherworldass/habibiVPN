"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";

type PaymentOrder = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  payment_url: string | null;
  failure_reason: string | null;
  provision_error: string | null;
};

function statusText(status: string) {
  if (status === "pending") return "等待支付";
  if (status === "paid") return "已支付，等待开通";
  if (status === "provisioning") return "正在开通套餐";
  if (status === "provisioned") return "支付成功，套餐已开通";
  if (status === "failed") return "订单失败";
  if (status === "cancelled") return "订单已取消";
  return status;
}

export default function PaymentOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const polling = useRef(false);

  const load = useCallback(async (refresh = false) => {
    if (polling.current) return;
    polling.current = true;
    try {
      const result = await apiFetch<{ order: PaymentOrder }>(
        `/api/v1/orders/${encodeURIComponent(params.id)}${refresh ? "?refresh=true" : ""}`,
      );
      setOrder(result.order);
      setError("");
    } catch (e) {
      setError(friendlyError(e, "查询订单失败"));
    } finally {
      polling.current = false;
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void load(false);
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [load, router]);

  const finished = order && ["provisioned", "failed", "cancelled"].includes(order.status);

  return (
    <Shell>
      <div className="payment-page-head">
        <div className="page-head">
          <h1>支付订单</h1>
          <p>请在支付页面完成付款，系统会自动确认并开通套餐。</p>
        </div>
        <Link href="/plans" className="payment-back-button">
          <span aria-hidden>←</span>
          返回套餐
        </Link>
      </div>

      {error ? <p className="alert-error" style={{ marginTop: 12 }}>{error}</p> : null}
      {loading ? <p style={{ marginTop: 20, color: "var(--muted)" }}>加载订单中…</p> : null}

      {order ? (
        <div className="panel payment-order-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>应付金额</p>
              <strong style={{ display: "block", marginTop: 4, fontSize: 28 }}>
                {(order.amount_cents / 100).toFixed(2)} {order.currency}
              </strong>
            </div>
            <span className="status-chip">{statusText(order.status)}</span>
          </div>

          {order.status === "pending" && order.payment_url ? (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 12 }}>
                <QRCodeCanvas value={order.payment_url} size={220} level="M" />
              </div>
              <p style={{ margin: "12px 0", color: "var(--muted)", fontSize: 13 }}>
                使用微信或支付宝扫码；也可直接打开支付页面。
              </p>
              <a
                className="btn btn-primary btn-block"
                href={order.payment_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开支付页面
              </a>
            </div>
          ) : null}

          {order.status === "provisioned" ? (
            <Link href="/subscription?claimed=1" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
              查看订阅连接
            </Link>
          ) : null}

          {order.status === "paid" || order.status === "provisioning" ? (
            <p className="alert-ok" style={{ marginTop: 20 }}>
              已收到付款，正在自动开通，请不要重复支付。
            </p>
          ) : null}

          {order.provision_error ? (
            <p className="alert-error" style={{ marginTop: 16 }}>
              付款已确认，但自动开通暂时失败。系统会在支付平台重试通知时再次处理，请联系管理员并提供订单号。
            </p>
          ) : null}

          {order.status === "failed" ? (
            <Link href="/plans" className="btn btn-secondary btn-block" style={{ marginTop: 20 }}>
              返回重新下单
            </Link>
          ) : null}

          {!finished ? (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              style={{ marginTop: 10 }}
              onClick={() => void load(true)}
            >
              我已支付，刷新状态
            </button>
          ) : null}

          <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 12 }}>
            订单号：{order.id}
          </p>
        </div>
      ) : null}
    </Shell>
  );
}
