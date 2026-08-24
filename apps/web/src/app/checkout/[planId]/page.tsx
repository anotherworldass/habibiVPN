"use client";

import Link from "../../../components/LocaleLink";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Shell from "../../../components/Shell";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { friendlyError } from "../../../lib/errors";
import { useLocale } from "../../../components/LocaleProvider";
import { t } from "../../../lib/copy";
import { pickSiteCopy } from "../../../lib/locale";
import {
  slotCompatibleWithPlan,
  type RenewableSlot,
} from "../../../lib/renew-compat";

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
  device_slots?: number;
  reset_policy?: string;
  custom_reset_interval?: string | null;
  upstream_plan_ref?: string | null;
  fup_tiers?: unknown;
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
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const locale = useLocale();
  const copy = t(locale);
  const params = useParams<{ planId: string }>();
  const search = useSearchParams();
  const lockedSlotId = search.get("renew_slot")?.trim() || "";
  const router = useLocaleRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [slots, setSlots] = useState<RenewableSlot[]>([]);
  const [intent, setIntent] = useState<"new_slot" | "renew">(
    lockedSlotId ? "renew" : "new_slot",
  );
  const [selectedSlotId, setSelectedSlotId] = useState(lockedSlotId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const checkoutPath = `/checkout/${params.planId}${
    lockedSlotId ? `?renew_slot=${encodeURIComponent(lockedSlotId)}` : ""
  }`;

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(checkoutPath)}`);
      return;
    }
    Promise.all([
      apiFetch<{ plans: Plan[] }>(
        `/api/v1/plans?client=h5&locale=${encodeURIComponent(locale)}`,
      ),
      apiFetch<{ channels: PaymentChannel[] }>(
        `/api/v1/payment-channels?plan_id=${encodeURIComponent(params.planId)}`,
      ),
      apiFetch<{ subscriptions: RenewableSlot[] }>("/api/v1/subscriptions").catch(
        () => ({ subscriptions: [] as RenewableSlot[] }),
      ),
    ])
      .then(([planResult, channelResult, subResult]) => {
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
        setSlots(subResult.subscriptions || []);
      })
      .catch((reason) => setError(friendlyError(reason, copy.checkout.loadFailed)))
      .finally(() => setLoading(false));
  }, [
    params.planId,
    router,
    locale,
    copy.checkout.loadFailed,
    checkoutPath,
  ]);

  const compatibleSlots = useMemo(() => {
    if (!plan) return [];
    return slots.filter((s) => slotCompatibleWithPlan(s, plan));
  }, [slots, plan]);

  const lockedSlot = useMemo(
    () => compatibleSlots.find((s) => s.id === lockedSlotId) || null,
    [compatibleSlots, lockedSlotId],
  );

  useEffect(() => {
    if (lockedSlotId) {
      setIntent("renew");
      setSelectedSlotId(lockedSlotId);
      return;
    }
    if (intent === "renew" && selectedSlotId) {
      if (!compatibleSlots.some((s) => s.id === selectedSlotId)) {
        setSelectedSlotId(compatibleSlots[0]?.id || "");
      }
      return;
    }
    if (intent === "renew" && !selectedSlotId && compatibleSlots[0]) {
      setSelectedSlotId(compatibleSlots[0].id);
    }
  }, [lockedSlotId, compatibleSlots, intent, selectedSlotId]);

  async function submitOrder() {
    if (!plan || !selectedChannelId) return;
    if (intent === "renew" && !selectedSlotId) {
      setError(copy.checkout.pickSlot);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await apiFetch<{ order: { id: string } }>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          plan_id: plan.id,
          channel_id: selectedChannelId,
          provision_mode: intent,
          ...(intent === "renew" ? { slot_id: selectedSlotId } : {}),
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
        {lockedSlotId && !loading && plan && !lockedSlot ? (
          <p className="alert-error checkout-alert">{copy.checkout.noCompatibleSlot}</p>
        ) : null}
        {lockedSlotId && !loading && plan && !lockedSlot ? (
          <p className="alert-error checkout-alert">{copy.checkout.noCompatibleSlot}</p>
        ) : null}
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

              {lockedSlot ? (
                <p className="checkout-intent-locked">
                  {copy.checkout.intentLocked}{" "}
                  <strong>{lockedSlot.plan_name || lockedSlot.id}</strong>
                  {lockedSlot.expires_at ? (
                    <>
                      {" · "}
                      {new Date(lockedSlot.expires_at).toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}
                    </>
                  ) : null}
                </p>
              ) : compatibleSlots.length > 0 ? (
                <div className="checkout-intent">
                  <button
                    type="button"
                    className="checkout-channel"
                    data-selected={intent === "new_slot"}
                    onClick={() => setIntent("new_slot")}
                  >
                    <span className="checkout-channel-copy">
                      <strong>{copy.checkout.intentNew}</strong>
                      <small>{copy.checkout.intentNewHint}</small>
                    </span>
                    <span className="checkout-radio" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="checkout-channel"
                    data-selected={intent === "renew"}
                    onClick={() => {
                      setIntent("renew");
                      if (!selectedSlotId && compatibleSlots[0]) {
                        setSelectedSlotId(compatibleSlots[0].id);
                      }
                    }}
                  >
                    <span className="checkout-channel-copy">
                      <strong>{copy.checkout.intentRenew}</strong>
                      <small>{copy.checkout.intentRenewHint}</small>
                    </span>
                    <span className="checkout-radio" aria-hidden />
                  </button>
                  {intent === "renew" ? (
                    <label className="checkout-slot-pick">
                      <span>{copy.checkout.pickSlot}</span>
                      <select
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                      >
                        {compatibleSlots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.plan_name || s.id) +
                              (s.status === "expired" ||
                              (s.expires_at &&
                                new Date(s.expires_at).getTime() < Date.now())
                                ? ` (${copy.checkout.slotExpired})`
                                : "")}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}

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
                  disabled={
                    !selectedChannelId ||
                    submitting ||
                    (lockedSlotId ? !lockedSlot : false) ||
                    (intent === "renew" && !selectedSlotId)
                  }
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
