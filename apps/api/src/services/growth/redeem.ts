import type { ClientChannel, RedeemBatch, RedeemCode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { createUpstreamSlot, grantVpnDuration } from "../provision.js";
import { CLIENT_CHANNELS } from "../catalog.js";

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRedeemCodeValue(): string {
  const part = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  };
  return `HB-${part(4)}-${part(4)}`;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function batchWindowOk(batch: RedeemBatch, now = new Date()): boolean {
  if (batch.startAt && batch.startAt.getTime() > now.getTime()) return false;
  if (batch.endAt && batch.endAt.getTime() < now.getTime()) return false;
  return true;
}

export type RedeemBatchWithRelations = RedeemBatch & {
  clients: Array<{ client: ClientChannel; enabled: boolean }>;
  plan: {
    id: string;
    code: string;
    name: string;
    enabled: boolean;
    projectId: string;
    validitySeconds: number | null;
    priceCents: number;
    currency: string;
  } | null;
  _count?: { codes: number };
};

export function serializeRedeemBatch(b: RedeemBatchWithRelations) {
  return {
    id: b.id,
    project_id: b.projectId,
    name: b.name,
    plan_id: b.planId,
    plan: b.plan
      ? {
          id: b.plan.id,
          code: b.plan.code,
          name: b.plan.name,
          validity_seconds: b.plan.validitySeconds,
          price_cents: b.plan.priceCents,
          currency: b.plan.currency,
        }
      : null,
    kind: b.kind,
    validity_seconds: b.validitySeconds,
    data_limit_bytes:
      b.dataLimitBytes == null ? null : Number(b.dataLimitBytes),
    stack_mode: b.stackMode,
    start_at: b.startAt?.toISOString() || null,
    end_at: b.endAt?.toISOString() || null,
    max_redemptions_per_user: b.maxRedemptionsPerUser,
    enabled: b.enabled,
    remark: b.remark,
    clients: b.clients.map((c) => ({
      client: c.client,
      enabled: c.enabled,
    })),
    codes_count: b._count?.codes ?? undefined,
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
  };
}

const batchInclude = {
  clients: true,
  plan: {
    select: {
      id: true,
      code: true,
      name: true,
      enabled: true,
      projectId: true,
      validitySeconds: true,
      priceCents: true,
      currency: true,
    },
  },
  _count: { select: { codes: true } },
} as const;

export async function listRedeemBatches(projectId: string) {
  return prisma.redeemBatch.findMany({
    where: { projectId },
    include: batchInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function loadRedeemBatch(id: string) {
  return prisma.redeemBatch.findUnique({
    where: { id },
    include: batchInclude,
  });
}

export async function replaceRedeemBatchClients(
  batchId: string,
  clients: Array<{ client: ClientChannel; enabled?: boolean }>,
) {
  const rows =
    clients.length > 0
      ? clients
      : CLIENT_CHANNELS.map((client) => ({ client, enabled: true }));
  await prisma.$transaction([
    prisma.redeemBatchClient.deleteMany({ where: { batchId } }),
    prisma.redeemBatchClient.createMany({
      data: rows.map((c) => ({
        batchId,
        client: c.client,
        enabled: c.enabled !== false,
      })),
    }),
  ]);
}

export async function generateCodesForBatch(
  batchId: string,
  count: number,
): Promise<string[]> {
  const n = Math.min(5000, Math.max(1, Math.floor(count)));
  const created: string[] = [];
  let attempts = 0;
  while (created.length < n && attempts < n * 20) {
    attempts++;
    const code = generateRedeemCodeValue();
    try {
      await prisma.redeemCode.create({
        data: { batchId, code },
      });
      created.push(code);
    } catch {
      /* unique collision — retry */
    }
  }
  if (created.length < n) {
    throw httpError("redeem.generate_incomplete", 500);
  }
  return created;
}

export async function redeemCode(input: {
  userId: string;
  projectId: string;
  code: string;
  client: ClientChannel;
}) {
  const codeStr = normalizeCode(input.code);
  if (!codeStr) throw httpError("redeem.code_required", 400);

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.status !== "active") {
    throw httpError("user.disabled", 403);
  }
  if (user.projectId !== input.projectId) {
    throw httpError("redeem.project_mismatch", 403);
  }

  const row = await prisma.redeemCode.findUnique({
    where: { code: codeStr },
    include: {
      batch: { include: { clients: true, plan: true } },
    },
  });
  if (!row) throw httpError("redeem.code_not_found", 404);
  if (row.status === "disabled") throw httpError("redeem.code_disabled", 400);
  if (row.status === "redeemed") throw httpError("redeem.code_used", 409);

  const batch = row.batch;
  if (batch.projectId !== input.projectId) {
    throw httpError("redeem.project_mismatch", 403);
  }
  if (!batch.enabled) throw httpError("redeem.batch_disabled", 400);
  if (!batchWindowOk(batch)) throw httpError("redeem.outside_window", 400);

  const clientOk = batch.clients.some(
    (c) => c.client === input.client && c.enabled,
  );
  if (!clientOk) throw httpError("redeem.client_not_allowed", 403);

  if (!batch.planId && (!batch.validitySeconds || batch.validitySeconds <= 0)) {
    throw httpError("redeem.batch_misconfigured", 500);
  }
  if (batch.planId && batch.plan) {
    if (batch.plan.projectId !== input.projectId || !batch.plan.enabled) {
      throw httpError("redeem.plan_unavailable", 400);
    }
  }

  const userRedeemedInBatch = await prisma.redeemRedemption.count({
    where: {
      userId: input.userId,
      code: { batchId: batch.id },
    },
  });
  if (userRedeemedInBatch >= batch.maxRedemptionsPerUser) {
    throw httpError("redeem.user_limit", 429);
  }

  const claimed = await prisma.redeemCode.updateMany({
    where: { id: row.id, status: "unused" },
    data: {
      status: "redeemed",
      redeemedBy: input.userId,
      redeemedAt: new Date(),
    },
  });
  if (!claimed.count) {
    throw httpError("redeem.code_used", 409);
  }

  let grantedSeconds: number | null = null;
  let slotId: string | null = null;
  let subscription = null;

  try {
    const redeemLedger = {
      reason: "redeem" as const,
      refType: "redeem_code",
      refId: row.id,
      actorType: "user",
      actorId: input.userId,
      idempotencyKey: `redeem:${row.id}`,
    };
    if (batch.planId) {
      const result = await createUpstreamSlot({
        userId: input.userId,
        planId: batch.planId,
        allowRenew: true,
        note: `redeem:${codeStr}`,
        ledger: redeemLedger,
      });
      slotId = result.slot.id;
      grantedSeconds = batch.plan?.validitySeconds ?? batch.validitySeconds;
      subscription = result.subscription;
    } else {
      const grant = await grantVpnDuration({
        userId: input.userId,
        seconds: batch.validitySeconds!,
        dataLimitBytes:
          batch.dataLimitBytes == null
            ? undefined
            : Number(batch.dataLimitBytes),
        stackMode: batch.stackMode,
        note: `redeem:${codeStr}`,
        // Batch name is ops label; use as zh with system en fallback via defaults merge in create.
        displayNameI18n: batch.name?.trim()
          ? { zh: batch.name.trim(), en: batch.name.trim() }
          : undefined,
        ledger: redeemLedger,
      });
      slotId = grant.slot.id;
      grantedSeconds = grant.granted_seconds;
      subscription = grant.subscription;
    }
  } catch (err) {
    await prisma.redeemCode.update({
      where: { id: row.id },
      data: {
        status: "unused",
        redeemedBy: null,
        redeemedAt: null,
      },
    });
    throw err;
  }

  await prisma.redeemRedemption.create({
    data: {
      codeId: row.id,
      userId: input.userId,
      client: input.client,
      grantedSeconds,
      slotId,
    },
  });

  await writeAudit({
    actorType: "user",
    actorId: input.userId,
    action: "redeem.success",
    targetType: "redeem_code",
    targetId: row.id,
    meta: {
      code: codeStr,
      batch_id: batch.id,
      plan_id: batch.planId,
      granted_seconds: grantedSeconds,
      client: input.client,
    },
  });

  return {
    code: codeStr,
    batch_id: batch.id,
    plan_id: batch.planId,
    granted_seconds: grantedSeconds,
    slot_id: slotId,
    subscription,
  };
}

export function serializeRedeemCode(c: RedeemCode) {
  return {
    id: c.id,
    batch_id: c.batchId,
    code: c.code,
    status: c.status,
    redeemed_by: c.redeemedBy,
    redeemed_at: c.redeemedAt?.toISOString() || null,
    created_at: c.createdAt.toISOString(),
  };
}
