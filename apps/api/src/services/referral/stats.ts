import { prisma } from "../../lib/prisma.js";
import { buildTelegramInviteUrl } from "../telegram/bot-config.js";
import { ensureUserPromoReady } from "./bind.js";
import { getReferralConfig } from "./config.js";

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const n = name || "";
  const head = n.slice(0, 2);
  return `${head}***@${domain}`;
}

export async function getPromoOverview(userId: string) {
  await ensureUserPromoReady(userId);
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { projectId: true },
  });
  const config = await getReferralConfig(userRow.projectId);
  const wallet = await prisma.promoWallet.findUniqueOrThrow({ where: { userId } });

  const todayStart = startOfDay();
  const yesterdayStart = new Date(todayStart.getTime() - 86400_000);

  const [todayAgg, yesterdayAgg, totalAgg, levelCounts] = await Promise.all([
    prisma.commissionLedger.aggregate({
      where: {
        beneficiaryId: userId,
        status: { in: ["pending", "settled"] },
        createdAt: { gte: todayStart },
      },
      _sum: { amountCents: true },
    }),
    prisma.commissionLedger.aggregate({
      where: {
        beneficiaryId: userId,
        status: { in: ["pending", "settled"] },
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      _sum: { amountCents: true },
    }),
    prisma.commissionLedger.aggregate({
      where: {
        beneficiaryId: userId,
        status: { in: ["pending", "settled"] },
      },
      _sum: { amountCents: true },
    }),
    prisma.inviteClosure.groupBy({
      by: ["depth"],
      where: { ancestorId: userId, depth: { lte: config.maxLevel } },
      _count: { _all: true },
    }),
  ]);

  const byLevel: Record<number, number> = {};
  for (let i = 1; i <= config.maxLevel; i++) byLevel[i] = 0;
  for (const g of levelCounts) {
    byLevel[g.depth] = g._count._all;
  }
  const teamTotal = Object.values(byLevel).reduce((a, b) => a + b, 0);

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [newUsers, newPayers] = await Promise.all([
    prisma.inviteClosure.count({
      where: {
        ancestorId: userId,
        depth: { lte: config.maxLevel },
        descendant: { createdAt: { gte: weekAgo } },
      },
    }),
    prisma.commissionLedger.findMany({
      where: {
        beneficiaryId: userId,
        status: { in: ["pending", "settled"] },
        createdAt: { gte: weekAgo },
      },
      select: { payerId: true },
      distinct: ["payerId"],
    }),
  ]);

  const descendantIds = (
    await prisma.inviteClosure.findMany({
      where: { ancestorId: userId, depth: { lte: config.maxLevel } },
      select: { descendantId: true },
    })
  ).map((r) => r.descendantId);

  const paidOrderWhere = {
    userId: { in: descendantIds },
    status: { in: ["paid" as const, "provisioned" as const] },
    amountCents: { gt: 0 },
  };

  const todayPayStart = todayStart;
  const [todayTeamRecharge, teamTotalRecharge, myPromoAmount, paidUsers] = await Promise.all([
    descendantIds.length
      ? prisma.order.aggregate({
          where: {
            ...paidOrderWhere,
            paidAt: { gte: todayPayStart },
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve({ _sum: { amountCents: 0 } }),
    descendantIds.length
      ? prisma.order.aggregate({
          where: paidOrderWhere,
          _sum: { amountCents: true },
        })
      : Promise.resolve({ _sum: { amountCents: 0 } }),
    prisma.commissionLedger.aggregate({
      where: {
        beneficiaryId: userId,
        status: { in: ["pending", "settled"] },
      },
      _sum: { orderAmountCents: true },
    }),
    descendantIds.length
      ? prisma.order.findMany({
          where: paidOrderWhere,
          select: { userId: true },
          distinct: ["userId"],
        })
      : Promise.resolve([] as Array<{ userId: string }>),
  ]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      inviteCode: true,
      promoEnabled: true,
      promoGroup: { select: { id: true, code: true, name: true } },
      inviter: { select: { id: true, uid: true, email: true, inviteCode: true } },
    },
  });

  return {
    invite_code: user.inviteCode,
    promo_enabled: user.promoEnabled,
    promo_group: user.promoGroup
      ? { id: user.promoGroup.id, code: user.promoGroup.code, name: user.promoGroup.name }
      : null,
    inviter: user.inviter
      ? {
          uid: user.inviter.uid,
          email_masked: maskEmail(user.inviter.email),
          invite_code: user.inviter.inviteCode,
        }
      : null,
    today_earnings_cents: todayAgg._sum.amountCents || 0,
    yesterday_earnings_cents: yesterdayAgg._sum.amountCents || 0,
    total_earnings_cents: totalAgg._sum.amountCents || 0,
    available_cents: wallet.availableCents,
    pending_cents: wallet.pendingCents,
    withdrawn_cents: wallet.withdrawnCents,
    frozen_cents: wallet.frozenCents,
    spent_cents: wallet.spentCents,
    levels: byLevel,
    team_total: teamTotal,
    /** Lifetime distinct paid descendants (amount > 0) */
    paid_users: paidUsers.length,
    new_users_7d: newUsers,
    new_payers_7d: newPayers.length,
    today_team_recharge_cents: todayTeamRecharge._sum.amountCents || 0,
    team_total_recharge_cents: teamTotalRecharge._sum.amountCents || 0,
    my_promo_order_amount_cents: myPromoAmount._sum.orderAmountCents || 0,
    my_total_commission_cents: totalAgg._sum.amountCents || 0,
    min_withdraw_cents: config.minWithdrawCents,
    withdraw_fee_bps: config.withdrawFeeBps,
    withdraw_methods: config.withdrawMethods,
    catalog_spend_enabled: config.catalogSpendEnabled,
    max_level: config.maxLevel,
  };
}

export async function getPromoTools(
  userId: string,
  webOrigin: string,
  opts?: { preferTelegram?: boolean },
) {
  const user = await ensureUserPromoReady(userId);
  const webInviteUrl = `${webOrigin.replace(/\/$/, "")}/invite/${encodeURIComponent(user.inviteCode)}`;

  const bot = user.projectId
    ? await prisma.projectTelegramBot.findUnique({
        where: { projectId: user.projectId },
        select: { miniAppDirectLink: true, botUsername: true },
      })
    : null;

  const tgInviteUrl = buildTelegramInviteUrl(
    bot?.miniAppDirectLink,
    bot?.botUsername,
    user.inviteCode,
  );

  const inviteUrl =
    opts?.preferTelegram && tgInviteUrl ? tgInviteUrl : webInviteUrl;

  return {
    invite_code: user.inviteCode,
    invite_url: inviteUrl,
    web_invite_url: webInviteUrl,
    tg_invite_url: tgInviteUrl,
  };
}

/** User-facing commission / withdraw rules for invite & promo UI. */
export async function getPromoRules(userId: string) {
  await ensureUserPromoReady(userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      projectId: true,
      promoGroupId: true,
      promoGroup: {
        select: {
          id: true,
          code: true,
          name: true,
          enabled: true,
          maxLevel: true,
          levels: { select: { level: true, rateBps: true }, orderBy: { level: "asc" } },
        },
      },
    },
  });
  const config = await getReferralConfig(user.projectId);

  let levels = user.promoGroup?.levels.map((l) => ({
    level: l.level,
    rate_bps: l.rateBps,
  }));
  if (!levels?.length) {
    levels = config.levels
      .filter((l) => l.level <= config.maxLevel)
      .map((l) => ({ level: l.level, rate_bps: l.rateBps }));
  } else {
    const maxLv = user.promoGroup?.maxLevel ?? config.maxLevel;
    levels = levels.filter((l) => l.level <= maxLv);
  }

  return {
    enabled: config.enabled,
    max_level: user.promoGroup?.maxLevel ?? config.maxLevel,
    levels,
    settle_days: config.settleDays,
    min_withdraw_cents: config.minWithdrawCents,
    withdraw_fee_bps: config.withdrawFeeBps,
    withdraw_methods: config.withdrawMethods,
    catalog_spend_enabled: config.catalogSpendEnabled,
    iap_commission_base_bps: config.iapCommissionBaseBps,
    play_commission_base_bps: config.playCommissionBaseBps,
    first_commission_base_bps: config.firstCommissionBaseBps,
    renew_commission_base_bps: config.renewCommissionBaseBps,
    promo_group: user.promoGroup
      ? {
          id: user.promoGroup.id,
          code: user.promoGroup.code,
          name: user.promoGroup.name,
        }
      : null,
  };
}

export async function listTeamInvites(
  userId: string,
  opts: { level?: number; limit?: number; offset?: number } = {},
) {
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { projectId: true },
  });
  const config = await getReferralConfig(userRow.projectId);
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const where =
    opts.level != null
      ? { ancestorId: userId, depth: opts.level }
      : { ancestorId: userId, depth: { lte: config.maxLevel } };

  const [total, rows] = await Promise.all([
    prisma.inviteClosure.count({ where }),
    prisma.inviteClosure.findMany({
      where,
      include: {
        descendant: { select: { id: true, uid: true, email: true, createdAt: true, status: true } },
      },
      orderBy: { depth: "asc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const pageIds = rows.map((r) => r.descendant.id);
  const paidCounts =
    pageIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ["userId"],
          where: {
            userId: { in: pageIds },
            status: { in: ["paid", "provisioned"] },
            amountCents: { gt: 0 },
          },
          _count: { _all: true },
        });
  const paidCountByUser = new Map(paidCounts.map((r) => [r.userId, r._count._all]));

  return {
    total,
    items: rows.map((r) => {
      const paidCount = paidCountByUser.get(r.descendant.id) || 0;
      return {
        user_id: r.descendant.id,
        uid: r.descendant.uid,
        email_masked: maskEmail(r.descendant.email),
        level: r.depth,
        status: r.descendant.status,
        created_at: r.descendant.createdAt,
        has_paid: paidCount > 0,
        paid_count: paidCount,
      };
    }),
  };
}

export async function listCommissions(
  userId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const where = {
    beneficiaryId: userId,
    ...(opts.status ? { status: opts.status as "pending" | "settled" | "invalid" } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.commissionLedger.count({ where }),
    prisma.commissionLedger.findMany({
      where,
      include: {
        payer: { select: { email: true } },
        order: { select: { id: true, amountCents: true, currency: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      level: r.level,
      amount_cents: r.amountCents,
      order_amount_cents: r.orderAmountCents,
      rate_bps: r.rateBps,
      status: r.status,
      settle_at: r.settleAt,
      settled_at: r.settledAt,
      created_at: r.createdAt,
      payer_email_masked: maskEmail(r.payer.email),
      order_id: r.orderId,
    })),
  };
}

export async function listTeamOrders(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { projectId: true },
  });
  const config = await getReferralConfig(userRow.projectId);
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;

  const descendantIds = (
    await prisma.inviteClosure.findMany({
      where: { ancestorId: userId, depth: { lte: config.maxLevel } },
      select: { descendantId: true, depth: true },
    })
  );
  const depthMap = new Map(descendantIds.map((d) => [d.descendantId, d.depth]));
  const ids = descendantIds.map((d) => d.descendantId);
  if (!ids.length) return { total: 0, items: [] };

  const where = {
    userId: { in: ids },
    status: { in: ["paid" as const, "provisioned" as const] },
    amountCents: { gt: 0 },
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        user: { select: { email: true } },
        plan: { select: { name: true, code: true } },
      },
      orderBy: { paidAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    items: orders.map((o) => ({
      order_id: o.id,
      amount_cents: o.amountCents,
      currency: o.currency,
      paid_at: o.paidAt,
      plan_name: o.plan.name,
      payer_email_masked: maskEmail(o.user.email),
      level: depthMap.get(o.userId) || null,
    })),
  };
}

export async function getUplineChain(userId: string) {
  const edges = await prisma.inviteClosure.findMany({
    where: { descendantId: userId },
    include: {
      ancestor: { select: { id: true, email: true, inviteCode: true, status: true } },
    },
    orderBy: { depth: "asc" },
  });
  return edges.map((e) => ({
    level: e.depth,
    user_id: e.ancestor.id,
    email: e.ancestor.email,
    invite_code: e.ancestor.inviteCode,
    status: e.ancestor.status,
  }));
}
