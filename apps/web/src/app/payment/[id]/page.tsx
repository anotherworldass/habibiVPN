"use client";

import Link from "../../../components/LocaleLink";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";
import { useLocale } from "../../../components/LocaleProvider";
import { t } from "../../../lib/copy";

type PaymentOrder = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  payment_url: string | null;
  channel_method?: string | null;
  failure_reason: string | null;
  provision_error: string | null;
};

function statusText(status: string, copy: ReturnType<typeof t>["payment"]) {
  if (status === "pending") return copy.pending;
  if (status === "paid") return copy.paid;
  if (status === "provisioning") return copy.provisioning;
  if (status === "provisioned") return copy.provisioned;
  if (status === "failed") return copy.failed;
  if (status === "cancelled") return copy.cancelled;
  return status;
}

export default function PaymentOrderPage() {
  const copy = t(useLocale());
  const params = useParams<{ id: string }>();
  const router = useLocaleRouter();
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
      setError(friendlyError(e, copy.payment.loadFailed));
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
  const hostedCheckout = order?.channel_method === "crypto";

  return (
    <Shell>
      <div className="payment-page-head">
        <div className="page-head">
          <h1>{copy.payment.title}</h1>
          <p>{copy.payment.lead}</p>
        </div>
        <Link href="/plans" className="payment-back-button">
          <span aria-hidden>←</span>
          {copy.payment.back}
        </Link>
      </div>

      {error ? <p className="alert-error" style={{ marginTop: 12 }}>{error}</p> : null}
      {loading ? <p style={{ marginTop: 20, color: "var(--muted)" }}>{copy.payment.loading}</p> : null}

      {order ? (
        <div className="panel payment-order-panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{copy.payment.payAmount}</p>
              <strong style={{ display: "block", marginTop: 4, fontSize: 28 }}>
                {(order.amount_cents / 100).toFixed(2)} {order.currency}
              </strong>
            </div>
            <span className="status-chip">{statusText(order.status, copy.payment)}</span>
          </div>

          {order.status === "pending" && order.payment_url ? (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              {hostedCheckout ? null : (
                <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 12 }}>
                  <QRCodeCanvas value={order.payment_url} size={220} level="M" />
                </div>
              )}
              <p style={{ margin: hostedCheckout ? "0 0 12px" : "12px 0", color: "var(--muted)", fontSize: 13 }}>
                {hostedCheckout ? copy.payment.openHint : copy.payment.scanHint}
              </p>
              <a
                className="btn btn-primary btn-block"
                href={order.payment_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {copy.payment.openPay}
              </a>
            </div>
          ) : null}

          {order.status === "provisioned" ? (
            <Link href="/subscription?claimed=1" className="btn btn-primary btn-block" style={{ marginTop: 20 }}>
              {copy.payment.viewSub}
            </Link>
          ) : null}

          {order.status === "paid" || order.status === "provisioning" ? (
            <p className="alert-ok" style={{ marginTop: 20 }}>
              {copy.payment.received}
            </p>
          ) : null}

          {order.provision_error ? (
            <p className="alert-error" style={{ marginTop: 16 }}>
              {copy.payment.provisionFail}
            </p>
          ) : null}

          {order.status === "failed" ? (
            <Link href="/plans" className="btn btn-secondary btn-block" style={{ marginTop: 20 }}>
              {copy.payment.reorder}
            </Link>
          ) : null}

          {!finished ? (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              style={{ marginTop: 10 }}
              onClick={() => void load(true)}
            >
              {copy.payment.refresh}
            </button>
          ) : null}

          <p style={{ margin: "16px 0 0", color: "var(--muted)", fontSize: 12 }}>
            {copy.payment.orderId}{order.id}
          </p>
        </div>
      ) : null}
    </Shell>
  );
}
