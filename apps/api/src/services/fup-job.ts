import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { wireraw } from "../wireraw/client.js";
import type { WireRawCustomerView } from "../wireraw/types.js";
import {
  desiredBandwidthPlanRef,
  parseFupTiers,
  pickFupTier,
  recordFupBandwidthChange,
} from "./fup.js";

const BATCH = 50;
const INTERVAL_MS = 90_000;

let timer: ReturnType<typeof setInterval> | null = null;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function unwrapCustomers(raw: unknown): WireRawCustomerView[] {
  if (Array.isArray(raw)) return raw as WireRawCustomerView[];
  const o = asRecord(raw);
  if (!o) return [];
  const list = o.customers ?? o.items ?? o.data;
  return Array.isArray(list) ? (list as WireRawCustomerView[]) : [];
}

function usedBytes(view: WireRawCustomerView): number {
  const n = Number(view.end_user?.used_traffic_bytes ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function currentBwRef(view: WireRawCustomerView): string | null {
  const ref = view.end_user?.current_bandwidth_plan_ref;
  return ref && String(ref).trim() ? String(ref).trim() : null;
}

function customerId(view: WireRawCustomerView): string | null {
  const id = view.end_user?.id;
  return id && String(id).trim() ? String(id) : null;
}

function customerUsername(view: WireRawCustomerView): string | null {
  const u = view.end_user?.username;
  return u && String(u).trim() ? String(u) : null;
}

async function applyBandwidthRef(input: {
  slotId: string;
  upstreamId: string | null;
  username: string;
  fromRef: string | null;
  toRef: string;
  afterBytes: number;
  used: number;
}) {
  await wireraw.upsertCustomer({
    ...(input.upstreamId ? { id: input.upstreamId } : {}),
    username: input.username,
    current_bandwidth_plan_ref: input.toRef,
  });
  await recordFupBandwidthChange({
    slotId: input.slotId,
    fromRef: input.fromRef,
    toRef: input.toRef,
    usedTrafficBytes: input.used,
    afterBytes: input.afterBytes,
    reason: "poller",
  });
}

export async function reconcileFupBandwidth(limit = 400): Promise<number> {
  const now = new Date();
  const slots = await prisma.userUpstream.findMany({
    where: {
      status: "active",
      planId: { not: null },
      plan: { fupTiers: { not: Prisma.DbNull } },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { plan: true },
    take: limit,
    orderBy: { lastSyncedAt: "asc" },
  });

  const eligible = slots.filter(
    (s) => parseFupTiers(s.plan?.fupTiers).length >= 2,
  );
  if (!eligible.length) return 0;

  let changed = 0;
  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH);
    const usernames = chunk.map((s) => s.upstreamUsername);
    let customers: WireRawCustomerView[] = [];
    try {
      customers = unwrapCustomers(await wireraw.batchLookup({ usernames }));
    } catch (err) {
      console.error("[fup] batch-lookup failed", err);
      continue;
    }
    const byName = new Map<string, WireRawCustomerView>();
    const byId = new Map<string, WireRawCustomerView>();
    for (const c of customers) {
      const name = customerUsername(c);
      const id = customerId(c);
      if (name) byName.set(name.toLowerCase(), c);
      if (id) byId.set(id, c);
    }

    for (const slot of chunk) {
      const live =
        (slot.upstreamId ? byId.get(slot.upstreamId) : undefined) ||
        byName.get(slot.upstreamUsername.toLowerCase());
      if (!live) continue;
      const tiers = parseFupTiers(slot.plan?.fupTiers);
      const used = usedBytes(live);
      const desired = desiredBandwidthPlanRef(used, tiers);
      if (!desired) continue;
      const current = currentBwRef(live);
      if (current === desired) {
        await prisma.userUpstream.update({
          where: { id: slot.id },
          data: {
            usedTrafficBytes: BigInt(Math.round(used)),
            lastSyncedAt: new Date(),
          },
        });
        continue;
      }
      const tier = pickFupTier(used, tiers);
      try {
        await applyBandwidthRef({
          slotId: slot.id,
          upstreamId: customerId(live) || slot.upstreamId,
          username: slot.upstreamUsername,
          fromRef: current,
          toRef: desired,
          afterBytes: tier?.afterBytes ?? 0,
          used,
        });
        changed += 1;
        await prisma.userUpstream.update({
          where: { id: slot.id },
          data: {
            usedTrafficBytes: BigInt(Math.round(used)),
            lastSyncedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("[fup] switch failed", slot.id, err);
      }
    }
  }
  return changed;
}

export function startFupBandwidthJob(log?: {
  info: (o: unknown, msg?: string) => void;
}) {
  if (timer) return;
  const tick = async () => {
    try {
      const n = await reconcileFupBandwidth();
      if (n > 0) log?.info({ switched: n }, "fup bandwidth plans switched");
    } catch (err) {
      console.error("[fup] job error", err);
    }
  };
  void tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
}

export function stopFupBandwidthJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
