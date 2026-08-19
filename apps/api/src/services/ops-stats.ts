import type { ClientChannel, OrderStatus } from "@prisma/client";
import { normalizeTimezone } from "../lib/normalize-timezone.js";
import { prisma } from "../lib/prisma.js";

const PAID_STATUSES: OrderStatus[] = ["paid", "provisioning", "provisioned"];
const TZ_OFFSET_HOURS = 8; // Asia/Shanghai day buckets

export type OpsStatsRange = {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD inclusive
};

type DayCountRow = { day: string; cnt: bigint | number };
type DayMoneyRow = { day: string; cnt: bigint | number; amount: bigint | number };
type NamedCount = { key: string; name: string; count: number; amount_cents?: number };

function n(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Inclusive YYYY-MM-DD range → [fromUtc, toExclusiveUtc) using Asia/Shanghai midnight. */
export function resolveOpsRange(input: {
  from?: string;
  to?: string;
  /** default lookback days when from omitted */
  defaultDays?: number;
}): { from: Date; toExclusive: Date; fromDay: string; toDay: string } {
  const defaultDays = input.defaultDays ?? 1;
  const now = new Date();
  const todayShang =
    new Date(now.getTime() + TZ_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);

  const toDay = input.to?.trim() || todayShang;
  let fromDay = input.from?.trim() || "";
  if (!fromDay) {
    const toParsed = parseDay(toDay) || parseDay(todayShang)!;
    const fromParsed = new Date(toParsed.getTime() - (defaultDays - 1) * 86400_000);
    fromDay = fromParsed.toISOString().slice(0, 10);
  }

  const fromLocal = parseDay(fromDay);
  const toLocal = parseDay(toDay);
  if (!fromLocal || !toLocal) {
    throw Object.assign(new Error("ops.invalid_range"), { statusCode: 400 });
  }
  if (fromLocal.getTime() > toLocal.getTime()) {
    throw Object.assign(new Error("ops.invalid_range"), { statusCode: 400 });
  }
  // Cap 90 days
  const spanDays = (toLocal.getTime() - fromLocal.getTime()) / 86400_000 + 1;
  if (spanDays > 90) {
    throw Object.assign(new Error("ops.range_too_long"), { statusCode: 400 });
  }

  // Shanghai midnight = UTC midnight - 8h for that calendar day
  const from = new Date(fromLocal.getTime() - TZ_OFFSET_HOURS * 3600_000);
  const toExclusive = new Date(toLocal.getTime() + 86400_000 - TZ_OFFSET_HOURS * 3600_000);

  return { from, toExclusive, fromDay, toDay };
}

function eachDay(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  let cur = parseDay(fromDay)!;
  const end = parseDay(toDay)!;
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400_000);
  }
  return out;
}

function dayExpr(column: string) {
  // DATE_ADD shifts UTC (or session) storage toward Shanghai calendar day
  return `DATE_FORMAT(DATE_ADD(${column}, INTERVAL ${TZ_OFFSET_HOURS} HOUR), '%Y-%m-%d')`;
}

const CLIENT_LABEL: Record<string, string> = {
  ios_appstore: "iOS App Store",
  ios_alt: "iOS 企业/TF",
  android_play: "Android Play",
  android_direct: "Android 直装",
  h5: "H5 / Web",
  windows: "Windows",
  macos: "macOS",
};

const LANG_LABEL: Record<string, string> = {
  zh: "中文",
  en: "English",
  fa: "فارسی",
  ar: "العربية",
  ru: "Русский",
  tr: "Türkçe",
  es: "Español",
  pt: "Português",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Indonesia",
  hi: "हिन्दी",
  de: "Deutsch",
  fr: "Français",
  unknown: "未知",
};

function clientLabel(c: string | null | undefined) {
  if (!c) return "未知";
  return CLIENT_LABEL[c] || c;
}

function langLabel(code: string | null | undefined) {
  if (!code || code === "unknown") return "未知";
  return LANG_LABEL[code] || code;
}

/** Auth events used for locale / timezone / client activity breakdowns. */
const AUTH_ACTIVITY_SQL = `e.success = 1
         AND e.event_type IN ('login','register','register_bind','anonymous_bootstrap')
         AND e.user_id IS NOT NULL`;

export async function getOpsStats(projectId: string, range: OpsStatsRange) {
  const { from, toExclusive, fromDay, toDay } = resolveOpsRange(range);
  const days = eachDay(fromDay, toDay);

  const [
    usersTotal,
    regsInRange,
    regsInvited,
    regsAnonymous,
    regsByClient,
    regsByPackage,
    paidAgg,
    refundAgg,
    ordersCreated,
    ordersByStatus,
    paidByProvider,
    paidByPlan,
    paidByKind,
    payingUsers,
    firstPaidUsers,
    newUsersWhoPaid,
    dailyRegs,
    dailyPaid,
    dailyLogins,
    authByClient,
    authByLocale,
    authByLanguage,
    authByTimezone,
    downloadsByPackage,
  ] = await Promise.all([
    prisma.user.count({ where: { projectId } }),
    prisma.user.count({
      where: { projectId, createdAt: { gte: from, lt: toExclusive } },
    }),
    prisma.user.count({
      where: {
        projectId,
        createdAt: { gte: from, lt: toExclusive },
        invitedById: { not: null },
      },
    }),
    prisma.user.count({
      where: {
        projectId,
        createdAt: { gte: from, lt: toExclusive },
        email: null,
      },
    }),
    prisma.user.groupBy({
      by: ["sourceClient"],
      where: { projectId, createdAt: { gte: from, lt: toExclusive } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["sourcePackageId"],
      where: {
        projectId,
        createdAt: { gte: from, lt: toExclusive },
        sourcePackageId: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        user: { projectId },
        status: "refunded",
        updatedAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: {
        user: { projectId },
        createdAt: { gte: from, lt: toExclusive },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: {
        user: { projectId },
        createdAt: { gte: from, lt: toExclusive },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.order.groupBy({
      by: ["provider"],
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.order.groupBy({
      by: ["planId"],
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: "desc" } },
      take: 20,
    }),
    prisma.order.groupBy({
      by: ["commissionKind"],
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.order.findMany({
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.order.count({
      where: {
        user: { projectId },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
        commissionKind: "first",
      },
    }),
    prisma.order.findMany({
      where: {
        user: {
          projectId,
          createdAt: { gte: from, lt: toExclusive },
        },
        paidAt: { gte: from, lt: toExclusive },
        amountCents: { gt: 0 },
        status: { in: PAID_STATUSES },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.$queryRawUnsafe<DayCountRow[]>(
      `SELECT ${dayExpr("created_at")} AS day, COUNT(*) AS cnt
       FROM users
       WHERE project_id = ?
         AND created_at >= ?
         AND created_at < ?
       GROUP BY day
       ORDER BY day`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<DayMoneyRow[]>(
      `SELECT ${dayExpr("paid_at")} AS day,
              COUNT(*) AS cnt,
              COALESCE(SUM(amount_cents), 0) AS amount
       FROM orders o
       INNER JOIN users u ON u.id = o.user_id
       WHERE u.project_id = ?
         AND o.paid_at >= ?
         AND o.paid_at < ?
         AND o.amount_cents > 0
         AND o.status IN ('paid','provisioning','provisioned')
       GROUP BY day
       ORDER BY day`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<DayCountRow[]>(
      `SELECT ${dayExpr("e.created_at")} AS day, COUNT(DISTINCT e.user_id) AS cnt
       FROM user_auth_events e
       INNER JOIN users u ON u.id = e.user_id
       WHERE u.project_id = ?
         AND e.event_type = 'login'
         AND e.success = 1
         AND e.created_at >= ?
         AND e.created_at < ?
       GROUP BY day
       ORDER BY day`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<Array<{ client: string | null; cnt: bigint | number }>>(
      `SELECT e.client AS client, COUNT(DISTINCT e.user_id) AS cnt
       FROM user_auth_events e
       INNER JOIN users u ON u.id = e.user_id
       WHERE u.project_id = ?
         AND e.event_type = 'login'
         AND e.success = 1
         AND e.created_at >= ?
         AND e.created_at < ?
       GROUP BY e.client
       ORDER BY cnt DESC`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<Array<{ v: string | null; cnt: bigint | number }>>(
      `SELECT COALESCE(NULLIF(TRIM(e.locale), ''), 'unknown') AS v,
              COUNT(DISTINCT e.user_id) AS cnt
       FROM user_auth_events e
       INNER JOIN users u ON u.id = e.user_id
       WHERE u.project_id = ?
         AND ${AUTH_ACTIVITY_SQL}
         AND e.created_at >= ?
         AND e.created_at < ?
       GROUP BY v
       ORDER BY cnt DESC
       LIMIT 40`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<Array<{ v: string | null; cnt: bigint | number }>>(
      `SELECT COALESCE(
                NULLIF(
                  LOWER(SUBSTRING_INDEX(REPLACE(TRIM(e.locale), '_', '-'), '-', 1)),
                  ''
                ),
                'unknown'
              ) AS v,
              COUNT(DISTINCT e.user_id) AS cnt
       FROM user_auth_events e
       INNER JOIN users u ON u.id = e.user_id
       WHERE u.project_id = ?
         AND ${AUTH_ACTIVITY_SQL}
         AND e.created_at >= ?
         AND e.created_at < ?
       GROUP BY v
       ORDER BY cnt DESC
       LIMIT 40`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.$queryRawUnsafe<Array<{ v: string | null; cnt: bigint | number }>>(
      `SELECT COALESCE(NULLIF(TRIM(e.timezone), ''), 'unknown') AS v,
              COUNT(DISTINCT e.user_id) AS cnt
       FROM user_auth_events e
       INNER JOIN users u ON u.id = e.user_id
       WHERE u.project_id = ?
         AND ${AUTH_ACTIVITY_SQL}
         AND e.created_at >= ?
         AND e.created_at < ?
       GROUP BY v
       ORDER BY cnt DESC
       LIMIT 40`,
      projectId,
      from,
      toExclusive,
    ),
    prisma.appDownloadDaily.groupBy({
      by: ["packageId", "versionKey", "versionName", "versionCode"],
      where: {
        package: { projectId },
        day: { gte: parseDay(fromDay)!, lte: parseDay(toDay)! },
      },
      _sum: { count: true },
    }),
  ]);

  const packageIds = [
    ...new Set([
      ...regsByPackage
        .map((r) => r.sourcePackageId)
        .filter((id): id is string => !!id),
      ...downloadsByPackage.map((r) => r.packageId),
    ]),
  ];
  const planIds = paidByPlan.map((r) => r.planId);
  const [packages, plans] = await Promise.all([
    packageIds.length
      ? prisma.appPackage.findMany({
          where: { id: { in: packageIds } },
          select: { id: true, name: true, client: true, packageName: true },
        })
      : Promise.resolve([]),
    planIds.length
      ? prisma.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const pkgMap = new Map(packages.map((p) => [p.id, p]));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const regsByClientOut: NamedCount[] = regsByClient
    .map((r) => ({
      key: r.sourceClient || "unknown",
      name: clientLabel(r.sourceClient as ClientChannel | null),
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const regsByPackageOut: NamedCount[] = regsByPackage
    .map((r) => {
      const pkg = r.sourcePackageId ? pkgMap.get(r.sourcePackageId) : null;
      return {
        key: r.sourcePackageId || "unknown",
        name: pkg
          ? `${pkg.name} (${clientLabel(pkg.client)})`
          : r.sourcePackageId || "未知包",
        count: r._count._all,
      };
    })
    .sort((a, b) => b.count - a.count);

  const downloadTotals = new Map<string, number>();
  for (const row of downloadsByPackage) {
    downloadTotals.set(
      row.packageId,
      (downloadTotals.get(row.packageId) || 0) + (row._sum.count || 0),
    );
  }
  const downloadsByPackageOut: NamedCount[] = [...downloadTotals.entries()]
    .map(([packageId, count]) => {
      const pkg = pkgMap.get(packageId);
      return {
        key: packageId,
        name: pkg ? `${pkg.name} (${clientLabel(pkg.client)})` : packageId,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  const downloadsByVersionOut: NamedCount[] = downloadsByPackage
    .map((r) => {
      const pkg = pkgMap.get(r.packageId);
      const packageName = pkg
        ? `${pkg.name} (${clientLabel(pkg.client)})`
        : r.packageId;
      const version =
        r.versionName && r.versionCode != null
          ? `${r.versionName} (${r.versionCode})`
          : r.versionName || (r.versionCode != null ? String(r.versionCode) : "未标记版本");
      return {
        key: `${r.packageId}:${r.versionKey}`,
        name: `${packageName} · ${version}`,
        count: r._sum.count || 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const byProvider: NamedCount[] = paidByProvider
    .map((r) => ({
      key: r.provider || "unknown",
      name: r.provider || "未知渠道",
      count: r._count._all,
      amount_cents: r._sum.amountCents || 0,
    }))
    .sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0));

  const byPlan: NamedCount[] = paidByPlan.map((r) => {
    const p = planMap.get(r.planId);
    return {
      key: r.planId,
      name: p ? `${p.name} (${p.code})` : r.planId,
      count: r._count._all,
      amount_cents: r._sum.amountCents || 0,
    };
  });

  const byKind: NamedCount[] = paidByKind.map((r) => ({
    key: r.commissionKind,
    name: r.commissionKind === "first" ? "首购" : "续费",
    count: r._count._all,
    amount_cents: r._sum.amountCents || 0,
  }));

  const byOrderStatus = ordersByStatus.map((r) => ({
    key: r.status,
    name: r.status,
    count: r._count._all,
    amount_cents: r._sum.amountCents || 0,
  }));

  const loginByClient: NamedCount[] = authByClient
    .map((r) => ({
      key: r.client || "unknown",
      name: clientLabel(r.client),
      count: n(r.cnt),
    }))
    .sort((a, b) => b.count - a.count);

  const byLocale: NamedCount[] = authByLocale.map((r) => {
    const key = r.v || "unknown";
    return { key, name: key === "unknown" ? "未知" : key, count: n(r.cnt) };
  });

  const byLanguage: NamedCount[] = authByLanguage.map((r) => {
    const key = (r.v || "unknown").toLowerCase();
    return { key, name: langLabel(key), count: n(r.cnt) };
  });

  const tzMerged = new Map<string, number>();
  for (const r of authByTimezone) {
    const raw = r.v || "unknown";
    const key =
      raw === "unknown" ? "unknown" : normalizeTimezone(raw) || raw;
    tzMerged.set(key, (tzMerged.get(key) || 0) + n(r.cnt));
  }
  const byTimezone: NamedCount[] = [...tzMerged.entries()]
    .map(([key, count]) => ({
      key,
      name: key === "unknown" ? "未知" : key,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const regMap = new Map(dailyRegs.map((r) => [String(r.day), n(r.cnt)]));
  const paidMap = new Map(
    dailyPaid.map((r) => [
      String(r.day),
      { count: n(r.cnt), amount_cents: n(r.amount) },
    ]),
  );
  const loginMap = new Map(dailyLogins.map((r) => [String(r.day), n(r.cnt)]));

  const daily = days.map((day) => ({
    day,
    registrations: regMap.get(day) || 0,
    paid_orders: paidMap.get(day)?.count || 0,
    gmv_cents: paidMap.get(day)?.amount_cents || 0,
    login_users: loginMap.get(day) || 0,
  }));

  const gmvCents = paidAgg._sum.amountCents || 0;
  const paidOrders = paidAgg._count._all;
  const payingUserCount = payingUsers.length;
  const newPaidUserCount = newUsersWhoPaid.length;

  return {
    project_id: projectId,
    range: { from: fromDay, to: toDay, timezone: "Asia/Shanghai" },
    summary: {
      users_total: usersTotal,
      registrations: regsInRange,
      registrations_invited: regsInvited,
      registrations_organic: regsInRange - regsInvited,
      registrations_anonymous: regsAnonymous,
      orders_created: ordersCreated,
      paid_orders: paidOrders,
      gmv_cents: gmvCents,
      refunded_orders: refundAgg._count._all,
      refunded_cents: refundAgg._sum.amountCents || 0,
      paying_users: payingUserCount,
      first_paid_orders: firstPaidUsers,
      new_user_paid: newPaidUserCount,
      new_user_pay_rate_bps:
        regsInRange > 0
          ? Math.round((newPaidUserCount / regsInRange) * 10_000)
          : 0,
      arpu_cents:
        payingUserCount > 0 ? Math.round(gmvCents / payingUserCount) : 0,
      avg_order_cents:
        paidOrders > 0 ? Math.round(gmvCents / paidOrders) : 0,
    },
    registrations_by_client: regsByClientOut,
    registrations_by_package: regsByPackageOut,
    downloads_by_package: downloadsByPackageOut,
    downloads_by_version: downloadsByVersionOut,
    orders_by_status: byOrderStatus,
    revenue_by_provider: byProvider,
    revenue_by_plan: byPlan,
    revenue_by_kind: byKind,
    login_by_client: loginByClient,
    users_by_locale: byLocale,
    users_by_language: byLanguage,
    users_by_timezone: byTimezone,
    daily,
  };
}
