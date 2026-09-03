import type { Prisma, UpstreamGrantJob } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isRetryableUpstreamError } from "../wireraw/client.js";
import type { EntitlementLedgerContext } from "./entitlement-ledger.js";

export type CreateSlotGrantPayload = {
  op: "create_slot";
  planId?: string;
  slotId?: string;
  allowRenew?: boolean;
  skipPlanOwnedCheck?: boolean;
  locale?: string | null;
  note?: string;
  displayNameI18n?: Record<string, string> | null;
  validitySeconds?: number;
  dataLimitBytes?: number;
  expireAt?: string;
  ledger?: EntitlementLedgerContext;
  campaignClaimId?: string;
  campaignGrantedSeconds?: number | null;
  campaignMeta?: Record<string, unknown>;
};

export type GrantDurationPayload = {
  op: "grant_duration";
  seconds: number;
  dataLimitBytes?: number;
  stackMode?: "extend_active" | "create_campaign_slot";
  note?: string;
  displayNameI18n?: Record<string, string> | null;
  locale?: string | null;
  ledger?: EntitlementLedgerContext;
  campaignClaimId?: string;
  campaignGrantedSeconds?: number | null;
  campaignMeta?: Record<string, unknown>;
};

export type UpstreamGrantPayload = CreateSlotGrantPayload | GrantDurationPayload;

export function grantRetryDelayMs(attempts: number): number {
  if (attempts <= 1) return 60_000;
  if (attempts === 2) return 5 * 60_000;
  return 15 * 60_000;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export async function enqueueUpstreamGrant(input: {
  kind: string;
  userId: string;
  idempotencyKey: string;
  payload: UpstreamGrantPayload;
}): Promise<UpstreamGrantJob> {
  try {
    return await prisma.upstreamGrantJob.create({
      data: {
        kind: input.kind,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as Prisma.InputJsonValue,
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(Date.now() + grantRetryDelayMs(1)),
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.upstreamGrantJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existing) throw err;
    if (existing.status === "done" || existing.status === "failed") {
      return existing;
    }
    if (existing.status === "processing") return existing;
    return prisma.upstreamGrantJob.update({
      where: { id: existing.id },
      data: {
        payload: input.payload as Prisma.InputJsonValue,
        status: "pending",
        lastError: existing.lastError,
      },
    });
  }
}

export async function executeOrEnqueueGrant<T>(input: {
  kind: string;
  userId: string;
  idempotencyKey: string;
  payload: UpstreamGrantPayload;
  run: () => Promise<T>;
}): Promise<{ pending: false; result: T } | { pending: true; jobId: string }> {
  try {
    const result = await input.run();
    return { pending: false, result };
  } catch (err) {
    if (!isRetryableUpstreamError(err)) throw err;
    const job = await enqueueUpstreamGrant({
      kind: input.kind,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
    });
    return { pending: true, jobId: job.id };
  }
}

export async function claimDueGrantJobs(limit = 10): Promise<UpstreamGrantJob[]> {
  const now = new Date();
  const due = await prisma.upstreamGrantJob.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
  const claimed: UpstreamGrantJob[] = [];
  for (const job of due) {
    const moved = await prisma.upstreamGrantJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "processing" },
    });
    if (!moved.count) continue;
    claimed.push({ ...job, status: "processing" });
  }
  return claimed;
}

export async function markGrantJobDone(jobId: string, slotId: string | null) {
  await prisma.upstreamGrantJob.update({
    where: { id: jobId },
    data: {
      status: "done",
      slotId,
      lastError: null,
    },
  });
}

export async function markGrantJobRetry(jobId: string, attempts: number, error: string) {
  await prisma.upstreamGrantJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      attempts,
      lastError: error.slice(0, 2000),
      nextRetryAt: new Date(Date.now() + grantRetryDelayMs(attempts)),
    },
  });
}

export async function markGrantJobFailed(jobId: string, error: string) {
  await prisma.upstreamGrantJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      lastError: error.slice(0, 2000),
    },
  });
}

export function parseGrantPayload(raw: unknown): UpstreamGrantPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.op === "create_slot") return o as unknown as CreateSlotGrantPayload;
  if (o.op === "grant_duration") return o as unknown as GrantDurationPayload;
  return null;
}
