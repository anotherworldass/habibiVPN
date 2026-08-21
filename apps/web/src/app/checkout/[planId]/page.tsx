"use client";

import Link from "../../../components/LocaleLink";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";
import { useLocale } from "../../../components/LocaleProvider";
import { t } from "../../../lib/copy";
import { pickSiteCopy } from "../../../lib/locale";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  name_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
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
  if (method === "crypto") return "币";
  return "付";
}

function methodLabel(
  method: string,
  labels: { wechat: string; alipay: string; crypto: string; online: string },
) {
  if (method === "wechat_qr") return labels.wechat;
  if (method === "alipay_native") return labels.alipay;
  if (method === "crypto") return labels.crypto;
  return labels.online;
}

function formatDays(
  seconds: number | null | undefined,
  days: (n: number) => string,
  lifetime: string,
) {
  if (seconds == null) return null;
  if (seconds === 0) return lifetime;
  if (!seconds) return null;
  return seconds % 86400 === 0 ? days(seconds / 86400) : null;
}

function formatTraffic(bytes: number | null | undefined, unlimited: string) {
  if (bytes == null) return null;
  if (bytes === 0) return unlimited;
  return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

export default function CheckoutPage() {
  const locale = useLocale();
  const copy = t(locale);
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
      apiFetch<{ plans: Plan[] }>(`/api/v1/plans?locale=${encodeURIComponent(locale)}`),
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
        setPlan({
          ...current,
          name: pickSiteCopy(current.name_i18n, locale, current.name),
          description:
            pickSiteCopy(current.description_i18n, locale, current.description ?? "") ||
            null,
        });
        setChannels(available);
        setSelectedChannelId(available[0]?.id || "");
      })
      .catch((reason) => setError(friendlyError(reason, copy.checkout.loadFailed)))
      .finally(() => setLoading(false));
  }, [params.planId, router, locale, copy.checkout.loadFailed]);

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
      setError(friendlyError(reason, copy.checkout.createFailed));
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
              {copy.checkout.back}
            </Link>
            <span className="checkout-secure">
              <span aria-hidden>✓</span>
              {copy.checkout.secure}
            </span>
          </div>
          <div className="checkout-header-main">
            <div>
              <p className="checkout-eyebrow">CHECKOUT</p>
              <h1>{copy.checkout.title}</h1>
              <p>{copy.checkout.lead}</p>
            </div>
            <ol className="checkout-steps" aria-label={copy.checkout.progressAria}>
              <li data-active="true"><span>1</span>{copy.checkout.step1}</li>
              <li><span>2</span>{copy.checkout.step2}</li>
              <li><span>3</span>{copy.checkout.step3}</li>
            </ol>
          </div>
        </header>

        {error ? <p className="alert-error checkout-alert">{error}</p> : null}
        {loading ? <p className="checkout-loading">{copy.checkout.loading}</p> : null}

        {plan ? (
          <div className="checkout-layout">
            <aside className="panel checkout-summary">
              <div className="checkout-section-label">{copy.checkout.summary}</div>
              <h2>{plan.name}</h2>
              {(() => {
                const meta = [
                  formatDays(
                    plan.validity_seconds,
                    copy.checkout.days,
                    copy.checkout.lifetime,
                  ),
                  formatTraffic(plan.data_limit_bytes, copy.checkout.unlimited),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return meta ? <p className="checkout-plan-meta">{meta}</p> : null;
              })()}
              {plan.description ? <p className="checkout-description">{plan.description}</p> : null}
              <div className="checkout-price-row">
                <span>{copy.checkout.amount}</span>
                <strong>
                  <small>¥</small>
                  {(plan.price_cents / 100).toFixed(2)}
                </strong>
              </div>
              <div className="checkout-summary-foot">
                <span>{copy.checkout.currency}</span>
                <b>{plan.currency}</b>
              </div>
            </aside>

            <section className="panel checkout-payment">
              <div className="checkout-payment-head">
                <div>
                  <div className="checkout-section-label">{copy.checkout.method}</div>
                  <h2>{copy.checkout.pickChannel}</h2>
                </div>
                <span>{copy.checkout.channels(channels.length)}</span>
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
                          <small>{methodLabel(channel.method, copy.checkout)} · {copy.checkout.instant}</small>
                        </span>
                        <span className="checkout-radio" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="checkout-empty">{copy.checkout.empty}</p>
              )}

              <div className="checkout-actions">
                <div className="checkout-pay-total">
                  <span>{copy.checkout.payAmount}</span>
                  <strong>{(plan.price_cents / 100).toFixed(2)} {plan.currency}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-primary checkout-submit"
                  disabled={!selectedChannelId || submitting}
                  onClick={() => void submitOrder()}
                >
                  {submitting ? copy.checkout.submitting : copy.checkout.submit}
                  {!submitting ? <span aria-hidden>→</span> : null}
                </button>
                <p>{copy.checkout.agree}</p>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
