"use client";

import Link from "../../components/LocaleLink";
import { useLocaleRouter } from "../../components/useLocaleRouter";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatCents } from "../../lib/money";
import { pickSiteCopy } from "../../lib/locale";
import { useLocale } from "../../components/LocaleProvider";
import { t } from "../../lib/copy";

type OrderItem = {
  id: string;
  order_no?: string;
  status: string;
  amount_cents: number;
  currency: string;
  provider: string | null;
  payment_provider_name?: string | null;
  is_trial_period?: boolean | null;
  paid_at: string | null;
  created_at: string;
  plan?: {
    id: string;
    code: string;
    name: string;
    name_i18n?: Record<string, string>;
    description?: string | null;
    description_i18n?: Record<string, string>;
    validity_seconds?: number | null;
    data_limit_bytes?: number | null;
  } | null;
};

function paymentMerchantLabel(order: OrderItem) {
  return order.payment_provider_name?.trim() || "";
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function formatDuration(
  sec: number | null | undefined,
  days: string,
  hours: string,
  lifetime: string,
) {
  if (sec == null) return null;
  if (sec === 0) return lifetime;
  if (sec % 86400 === 0) return `${sec / 86400} ${days}`;
  if (sec % 3600 === 0) return `${sec / 3600} ${hours}`;
  return null;
}

function formatTraffic(
  n: number | null | undefined,
  unlimited: string,
  traffic: string,
) {
  if (n == null) return null;
  if (n === 0) return `${unlimited}${traffic}`;
  const gb = n / 1024 ** 3;
  if (gb >= 1) {
    const value = gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1);
    return `${value} GB`;
  }
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const locale = useLocale();
  const copy = t(locale);
  const router = useLocaleRouter();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const res = await apiFetch<{ total: number; items: OrderItem[] }>(
        `/api/v1/orders?status=provisioned&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      setTotal(res.total);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch (e) {
      setError(friendlyError(e, copy.common.loadFailed));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load(0, false);
  }, [router, load]);

  return (
    <Shell>
      <div className="orders-page">
        <div className="page-head orders-page-head">
          <div>
            <h1>{copy.orders.title}</h1>
            <p className="orders-page-lead-mobile">
              {loading ? copy.orders.syncing : copy.orders.count(total)}
            </p>
          </div>
          <p className="orders-page-lead-desktop">
            {copy.orders.leadDesktop}
          </p>
        </div>

        <p className="orders-back">
          <Link href="/account">{copy.orders.back}</Link>
        </p>

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="orders-loading">{copy.common.loading}</p>
        ) : items.length === 0 ? (
          <div className="orders-empty">
            <p>{copy.orders.empty}</p>
            <span className="orders-empty-hint">{copy.orders.emptyHint}</span>
            <Link href="/plans" className="btn btn-primary">
              {copy.orders.shop}
            </Link>
          </div>
        ) : (
          <>
            <div className="orders-list">
              {items.map((order) => {
                const planName =
                  pickSiteCopy(order.plan?.name_i18n, locale, order.plan?.name || "") ||
                  order.plan?.code ||
                  copy.orders.fallbackTitle;
                const planDesc = pickSiteCopy(
                  order.plan?.description_i18n,
                  locale,
                  order.plan?.description || "",
                );
                const duration = formatDuration(
                  order.plan?.validity_seconds,
                  copy.common.days,
                  copy.common.hours,
                  copy.common.lifetime,
                );
                const traffic = formatTraffic(
                  order.plan?.data_limit_bytes,
                  copy.common.unlimited,
                  copy.common.traffic,
                );
                const planBits = [duration, traffic].filter(Boolean);
                const when = order.paid_at || order.created_at;
                const merchant = paymentMerchantLabel(order);
                return (
                  <article key={order.id} className="orders-item">
                    <div className="orders-item-row">
                      <div className="orders-item-main">
                        <h2>{planName}</h2>
                        <span className="promo-badge promo-badge--ok">
                          {copy.orders.success}
                          {order.is_trial_period ? ` · ${copy.orders.trial}` : ""}
                        </span>
                      </div>
                      <div className="orders-item-amount">
                        {formatCents(order.amount_cents, order.currency)}
                      </div>
                    </div>
                    <dl className="orders-item-facts">
                      <div>
                        <dt>{copy.orders.orderNo}</dt>
                        <dd className="orders-item-id">{order.order_no || order.id}</dd>
                      </div>
                      <div>
                        <dt>{copy.orders.plan}</dt>
                        <dd>
                          {planName}
                          {planBits.length ? ` · ${planBits.join(" · ")}` : ""}
                        </dd>
                      </div>
                    </dl>
                    {planDesc ? (
                      <p className="orders-item-desc">{planDesc}</p>
                    ) : null}
                    <p className="orders-item-meta">
                      {formatTime(when)}
                      {merchant ? ` · ${merchant}` : ""}
                    </p>
                  </article>
                );
              })}
            </div>

            {items.length < total ? (
              <button
                type="button"
                className="btn btn-secondary btn-block orders-more"
                disabled={loadingMore}
                onClick={() => load(items.length, true)}
              >
                {loadingMore ? copy.common.loading : copy.orders.more}
              </button>
            ) : null}
          </>
        )}
      </div>
    </Shell>
  );
}
