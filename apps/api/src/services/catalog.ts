import type {
  ClientChannel,
  OfferPaymentMode,
  Plan,
  PlanBillingType,
  PlanCatalogOffer,
  PlanGroup,
  StorePlatform,
  StoreProduct,
  StoreProductKind,
} from "@prisma/client";
import { pickAppCopy } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { serializePlan } from "../lib/serialize.js";
import { asCopyMap, localizePlanCopy } from "./plan-i18n.js";

export const CLIENT_CHANNELS: ClientChannel[] = [
  "ios_appstore",
  "ios_alt",
  "android_play",
  "android_direct",
  "h5",
  "windows",
  "macos",
];

export function parseClientChannel(raw: string | undefined | null): ClientChannel {
  const v = (raw || "h5").trim().toLowerCase();
  if ((CLIENT_CHANNELS as string[]).includes(v)) return v as ClientChannel;
  throw Object.assign(new Error("catalog.client_invalid"), { statusCode: 400 });
}

function defaultPaymentMode(client: ClientChannel): OfferPaymentMode {
  if (client === "ios_appstore" || client === "android_play") return "iap_only";
  return "web_only";
}

/** Ensure a plan has catalog rows for every client (idempotent). */
export async function ensurePlanCatalogOffers(planId: string): Promise<void> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;

  for (const client of CLIENT_CHANNELS) {
    await prisma.planCatalogOffer.upsert({
      where: { planId_client: { planId, client } },
      create: {
        planId,
        client,
        enabled: client === "android_play" ? false : plan.enabled,
        sortOrder: plan.sortOrder,
        paymentMode: defaultPaymentMode(client),
      },
      update: {},
    });
  }
}

export type CatalogOfferInput = {
  client: ClientChannel;
  enabled?: boolean;
  sortOrder?: number;
  paymentMode?: OfferPaymentMode;
};

export type StoreProductInput = {
  store: StorePlatform;
  productId: string;
  productKind: StoreProductKind;
  /** Catalog / marketing only; ASC is source of truth at purchase time */
  trialDays?: number | null;
  enabled?: boolean;
};

export async function replacePlanCatalog(
  planId: string,
  offers: CatalogOfferInput[],
): Promise<PlanCatalogOffer[]> {
  await ensurePlanCatalogOffers(planId);
  await prisma.$transaction(
    offers.map((o) =>
      prisma.planCatalogOffer.upsert({
        where: { planId_client: { planId, client: o.client } },
        create: {
          planId,
          client: o.client,
          enabled: o.enabled ?? true,
          sortOrder: o.sortOrder ?? 0,
          paymentMode: o.paymentMode ?? defaultPaymentMode(o.client),
        },
        update: {
          ...(o.enabled != null ? { enabled: o.enabled } : {}),
          ...(o.sortOrder != null ? { sortOrder: o.sortOrder } : {}),
          ...(o.paymentMode != null ? { paymentMode: o.paymentMode } : {}),
        },
      }),
    ),
  );
  return prisma.planCatalogOffer.findMany({
    where: { planId },
    orderBy: { client: "asc" },
  });
}

export async function replacePlanStoreProducts(
  planId: string,
  products: StoreProductInput[],
): Promise<StoreProduct[]> {
  await prisma.$transaction(async (tx) => {
    await tx.storeProduct.deleteMany({ where: { planId } });
    if (products.length) {
      await tx.storeProduct.createMany({
        data: products.map((p) => ({
          planId,
          store: p.store,
          productId: p.productId.trim(),
          productKind: p.productKind,
          trialDays:
            p.trialDays == null || p.trialDays === undefined
              ? null
              : Math.max(0, Math.trunc(p.trialDays)),
          enabled: p.enabled ?? true,
        })),
      });
    }
  });
  return prisma.storeProduct.findMany({
    where: { planId },
    orderBy: [{ store: "asc" }, { productId: "asc" }],
  });
}

/** Catalog compare period: billing_period ?? validity_seconds ?? calendar_months≈30d */
export function resolveBillingPeriodSeconds(plan: {
  billingPeriodSeconds?: number | null;
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
}): number | null {
  if (plan.billingPeriodSeconds != null && plan.billingPeriodSeconds > 0) {
    return plan.billingPeriodSeconds;
  }
  if (plan.validitySeconds != null && plan.validitySeconds > 0) {
    return plan.validitySeconds;
  }
  if (
    plan.validityCalendarMonths != null &&
    plan.validityCalendarMonths > 0
  ) {
    // Approximate for daily-price only (not used for provision)
    return plan.validityCalendarMonths * 30 * 86400;
  }
  return null;
}

/** floor(price_cents * 86400 / period_seconds) */
export function computeDailyPriceCents(
  priceCents: number,
  periodSeconds: number | null,
): number | null {
  if (periodSeconds == null || periodSeconds <= 0) return null;
  return Math.floor((priceCents * 86400) / periodSeconds);
}

export type PublicCatalogPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  name_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  price_cents: number;
  currency: string;
  validity_seconds: number | null;
  /** When set, provision uses calendar-month expire_at instead of validity_seconds */
  validity_calendar_months: number | null;
  billing_period_seconds: number | null;
  daily_price_cents: number | null;
  data_limit_bytes: number | null;
  reset_policy: string;
  custom_reset_interval: string | null;
  device_slots: number;
  billing_type: PlanBillingType;
  is_free_claimable: boolean;
  already_claimed: boolean;
  can_repurchase: boolean;
  enabled: boolean;
  payment_mode: OfferPaymentMode;
  /** Set only when the plan's group exists and is enabled */
  group_id: string | null;
  store_product: {
    store: StorePlatform;
    product_id: string;
    product_kind: StoreProductKind;
    trial_days: number | null;
  } | null;
};

export type PublicCatalogGroup = {
  id: string;
  code: string;
  name: string;
  name_i18n: Record<string, string>;
  sort_order: number;
};

/** Enabled plan groups for a project (catalog / preview). */
export async function listEnabledPlanGroups(
  projectId: string,
  locale?: string | null,
): Promise<PublicCatalogGroup[]> {
  const rows = await prisma.planGroup.findMany({
    where: { projectId, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((g) => {
    const nameI18n = asCopyMap(g.nameI18n);
    if (!Object.keys(nameI18n).length && g.name) nameI18n.zh = g.name;
    const localized =
      pickAppCopy(nameI18n, locale).text ||
      pickAppCopy(nameI18n, "zh").text ||
      g.name;
    return {
      id: g.id,
      code: g.code,
      name: localized,
      name_i18n: nameI18n as Record<string, string>,
      sort_order: g.sortOrder,
    };
  });
}

function storeForClient(client: ClientChannel): StorePlatform | null {
  if (client === "ios_appstore") return "app_store";
  if (client === "android_play") return "google_play";
  return null;
}

export async function listCatalogPlansForClient(input: {
  client: ClientChannel;
  projectId: string;
  claimedPlanIds?: Set<string>;
  locale?: string | null;
}): Promise<PublicCatalogPlan[]> {
  const claimed = input.claimedPlanIds || new Set<string>();
  const store = storeForClient(input.client);

  const offers = await prisma.planCatalogOffer.findMany({
    where: {
      client: input.client,
      enabled: true,
      plan: { enabled: true, projectId: input.projectId },
    },
    include: {
      plan: {
        include: {
          group: true,
          storeProducts: store
            ? { where: { enabled: true, store } }
            : false,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return offers.map((o) => {
    const s = serializePlan(o.plan);
    const copy = localizePlanCopy(o.plan, input.locale);
    const products = Array.isArray(o.plan.storeProducts) ? o.plan.storeProducts : [];
    const sp = products[0] || null;
    const free = !!o.plan.isFreeClaimable;
    const already = claimed.has(o.plan.id);
    const billingPeriod =
      o.plan.billingPeriodSeconds ?? null;
    const periodForDaily = resolveBillingPeriodSeconds(o.plan);
    const group = o.plan.group;
    const groupId =
      group && group.enabled ? group.id : null;
    return {
      id: s.id,
      code: s.code,
      name: copy.name,
      description: copy.description,
      name_i18n: copy.name_i18n as Record<string, string>,
      description_i18n: copy.description_i18n as Record<string, string>,
      price_cents: s.priceCents,
      currency: s.currency,
      validity_seconds: s.validitySeconds,
      validity_calendar_months: o.plan.validityCalendarMonths ?? null,
      billing_period_seconds: billingPeriod,
      daily_price_cents: computeDailyPriceCents(s.priceCents, periodForDaily),
      data_limit_bytes: s.dataLimitBytes,
      reset_policy: o.plan.resetPolicy ?? "no_reset",
      custom_reset_interval: o.plan.customResetInterval ?? null,
      device_slots: o.plan.deviceSlots,
      billing_type: o.plan.billingType,
      is_free_claimable: free,
      already_claimed: already,
      // Free claim once; paid packs can repurchase to renew
      can_repurchase: !free,
      enabled: s.enabled,
      group_id: groupId,
      // 商店端强制 IAP，忽略 Admin 误配的 web_only / iap_or_web。
      payment_mode:
        input.client === "ios_appstore" || input.client === "android_play"
          ? "iap_only"
          : o.paymentMode,
      store_product: sp
        ? {
            store: sp.store,
            product_id: sp.productId,
            product_kind: sp.productKind,
            trial_days: sp.trialDays ?? null,
          }
        : null,
    };
  });
}

/** Plans + enabled groups for a client catalog (user GET /plans / admin preview). */
export async function listCatalogForClient(input: {
  client: ClientChannel;
  projectId: string;
  claimedPlanIds?: Set<string>;
  locale?: string | null;
}): Promise<{ plans: PublicCatalogPlan[]; groups: PublicCatalogGroup[] }> {
  const [plans, groups] = await Promise.all([
    listCatalogPlansForClient(input),
    listEnabledPlanGroups(input.projectId, input.locale),
  ]);
  return { plans, groups };
}

export function serializePlanAdmin(
  plan: Plan & {
    catalogOffers?: PlanCatalogOffer[];
    storeProducts?: StoreProduct[];
    group?: PlanGroup | null;
  },
) {
  const base = serializePlan(plan);
  const nameI18n = asCopyMap(plan.nameI18n);
  const descriptionI18n = asCopyMap(plan.descriptionI18n);
  if (!Object.keys(nameI18n).length && plan.name) nameI18n.zh = plan.name;
  if (!Object.keys(descriptionI18n).length && plan.description) {
    descriptionI18n.zh = plan.description;
  }
  const group = plan.group ?? null;
  return {
    ...base,
    groupId: plan.groupId ?? null,
    group: group
      ? {
          id: group.id,
          code: group.code,
          name: group.name,
          enabled: group.enabled,
          sortOrder: group.sortOrder,
        }
      : null,
    nameI18n,
    descriptionI18n,
    deviceSlots: plan.deviceSlots,
    billingType: plan.billingType,
    billingPeriodSeconds: plan.billingPeriodSeconds ?? null,
    validityCalendarMonths: plan.validityCalendarMonths ?? null,
    resetPolicy: plan.resetPolicy ?? "no_reset",
    customResetInterval: plan.customResetInterval ?? null,
    catalogOffers: (plan.catalogOffers || []).map((o) => ({
      id: o.id,
      client: o.client,
      enabled: o.enabled,
      sortOrder: o.sortOrder,
      paymentMode: o.paymentMode,
    })),
    storeProducts: (plan.storeProducts || []).map((p) => ({
      id: p.id,
      store: p.store,
      productId: p.productId,
      productKind: p.productKind,
      trialDays: p.trialDays ?? null,
      enabled: p.enabled,
    })),
  };
}
