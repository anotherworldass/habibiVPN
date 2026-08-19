import { Prisma } from "@prisma/client";
import { writeAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

export const FUP_GIB = 1024 ** 3;
export const FUP_AUDIT_ACTION = "subscription.fup_bandwidth_change";
const MULTI_MONTH_SECONDS = 40 * 86400;

export type FupTier = {
  afterBytes: number;
  bandwidthPlanRef: string;
};

export type FupView = {
  enabled: boolean;
  throttled: boolean;
  current_after_bytes: number | null;
  current_bandwidth_plan_ref: string | null;
  next_tier_after_bytes: number | null;
  used_traffic_bytes: number | null;
  next_reset_at: string | null;
  tiers: Array<{ after_bytes: number; bandwidth_plan_ref: string }>;
};

export type FupHistoryItem = {
  id: string;
  created_at: string;
  from_ref: string | null;
  to_ref: string | null;
  used_traffic_bytes: number | null;
  after_bytes: number | null;
  reason: string | null;
  actor_type: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function parseFupTiers(raw: unknown): FupTier[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: FupTier[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) continue;
    const ref = String(o.bandwidthPlanRef ?? o.bandwidth_plan_ref ?? "").trim();
    const after =
      typeof o.afterBytes === "number"
        ? o.afterBytes
        : typeof o.after_bytes === "number"
          ? o.after_bytes
          : Number(o.afterBytes ?? o.after_bytes);
    if (!ref || !Number.isFinite(after) || after < 0) continue;
    out.push({ afterBytes: Math.round(after), bandwidthPlanRef: ref });
  }
  out.sort((a, b) => a.afterBytes - b.afterBytes);
  return out;
}

export function fupTiersEnabled(raw: unknown): boolean {
  return parseFupTiers(raw).length >= 2;
}

/** Last tier whose afterBytes <= used. */
export function pickFupTier(
  usedBytes: number,
  tiers: FupTier[],
): FupTier | null {
  if (!tiers.length) return null;
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  let chosen = tiers[0]!;
  for (const t of tiers) {
    if (t.afterBytes <= used) chosen = t;
    else break;
  }
  return chosen;
}

export function desiredBandwidthPlanRef(
  usedBytes: number,
  tiers: FupTier[],
): string | null {
  return pickFupTier(usedBytes, tiers)?.bandwidthPlanRef ?? null;
}

export function fullSpeedBandwidthPlanRef(raw: unknown): string | null {
  const tiers = parseFupTiers(raw);
  const zero = tiers.find((t) => t.afterBytes === 0) ?? tiers[0];
  return zero?.bandwidthPlanRef ?? null;
}

export function buildFupView(input: {
  fupTiers: unknown;
  usedBytes: number | null;
  currentRef: string | null;
  nextResetAt: string | null;
}): FupView | null {
  const tiers = parseFupTiers(input.fupTiers);
  if (tiers.length < 2) return null;
  const used = input.usedBytes ?? 0;
  const desired = pickFupTier(used, tiers);
  const idx = desired
    ? tiers.findIndex(
        (t) =>
          t.afterBytes === desired.afterBytes &&
          t.bandwidthPlanRef === desired.bandwidthPlanRef,
      )
    : -1;
  const next = idx >= 0 ? tiers[idx + 1] : null;
  const currentAfter = desired?.afterBytes ?? 0;
  return {
    enabled: true,
    throttled: currentAfter > 0,
    current_after_bytes: currentAfter,
    current_bandwidth_plan_ref:
      input.currentRef || desired?.bandwidthPlanRef || null,
    next_tier_after_bytes: next?.afterBytes ?? null,
    used_traffic_bytes: input.usedBytes,
    next_reset_at: input.nextResetAt,
    tiers: tiers.map((t) => ({
      after_bytes: t.afterBytes,
      bandwidth_plan_ref: t.bandwidthPlanRef,
    })),
  };
}

export function gbToBytes(gb: number): number {
  return Math.round(gb * FUP_GIB);
}

export function normalizeFupTiersInput(raw: unknown): FupTier[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("plan.fup_tiers_invalid"), { statusCode: 400 });
  }
  if (raw.length === 0) return null;

  const tiers: FupTier[] = [];
  for (const item of raw) {
    const o = asRecord(item);
    if (!o) {
      throw Object.assign(new Error("plan.fup_tiers_invalid"), { statusCode: 400 });
    }
    const ref = String(o.bandwidthPlanRef ?? o.bandwidth_plan_ref ?? "").trim();
    if (!ref || ref.length > 128) {
      throw Object.assign(new Error("plan.fup_tier_ref_invalid"), {
        statusCode: 400,
      });
    }
    let after: number;
    if (o.afterGb != null && o.afterGb !== "") {
      const gb = Number(o.afterGb);
      if (!Number.isFinite(gb) || gb < 0) {
        throw Object.assign(new Error("plan.fup_tier_gb_invalid"), {
          statusCode: 400,
        });
      }
      after = gbToBytes(gb);
    } else {
      const n = Number(o.afterBytes ?? o.after_bytes);
      if (!Number.isFinite(n) || n < 0) {
        throw Object.assign(new Error("plan.fup_tier_bytes_invalid"), {
          statusCode: 400,
        });
      }
      after = Math.round(n);
    }
    tiers.push({ afterBytes: after, bandwidthPlanRef: ref });
  }

  tiers.sort((a, b) => a.afterBytes - b.afterBytes);
  if (tiers.length < 2) {
    throw Object.assign(new Error("plan.fup_tiers_min_two"), { statusCode: 400 });
  }
  if (tiers[0]!.afterBytes !== 0) {
    throw Object.assign(new Error("plan.fup_tiers_need_zero"), {
      statusCode: 400,
    });
  }
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.afterBytes <= tiers[i - 1]!.afterBytes) {
      throw Object.assign(new Error("plan.fup_tiers_not_increasing"), {
        statusCode: 400,
      });
    }
  }
  return tiers;
}

export function planSpansMultipleMonths(input: {
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
}): boolean {
  if (
    input.validityCalendarMonths != null &&
    input.validityCalendarMonths > 1
  ) {
    return true;
  }
  if (
    input.validitySeconds != null &&
    input.validitySeconds > MULTI_MONTH_SECONDS
  ) {
    return true;
  }
  return false;
}

export function assertFupResetPolicy(input: {
  tiers: FupTier[] | null;
  resetPolicy: string;
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
}) {
  if (!input.tiers || input.tiers.length < 2) return;
  if (input.resetPolicy !== "no_reset") return;
  if (planSpansMultipleMonths(input)) {
    throw Object.assign(new Error("plan.fup_requires_traffic_reset"), {
      statusCode: 400,
    });
  }
}

export async function recordFupBandwidthChange(input: {
  slotId: string;
  fromRef: string | null;
  toRef: string;
  usedTrafficBytes: number | null;
  afterBytes: number;
  reason: "poller" | "provision";
  actorType?: string;
  actorId?: string | null;
}) {
  if ((input.fromRef || null) === input.toRef) return;
  await writeAudit({
    actorType: input.actorType || "system",
    actorId: input.actorId ?? null,
    action: FUP_AUDIT_ACTION,
    targetType: "user_upstream",
    targetId: input.slotId,
    meta: {
      from_ref: input.fromRef,
      to_ref: input.toRef,
      used_traffic_bytes: input.usedTrafficBytes,
      after_bytes: input.afterBytes,
      reason: input.reason,
    },
  });
}

function metaString(meta: unknown, key: string): string | null {
  const o = asRecord(meta);
  if (!o) return null;
  const v = o[key];
  if (v == null) return null;
  return String(v);
}

function metaNumber(meta: unknown, key: string): number | null {
  const o = asRecord(meta);
  if (!o) return null;
  const n = Number(o[key]);
  return Number.isFinite(n) ? n : null;
}

export async function listFupHistoryBySlotIds(
  slotIds: string[],
  limitPerSlot = 20,
): Promise<Map<string, FupHistoryItem[]>> {
  const map = new Map<string, FupHistoryItem[]>();
  if (!slotIds.length) return map;
  const rows = await prisma.auditLog.findMany({
    where: {
      action: FUP_AUDIT_ACTION,
      targetType: "user_upstream",
      targetId: { in: slotIds },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(500, slotIds.length * limitPerSlot),
  });
  for (const row of rows) {
    const id = row.targetId;
    if (!id) continue;
    const list = map.get(id) || [];
    if (list.length >= limitPerSlot) continue;
    list.push({
      id: row.id,
      created_at: row.createdAt.toISOString(),
      from_ref: metaString(row.meta, "from_ref"),
      to_ref: metaString(row.meta, "to_ref"),
      used_traffic_bytes: metaNumber(row.meta, "used_traffic_bytes"),
      after_bytes: metaNumber(row.meta, "after_bytes"),
      reason: metaString(row.meta, "reason"),
      actor_type: row.actorType,
    });
    map.set(id, list);
  }
  return map;
}

export function fupTiersToJson(
  tiers: FupTier[] | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!tiers || !tiers.length) return Prisma.JsonNull;
  return tiers as unknown as Prisma.InputJsonValue;
}
