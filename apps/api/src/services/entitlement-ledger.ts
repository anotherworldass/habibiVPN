import type { EntitlementLedger, EntitlementReason, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type EntitlementLedgerContext = {
  reason: EntitlementReason;
  refType?: string;
  refId?: string;
  actorType?: string;
  actorId?: string;
  remark?: string;
  idempotencyKey?: string;
};

export type EntitlementSnapshot = {
  planId: string | null;
  expiresAt: Date | null;
  dataLimitBytes: bigint | null;
  status: string;
};

export type EntitlementChangeFlags = {
  created?: boolean;
  renew?: boolean;
  plan_change?: boolean;
  traffic_adjust?: boolean;
  expire_adjust?: boolean;
  status_change?: boolean;
  clawback?: boolean;
};

function bigEq(
  a: bigint | null | undefined,
  b: bigint | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

function msOf(d: Date | null | undefined): number | null {
  return d ? d.getTime() : null;
}

function buildChangeFlags(
  before: EntitlementSnapshot | null,
  after: EntitlementSnapshot,
  reason: EntitlementReason,
): EntitlementChangeFlags {
  const flags: EntitlementChangeFlags = {};
  if (!before) {
    flags.created = true;
    if (after.expiresAt) flags.expire_adjust = true;
    if (after.dataLimitBytes != null) flags.traffic_adjust = true;
    if (after.planId) flags.plan_change = true;
  } else {
    if (before.planId !== after.planId) flags.plan_change = true;
    if (msOf(before.expiresAt) !== msOf(after.expiresAt)) {
      flags.expire_adjust = true;
    }
    if (!bigEq(before.dataLimitBytes, after.dataLimitBytes)) {
      flags.traffic_adjust = true;
    }
    if (before.status !== after.status) flags.status_change = true;
    if (
      flags.expire_adjust &&
      !flags.plan_change &&
      before.planId === after.planId &&
      (msOf(after.expiresAt) ?? 0) > (msOf(before.expiresAt) ?? 0)
    ) {
      flags.renew = true;
    }
  }
  if (reason === "refund_clawback") flags.clawback = true;
  return flags;
}

function expireDeltaSeconds(
  before: EntitlementSnapshot | null,
  after: EntitlementSnapshot,
): number | null {
  const afterMs = msOf(after.expiresAt);
  const beforeMs = msOf(before?.expiresAt);
  if (afterMs == null || beforeMs == null) return null;
  return Math.floor((afterMs - beforeMs) / 1000);
}

function dataLimitDelta(
  before: EntitlementSnapshot | null,
  after: EntitlementSnapshot,
): bigint | null {
  if (after.dataLimitBytes == null) {
    if (before?.dataLimitBytes != null) return -before.dataLimitBytes;
    return null;
  }
  if (before?.dataLimitBytes == null) return after.dataLimitBytes;
  return after.dataLimitBytes - before.dataLimitBytes;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Append an entitlement ledger row when slot rights actually change. */
export async function recordEntitlementLedger(input: {
  projectId: string;
  userId: string;
  slotId: string;
  before: EntitlementSnapshot | null;
  after: EntitlementSnapshot;
  ledger: EntitlementLedgerContext;
}): Promise<EntitlementLedger | null> {
  const { ledger } = input;
  if (ledger.idempotencyKey) {
    const existing = await prisma.entitlementLedger.findUnique({
      where: { idempotencyKey: ledger.idempotencyKey },
    });
    if (existing) return existing;
  }

  const changeFlags = buildChangeFlags(input.before, input.after, ledger.reason);
  if (Object.keys(changeFlags).length === 0) return null;

  const data: Prisma.EntitlementLedgerCreateInput = {
    project: { connect: { id: input.projectId } },
    user: { connect: { id: input.userId } },
    slotId: input.slotId,
    reason: ledger.reason,
    changeFlags: changeFlags as Prisma.InputJsonValue,
    planIdBefore: input.before?.planId ?? null,
    planIdAfter: input.after.planId,
    expiresAtBefore: input.before?.expiresAt ?? null,
    expiresAtAfter: input.after.expiresAt,
    expireDeltaSeconds: expireDeltaSeconds(input.before, input.after),
    dataLimitBefore: input.before?.dataLimitBytes ?? null,
    dataLimitAfter: input.after.dataLimitBytes,
    dataLimitDelta: dataLimitDelta(input.before, input.after),
    statusBefore: input.before?.status ?? null,
    statusAfter: input.after.status,
    refType: ledger.refType ?? null,
    refId: ledger.refId ?? null,
    actorType: ledger.actorType ?? null,
    actorId: ledger.actorId ?? null,
    remark: ledger.remark ?? null,
    idempotencyKey: ledger.idempotencyKey ?? null,
  };

  try {
    return await prisma.entitlementLedger.create({ data });
  } catch (err) {
    if (ledger.idempotencyKey && isUniqueViolation(err)) {
      return prisma.entitlementLedger.findUnique({
        where: { idempotencyKey: ledger.idempotencyKey },
      });
    }
    throw err;
  }
}

export function snapshotFromSlot(slot: {
  planId: string | null;
  expiresAt: Date | null;
  dataLimitBytes: bigint | null;
  status: string;
}): EntitlementSnapshot {
  return {
    planId: slot.planId,
    expiresAt: slot.expiresAt,
    dataLimitBytes: slot.dataLimitBytes,
    status: slot.status,
  };
}

const REASON_LABEL: Record<EntitlementReason, string> = {
  order_paid: "订单开通",
  iap: "应用内购买",
  redeem: "兑换码",
  campaign: "活动奖励",
  free_claim: "免费领取",
  admin_provision: "后台开通",
  refund_clawback: "退款扣回",
};

function bigToString(v: bigint | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

type LedgerWithUser = EntitlementLedger & {
  user?: { id: string; uid: number; email: string | null };
  planAfter?: { id: string; code: string; name: string } | null;
  planBefore?: { id: string; code: string; name: string } | null;
};

/** Full admin view (includes actor / remark / refs). */
export function toAdminEntitlementLedgerView(
  row: LedgerWithUser,
  plans?: Map<string, { id: string; code: string; name: string }>,
) {
  const planAfter =
    row.planAfter ||
    (row.planIdAfter && plans ? plans.get(row.planIdAfter) : null) ||
    null;
  const planBefore =
    row.planBefore ||
    (row.planIdBefore && plans ? plans.get(row.planIdBefore) : null) ||
    null;
  return {
    id: row.id,
    project_id: row.projectId,
    user_id: row.userId,
    slot_id: row.slotId,
    reason: row.reason,
    reason_label: REASON_LABEL[row.reason] || row.reason,
    change_flags: row.changeFlags,
    plan_id_before: row.planIdBefore,
    plan_id_after: row.planIdAfter,
    plan_before: planBefore,
    plan_after: planAfter,
    expires_at_before: row.expiresAtBefore?.toISOString() ?? null,
    expires_at_after: row.expiresAtAfter?.toISOString() ?? null,
    expire_delta_seconds: row.expireDeltaSeconds,
    data_limit_before: bigToString(row.dataLimitBefore),
    data_limit_after: bigToString(row.dataLimitAfter),
    data_limit_delta: bigToString(row.dataLimitDelta),
    status_before: row.statusBefore,
    status_after: row.statusAfter,
    ref_type: row.refType,
    ref_id: row.refId,
    actor_type: row.actorType,
    actor_id: row.actorId,
    remark: row.remark,
    idempotency_key: row.idempotencyKey,
    created_at: row.createdAt.toISOString(),
    user: row.user
      ? { id: row.user.id, uid: row.user.uid, email: row.user.email }
      : undefined,
  };
}

/**
 * Future user-facing DTO — redact actor / internal remark / idempotency.
 * Not exposed by API in phase 1.
 */
export function toPublicEntitlementLedgerView(row: EntitlementLedger) {
  return {
    id: row.id,
    slot_id: row.slotId,
    reason: row.reason,
    reason_label: REASON_LABEL[row.reason] || row.reason,
    change_flags: row.changeFlags,
    plan_id_before: row.planIdBefore,
    plan_id_after: row.planIdAfter,
    expires_at_before: row.expiresAtBefore?.toISOString() ?? null,
    expires_at_after: row.expiresAtAfter?.toISOString() ?? null,
    expire_delta_seconds: row.expireDeltaSeconds,
    data_limit_before: bigToString(row.dataLimitBefore),
    data_limit_after: bigToString(row.dataLimitAfter),
    data_limit_delta: bigToString(row.dataLimitDelta),
    status_before: row.statusBefore,
    status_after: row.statusAfter,
    ref_type: row.refType === "order" ? "order" : null,
    ref_id: row.refType === "order" ? row.refId : null,
    created_at: row.createdAt.toISOString(),
  };
}

export { REASON_LABEL };
