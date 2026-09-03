import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isRetryableUpstreamError } from "../wireraw/client.js";
import { createUpstreamSlot, grantVpnDuration } from "./provision.js";
import {
  claimDueGrantJobs,
  markGrantJobDone,
  markGrantJobFailed,
  markGrantJobRetry,
  parseGrantPayload,
  type UpstreamGrantPayload,
} from "./upstream-grant-queue.js";

const SKIP_CODES = new Set([
  "subscription.plan_already_owned",
  "user.not_found",
  "user.disabled",
  "plan.not_found",
  "plan.not_free_claimable",
  "plan.project_mismatch",
]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "grant.failed");
}

function errorCode(err: unknown): string {
  const msg = errorMessage(err);
  return msg.split(":")[0]?.trim() || msg;
}

async function applyCampaignClaimSuccess(
  payload: UpstreamGrantPayload,
  slotId: string | null,
) {
  if (!payload.campaignClaimId) return;
  await prisma.campaignClaim.update({
    where: { id: payload.campaignClaimId },
    data: {
      slotId,
      grantedSeconds: payload.campaignGrantedSeconds ?? undefined,
      result: "claimed",
      meta: payload.campaignMeta
        ? (payload.campaignMeta as Prisma.InputJsonValue)
        : undefined,
    },
  }).catch(() => undefined);
}

async function runGrantPayload(payload: UpstreamGrantPayload, userId: string) {
  if (payload.op === "create_slot") {
    const created = await createUpstreamSlot({
      userId,
      planId: payload.planId,
      slotId: payload.slotId,
      allowRenew: payload.allowRenew,
      skipPlanOwnedCheck: payload.skipPlanOwnedCheck,
      locale: payload.locale,
      note: payload.note,
      displayNameI18n: payload.displayNameI18n,
      validitySeconds: payload.validitySeconds,
      dataLimitBytes: payload.dataLimitBytes,
      expireAt: payload.expireAt,
      ledger: payload.ledger,
    });
    await applyCampaignClaimSuccess(payload, created.slot.id);
    return created.slot.id as string | null;
  }

  const granted = await grantVpnDuration({
    userId,
    seconds: payload.seconds,
    dataLimitBytes: payload.dataLimitBytes,
    stackMode: payload.stackMode,
    note: payload.note,
    displayNameI18n: payload.displayNameI18n,
    locale: payload.locale,
    ledger: payload.ledger,
  });
  await applyCampaignClaimSuccess(payload, granted.slot.id);
  return granted.slot.id as string | null;
}

export async function processDueUpstreamGrants(limit = 8): Promise<number> {
  const jobs = await claimDueGrantJobs(limit);
  let done = 0;
  for (const job of jobs) {
    const payload = parseGrantPayload(job.payload);
    if (!payload) {
      await markGrantJobFailed(job.id, "grant.invalid_payload");
      continue;
    }
    try {
      const slotId = await runGrantPayload(payload, job.userId);
      await markGrantJobDone(job.id, slotId);
      done += 1;
    } catch (err) {
      const code = errorCode(err);
      if (code === "subscription.plan_already_owned") {
        await markGrantJobDone(job.id, job.slotId);
        done += 1;
        continue;
      }
      if (SKIP_CODES.has(code) || !isRetryableUpstreamError(err)) {
        await markGrantJobFailed(job.id, errorMessage(err));
        continue;
      }
      await markGrantJobRetry(job.id, job.attempts + 1, errorMessage(err));
    }
  }
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startUpstreamGrantJob(log?: {
  info: (o: unknown, msg?: string) => void;
}) {
  if (timer) return;
  const tick = async () => {
    try {
      const n = await processDueUpstreamGrants();
      if (n > 0) log?.info({ granted: n }, "upstream grant jobs completed");
    } catch (err) {
      console.error("[upstream-grant] job error", err);
    }
  };
  void tick();
  timer = setInterval(tick, 30_000);
  timer.unref?.();
}

export function stopUpstreamGrantJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
