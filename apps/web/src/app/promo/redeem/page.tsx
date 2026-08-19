"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import PromoNav from "../../../components/PromoNav";
import Shell from "../../../components/Shell";
import { useLocale } from "../../../components/LocaleProvider";
import { useLocaleRouter } from "../../../components/useLocaleRouter";
import { apiFetch } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { t } from "../../../lib/copy";
import { friendlyError } from "../../../lib/errors";
import { formatCents } from "../../../lib/money";
import {
  detectCarrierFromPhone,
  detectCarrierFromText,
  type Carrier,
} from "../../../lib/carrier";

type Overview = {
  available_cents: number;
  pending_cents: number;
};

type CatalogItem = {
  id: string;
  kind: "phone_credit" | "gift_card";
  name: string;
  description: string | null;
  face_value_cents: number;
  price_cents: number;
  stock: number | null;
  in_stock: boolean;
};

type CatalogRes = {
  catalog_spend_enabled: boolean;
  items: CatalogItem[];
};

type Spend = {
  id: string;
  item_name: string;
  kind: string;
  face_value_cents: number;
  price_cents: number;
  status: string;
  fulfillment_result: string | null;
  created_at: string;
};

type CatalogFilter = "all" | Carrier;

const CARRIER_ORDER: Carrier[] = ["cmcc", "cucc", "ctcc"];

function badgeClass(status: string) {
  if (status === "pending") return "promo-badge promo-badge--pending";
  if (status === "fulfilled") return "promo-badge promo-badge--ok";
  if (status === "rejected") return "promo-badge promo-badge--danger";
  return "promo-badge";
}

function itemCarrier(item: { kind: string; name: string; description?: string | null }): Carrier | null {
  if (item.kind !== "phone_credit") return null;
  return detectCarrierFromText(item.name, item.description);
}

export default function PromoRedeemPage() {
  const copy = t(useLocale());
  const router = useLocaleRouter();
  const rc = copy.promoRedeem;
  const statusLabel: Record<string, string> = {
    pending: rc.stPending,
    fulfilled: rc.stFulfilled,
    rejected: rc.stRejected,
  };

  const [overview, setOverview] = useState<Overview | null>(null);
  const [catalogEnabled, setCatalogEnabled] = useState(true);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<CatalogFilter>("all");

  const selected = items.find((i) => i.id === selectedId) || null;
  const selectedCarrier = selected ? itemCarrier(selected) : null;
  const phoneCarrier = selected?.kind === "phone_credit" ? detectCarrierFromPhone(phone) : null;
  const carrierMismatch =
    !!selectedCarrier && !!phoneCarrier && selectedCarrier !== phoneCarrier;

  async function reload() {
    const [o, c, s] = await Promise.all([
      apiFetch<Overview>("/api/v1/promo/overview"),
      apiFetch<CatalogRes>("/api/v1/promo/catalog"),
      apiFetch<{ items: Spend[] }>("/api/v1/promo/spends?limit=30&offset=0"),
    ]);
    setOverview(o);
    setCatalogEnabled(c.catalog_spend_enabled);
    setItems(c.items || []);
    setSpends(s.items || []);
    setSelectedId((cur) => {
      if (cur && (c.items || []).some((i) => i.id === cur && i.in_stock)) return cur;
      return c.items?.find((i) => i.in_stock)?.id ?? null;
    });
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    reload().catch((e) => setError(friendlyError(e, copy.common.loadFailed)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function carrierLabel(carrier: Carrier | null, short = false) {
    if (carrier === "cmcc") return short ? rc.carrierCmccShort : rc.carrierCmcc;
    if (carrier === "cucc") return short ? rc.carrierCuccShort : rc.carrierCucc;
    if (carrier === "ctcc") return short ? rc.carrierCtccShort : rc.carrierCtcc;
    return rc.kindPhone;
  }

  function kindLabel(kind: string) {
    if (kind === "phone_credit") return rc.kindPhone;
    if (kind === "gift_card") return rc.kindGift;
    return kind;
  }

  const phoneCarriers = useMemo(
    () => CARRIER_ORDER.filter((c) => items.some((i) => itemCarrier(i) === c)),
    [items],
  );
  const showCarrierGroups = phoneCarriers.length > 0;
  const visibleItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => itemCarrier(i) === filter);
  }, [items, filter]);

  useEffect(() => {
    if (filter !== "all" && !phoneCarriers.includes(filter)) {
      setFilter("all");
    }
  }, [filter, phoneCarriers]);

  useEffect(() => {
    if (visibleItems.some((i) => i.id === selectedId)) return;
    setSelectedId(visibleItems.find((i) => i.in_stock)?.id ?? null);
  }, [visibleItems, selectedId]);

  function stockText(item: CatalogItem) {
    if (!item.in_stock) return rc.outOfStock;
    if (item.stock == null) return rc.stockUnlimited;
    return String(item.stock);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!selected) return;

    const fulfillment: Record<string, string> = {};
    if (selected.kind === "phone_credit") {
      const value = phone.trim();
      if (value.length < 6 || value.length > 32) {
        setError(rc.needPhone);
        return;
      }
      fulfillment.phone = value;
    } else {
      const value = email.trim();
      if (!value.includes("@") || value.length > 200) {
        setError(rc.needEmail);
        return;
      }
      fulfillment.email = value;
    }

    setLoading(true);
    try {
      await apiFetch("/api/v1/promo/spends", {
        method: "POST",
        body: JSON.stringify({
          catalog_item_id: selected.id,
          fulfillment,
        }),
      });
      setOk(rc.ok);
      setPhone("");
      setEmail("");
      await reload();
    } catch (err) {
      setError(friendlyError(err, rc.fail));
    } finally {
      setLoading(false);
    }
  }

  const catalogOpen = catalogEnabled && items.length > 0;

  return (
    <Shell>
      <div className="promo-page">
        <div className="page-head">
          <h1>{rc.title}</h1>
        </div>
        <PromoNav />

        {overview && (
          <section className="promo-hero promo-hero--redeem">
            <div className="promo-hero-primary">
              <div className="promo-hero-label">{rc.balance}</div>
              <div className="promo-hero-value">{formatCents(overview.available_cents)}</div>
              <span className="promo-hero-caption">{rc.reviewHint}</span>
            </div>
            <div className="promo-hero-meta">
              <div className="promo-hero-meta-item">
                <span>{copy.promo.pending}</span>
                <strong>{formatCents(overview.pending_cents)}</strong>
              </div>
            </div>
            <div className="promo-hero-notes" aria-labelledby="redeem-notes-title">
              <div className="promo-hero-label" id="redeem-notes-title">
                {rc.notes}
              </div>
              <ul className="promo-rule-bullets">
                <li>{rc.noteSpend}</li>
                <li>{rc.noteKinds}</li>
              </ul>
            </div>
          </section>
        )}

        <div className="promo-desktop-split promo-redeem-split">
          <form onSubmit={onSubmit} className="panel promo-section">
            <div className="promo-section-head">
              <h2 className="promo-section-title">{rc.items}</h2>
              <span className="promo-section-hint">{rc.itemsHint}</span>
            </div>
            {error && (
              <p className="alert-error" style={{ marginBottom: 12 }}>
                {error}
              </p>
            )}
            {ok && (
              <p className="alert-ok" style={{ marginBottom: 12 }}>
                {ok}
              </p>
            )}

            {!catalogOpen ? (
              <div className="promo-empty" style={{ marginTop: 8 }}>
                {catalogEnabled ? rc.emptyItems : rc.closed}
              </div>
            ) : (
              <>
                {showCarrierGroups ? (
                  <div
                    className="promo-chips promo-catalog-filters"
                    role="tablist"
                    aria-label={rc.filterAria}
                  >
                    <button
                      type="button"
                      className="promo-chip"
                      role="tab"
                      data-active={filter === "all" ? "true" : "false"}
                      aria-selected={filter === "all"}
                      onClick={() => setFilter("all")}
                    >
                      {rc.filterAll}
                    </button>
                    {phoneCarriers.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="promo-chip"
                        role="tab"
                        data-active={filter === c ? "true" : "false"}
                        aria-selected={filter === c}
                        onClick={() => setFilter(c)}
                      >
                        {carrierLabel(c, true)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {visibleItems.length === 0 ? (
                  <div className="promo-empty" style={{ marginTop: 8 }}>
                    {rc.filterEmpty}
                  </div>
                ) : (
                  <div className="promo-catalog-grid">
                    {visibleItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="promo-catalog-card"
                        data-active={selectedId === item.id ? "true" : "false"}
                        disabled={!item.in_stock}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="promo-catalog-top">
                          <div className="promo-catalog-name">{item.name}</div>
                          <span className="promo-badge">{kindLabel(item.kind)}</span>
                        </div>
                        {item.description ? (
                          <p className="promo-catalog-desc">{item.description}</p>
                        ) : null}
                        <div className="promo-catalog-meta">
                          <span>
                            {rc.face} <strong>{formatCents(item.face_value_cents)}</strong>
                          </span>
                          <span>
                            {rc.price} <strong>{formatCents(item.price_cents)}</strong>
                          </span>
                          <span>
                            {rc.stock} {stockText(item)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selected?.kind === "phone_credit" ? (
                  <label className="field promo-redeem-field">
                    <span className="field-label">{rc.phone}</span>
                    <input
                      className="field-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={rc.phonePh}
                      inputMode="tel"
                      autoComplete="tel"
                      required
                    />
                    {phoneCarrier ? (
                      <span
                        className="promo-carrier-hint"
                        data-mismatch={carrierMismatch ? "true" : "false"}
                      >
                        {carrierMismatch
                          ? rc.carrierMismatch
                          : rc.phoneCarrier(carrierLabel(phoneCarrier))}
                      </span>
                    ) : null}
                  </label>
                ) : selected ? (
                  <label className="field promo-redeem-field">
                    <span className="field-label">{rc.email}</span>
                    <input
                      className="field-input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={rc.emailPh}
                      autoComplete="email"
                      required
                    />
                  </label>
                ) : null}

                <button
                  type="submit"
                  className="btn btn-primary btn-block promo-redeem-submit"
                  disabled={loading || !selected}
                >
                  {loading ? rc.submitting : rc.submit}
                </button>
              </>
            )}
          </form>

          <section className="panel promo-section">
            <div className="promo-section-head">
              <h2 className="promo-section-title">{rc.history}</h2>
            </div>
            {spends.length === 0 ? (
              <div className="promo-empty" style={{ marginTop: 8 }}>
                {rc.empty}
              </div>
            ) : (
              <div className="promo-list" style={{ marginTop: 8 }}>
                {spends.map((it) => {
                  const spendCarrier =
                    it.kind === "phone_credit" ? detectCarrierFromText(it.item_name) : null;
                  return (
                  <div key={it.id} className="promo-list-item">
                    <div className="promo-list-row">
                      <div>
                        <div className="promo-list-title">{it.item_name}</div>
                        <div className="promo-list-amount">{formatCents(it.price_cents)}</div>
                      </div>
                      <span className={badgeClass(it.status)}>
                        {statusLabel[it.status] || it.status}
                      </span>
                    </div>
                    <div className="promo-list-meta">
                      {kindLabel(it.kind)}
                      {spendCarrier ? ` · ${carrierLabel(spendCarrier)}` : ""} · {rc.face}{" "}
                      {formatCents(it.face_value_cents)}
                      <br />
                      {new Date(it.created_at).toLocaleString()}
                      {it.status === "fulfilled" && it.kind === "gift_card" && it.fulfillment_result ? (
                        <>
                          <br />
                          {rc.code} {it.fulfillment_result}
                        </>
                      ) : null}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
