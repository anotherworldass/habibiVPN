"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { apiFetch } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { friendlyError } from "../../lib/errors";
import { formatCents } from "../../lib/money";

type OrderItem = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  provider: string | null;
  is_trial_period?: boolean | null;
  paid_at: string | null;
  created_at: string;
  plan?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

function providerLabel(provider: string | null) {
  if (!provider) return "";
  if (provider === "app_store") return "App Store";
  if (provider === "google_play") return "Google Play";
  return provider;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return "—";
  }
}

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const router = useRouter();
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
      setError(friendlyError(e, "加载失败"));
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
            <h1>购买记录</h1>
            <p className="orders-page-lead-mobile">
              {loading ? "同步订单中…" : `共 ${total} 笔成功购买`}
            </p>
          </div>
          <p className="orders-page-lead-desktop">
            仅展示已开通成功的历史订单。
          </p>
        </div>

        <p className="orders-back">
          <Link href="/account">← 返回我的</Link>
        </p>

        {error && (
          <p className="alert-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="orders-loading">加载中…</p>
        ) : items.length === 0 ? (
          <div className="orders-empty">
            <p>暂无成功购买记录</p>
            <span className="orders-empty-hint">购买并开通套餐后，会显示在这里</span>
            <Link href="/plans" className="btn btn-primary">
              去选购套餐
            </Link>
          </div>
        ) : (
          <>
            <div className="orders-list">
              {items.map((order) => {
                const title = order.plan?.name || order.plan?.code || "套餐订单";
                const when = order.paid_at || order.created_at;
                return (
                  <article key={order.id} className="orders-item">
                    <div className="orders-item-row">
                      <div className="orders-item-main">
                        <h2>{title}</h2>
                        <span className="promo-badge promo-badge--ok">
                          购买成功
                          {order.is_trial_period ? " · 试用" : ""}
                        </span>
                      </div>
                      <div className="orders-item-amount">
                        {formatCents(order.amount_cents, order.currency)}
                      </div>
                    </div>
                    <p className="orders-item-meta">
                      {formatTime(when)}
                      {providerLabel(order.provider)
                        ? ` · ${providerLabel(order.provider)}`
                        : ""}
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
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </Shell>
  );
}
