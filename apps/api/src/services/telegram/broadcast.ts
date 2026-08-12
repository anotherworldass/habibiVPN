import type { Prisma, TelegramBroadcastJob, TelegramBroadcastStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { deleteMessage, sendMessage } from "./api.js";
import { decryptSecret } from "./crypto.js";
import { markSubscriberBlocked } from "./subscribers.js";

const BATCH_SIZE = 40;
/** Delay between messages — stay under Telegram flood limits (~25–30/s). */
const MSG_DELAY_MS = 45;
const MAX_ERROR_SAMPLES = 30;
/** Telegram typically allows bots to delete their own private messages within ~48h. */
const RECALL_MAX_AGE_MS = 48 * 3600_000;

type ErrorSample = { chat_id: string; error: string; at: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function audienceWhere(
  projectId: string,
  onlyCanDm: boolean,
  cursorId: string | null,
): Prisma.TelegramSubscriberWhereInput {
  return {
    projectId,
    ...(onlyCanDm ? { canDm: true, blocked: false } : {}),
    ...(cursorId ? { id: { gt: cursorId } } : {}),
  };
}

function parseSamples(raw: unknown): ErrorSample[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is ErrorSample =>
      !!x &&
      typeof x === "object" &&
      typeof (x as ErrorSample).chat_id === "string" &&
      typeof (x as ErrorSample).error === "string",
  );
}

function jobView(
  job: TelegramBroadcastJob,
  extras?: { pending_recall?: number; delivery_count?: number },
) {
  const done = job.sentCount + job.failedCount;
  const total = job.totalTargeted;
  const deliveryCount = extras?.delivery_count ?? job.sentCount;
  const pendingRecall = extras?.pending_recall;
  const recallDone = job.recalledCount + job.recallFailedCount;
  const recallTotal =
    pendingRecall != null
      ? job.recalledCount + job.recallFailedCount + pendingRecall
      : deliveryCount;
  const ageMs = Date.now() - job.createdAt.getTime();
  const withinRecallWindow = ageMs <= RECALL_MAX_AGE_MS;
  const recallableStatuses: TelegramBroadcastStatus[] = [
    "completed",
    "cancelled",
    "paused",
    "failed",
  ];
  const recallable =
    recallableStatuses.includes(job.status) &&
    job.sentCount > 0 &&
    withinRecallWindow &&
    (pendingRecall == null ? true : pendingRecall > 0);

  return {
    id: job.id,
    project_id: job.projectId,
    status: job.status,
    text: job.text,
    only_can_dm: job.onlyCanDm,
    total_targeted: total,
    sent_count: job.sentCount,
    failed_count: job.failedCount,
    processed: done,
    progress_pct: total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0,
    delivery_count: deliveryCount,
    recalled_count: job.recalledCount,
    recall_failed_count: job.recallFailedCount,
    pending_recall: pendingRecall ?? null,
    recall_progress_pct:
      recallTotal > 0
        ? Math.min(100, Math.round((recallDone / recallTotal) * 1000) / 10)
        : 0,
    recallable,
    within_recall_window: withinRecallWindow,
    cursor_id: job.cursorId,
    error_samples: job.errorSamples,
    created_by: job.createdBy,
    error_message: job.errorMessage,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    recall_started_at: job.recallStartedAt,
    recall_finished_at: job.recallFinishedAt,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

async function enrichJobView(job: TelegramBroadcastJob) {
  const [deliveryCount, pendingRecall] = await Promise.all([
    prisma.telegramBroadcastDelivery.count({ where: { jobId: job.id } }),
    prisma.telegramBroadcastDelivery.count({
      where: { jobId: job.id, deletedAt: null },
    }),
  ]);
  return jobView(job, {
    delivery_count: deliveryCount,
    pending_recall: pendingRecall,
  });
}

export async function countBroadcastAudience(projectId: string, onlyCanDm: boolean) {
  return prisma.telegramSubscriber.count({
    where: audienceWhere(projectId, onlyCanDm, null),
  });
}

/** Enqueue a broadcast job (HTTP returns immediately; worker sends in batches). */
export async function createBroadcastJob(input: {
  projectId: string;
  text: string;
  onlyCanDm?: boolean;
  createdBy?: string | null;
}) {
  const bot = await prisma.projectTelegramBot.findUnique({
    where: { projectId: input.projectId },
  });
  if (!bot?.enabled || !bot.botTokenEnc) {
    throw Object.assign(new Error("telegram.bot_not_ready"), { statusCode: 400 });
  }

  const onlyCanDm = input.onlyCanDm !== false;
  const total = await countBroadcastAudience(input.projectId, onlyCanDm);
  if (total === 0) {
    throw Object.assign(new Error("telegram.no_subscribers"), { statusCode: 400 });
  }

  const active = await prisma.telegramBroadcastJob.count({
    where: {
      projectId: input.projectId,
      status: { in: ["queued", "running", "recalling"] },
    },
  });
  if (active > 0) {
    throw Object.assign(new Error("telegram.broadcast_busy"), { statusCode: 409 });
  }

  const job = await prisma.telegramBroadcastJob.create({
    data: {
      projectId: input.projectId,
      botId: bot.id,
      text: input.text.trim(),
      onlyCanDm,
      totalTargeted: total,
      status: "queued",
      createdBy: input.createdBy ?? null,
      errorSamples: [],
    },
  });

  return enrichJobView(job);
}

export async function listBroadcastJobs(
  projectId: string,
  opts: { limit?: number; offset?: number; status?: TelegramBroadcastStatus } = {},
) {
  const limit = Math.min(opts.limit || 20, 100);
  const offset = opts.offset || 0;
  const where = {
    projectId,
    ...(opts.status ? { status: opts.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.telegramBroadcastJob.count({ where }),
    prisma.telegramBroadcastJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  const views = await Promise.all(items.map((j) => enrichJobView(j)));
  return { total, items: views };
}

export async function getBroadcastJob(projectId: string, jobId: string) {
  const job = await prisma.telegramBroadcastJob.findFirst({
    where: { id: jobId, projectId },
  });
  if (!job) {
    throw Object.assign(new Error("telegram.broadcast_not_found"), { statusCode: 404 });
  }
  return enrichJobView(job);
}

export async function pauseBroadcastJob(projectId: string, jobId: string) {
  const job = await prisma.telegramBroadcastJob.findFirst({
    where: { id: jobId, projectId },
  });
  if (!job) {
    throw Object.assign(new Error("telegram.broadcast_not_found"), { statusCode: 404 });
  }
  if (job.status !== "queued" && job.status !== "running") {
    throw Object.assign(new Error("telegram.broadcast_not_pausable"), { statusCode: 400 });
  }
  const updated = await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: { status: "paused" },
  });
  return enrichJobView(updated);
}

export async function resumeBroadcastJob(projectId: string, jobId: string) {
  const job = await prisma.telegramBroadcastJob.findFirst({
    where: { id: jobId, projectId },
  });
  if (!job) {
    throw Object.assign(new Error("telegram.broadcast_not_found"), { statusCode: 404 });
  }
  if (job.status !== "paused") {
    throw Object.assign(new Error("telegram.broadcast_not_resumable"), { statusCode: 400 });
  }
  const busy = await prisma.telegramBroadcastJob.count({
    where: {
      projectId,
      status: { in: ["queued", "running", "recalling"] },
      NOT: { id: job.id },
    },
  });
  if (busy > 0) {
    throw Object.assign(new Error("telegram.broadcast_busy"), { statusCode: 409 });
  }
  const updated = await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: { status: "queued", errorMessage: null },
  });
  return enrichJobView(updated);
}

export async function cancelBroadcastJob(projectId: string, jobId: string) {
  const job = await prisma.telegramBroadcastJob.findFirst({
    where: { id: jobId, projectId },
  });
  if (!job) {
    throw Object.assign(new Error("telegram.broadcast_not_found"), { statusCode: 404 });
  }
  if (["completed", "cancelled", "recalled", "recalling"].includes(job.status)) {
    return enrichJobView(job);
  }
  const updated = await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
    },
  });
  return enrichJobView(updated);
}

/** Start async recall (deleteMessage) for messages already delivered. */
export async function startBroadcastRecall(projectId: string, jobId: string) {
  const job = await prisma.telegramBroadcastJob.findFirst({
    where: { id: jobId, projectId },
  });
  if (!job) {
    throw Object.assign(new Error("telegram.broadcast_not_found"), { statusCode: 404 });
  }
  if (job.status === "recalling") {
    return enrichJobView(job);
  }
  if (job.status === "queued" || job.status === "running") {
    throw Object.assign(new Error("telegram.broadcast_recall_busy_send"), {
      statusCode: 400,
    });
  }
  if (job.status === "recalled") {
    throw Object.assign(new Error("telegram.broadcast_already_recalled"), {
      statusCode: 400,
    });
  }
  if (Date.now() - job.createdAt.getTime() > RECALL_MAX_AGE_MS) {
    throw Object.assign(new Error("telegram.broadcast_recall_expired"), {
      statusCode: 400,
    });
  }

  const pending = await prisma.telegramBroadcastDelivery.count({
    where: { jobId: job.id, deletedAt: null },
  });
  if (pending === 0) {
    throw Object.assign(new Error("telegram.broadcast_nothing_to_recall"), {
      statusCode: 400,
    });
  }

  const busy = await prisma.telegramBroadcastJob.count({
    where: {
      projectId,
      status: { in: ["queued", "running", "recalling"] },
      NOT: { id: job.id },
    },
  });
  if (busy > 0) {
    throw Object.assign(new Error("telegram.broadcast_busy"), { statusCode: 409 });
  }

  const updated = await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: {
      status: "recalling",
      recallStartedAt: job.recallStartedAt ?? new Date(),
      recallFinishedAt: null,
      errorMessage: null,
    },
  });
  return enrichJobView(updated);
}

/**
 * Process one cursor batch for a job.
 * @returns true if the worker should keep polling this / other jobs soon
 */
export async function processBroadcastBatch(jobId: string): Promise<boolean> {
  let job = await prisma.telegramBroadcastJob.findUnique({ where: { id: jobId } });
  if (!job) return false;
  if (job.status !== "queued" && job.status !== "running") return false;

  const bot = await prisma.projectTelegramBot.findUnique({ where: { id: job.botId } });
  if (!bot?.botTokenEnc || !bot.enabled) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "telegram.bot_not_ready",
        finishedAt: new Date(),
      },
    });
    return false;
  }
  const token = decryptSecret(bot.botTokenEnc);
  if (!token) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "telegram.bot_not_ready",
        finishedAt: new Date(),
      },
    });
    return false;
  }

  if (job.status === "queued") {
    job = await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        startedAt: job.startedAt ?? new Date(),
      },
    });
  }

  const batch = await prisma.telegramSubscriber.findMany({
    where: audienceWhere(job.projectId, job.onlyCanDm, job.cursorId),
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: { id: true, chatId: true, telegramUserId: true },
  });

  if (batch.length === 0) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: { status: "completed", finishedAt: new Date() },
    });
    return false;
  }

  let sent = job.sentCount;
  let failed = job.failedCount;
  let cursor = job.cursorId;
  const samples = parseSamples(job.errorSamples);
  let floodPaused = false;

  for (const sub of batch) {
    const live = await prisma.telegramBroadcastJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    if (!live || live.status !== "running") {
      await prisma.telegramBroadcastJob.update({
        where: { id: job.id },
        data: {
          sentCount: sent,
          failedCount: failed,
          cursorId: cursor,
          errorSamples: samples as unknown as Prisma.InputJsonValue,
        },
      });
      return false;
    }

    try {
      const sentMsg = await sendMessage(token, {
        chat_id: sub.chatId,
        text: job.text,
        disable_web_page_preview: true,
      });
      await prisma.telegramBroadcastDelivery.upsert({
        where: {
          jobId_chatId: { jobId: job.id, chatId: sub.chatId },
        },
        create: {
          jobId: job.id,
          projectId: job.projectId,
          subscriberId: sub.id,
          chatId: sub.chatId,
          telegramMessageId: String(sentMsg.message_id),
        },
        update: {
          telegramMessageId: String(sentMsg.message_id),
          subscriberId: sub.id,
          deletedAt: null,
        },
      });
      sent += 1;
      cursor = sub.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send_failed";
      if (/retry after|too many requests|flood/i.test(msg)) {
        floodPaused = true;
        await prisma.telegramBroadcastJob.update({
          where: { id: job.id },
          data: {
            sentCount: sent,
            failedCount: failed,
            cursorId: cursor,
            errorSamples: samples as unknown as Prisma.InputJsonValue,
            errorMessage: msg.slice(0, 500),
            status: "paused",
          },
        });
        return true;
      }

      failed += 1;
      cursor = sub.id;
      samples.push({
        chat_id: sub.chatId,
        error: msg.slice(0, 200),
        at: new Date().toISOString(),
      });
      while (samples.length > MAX_ERROR_SAMPLES) samples.shift();
      if (/blocked|bot was blocked|user is deactivated|chat not found/i.test(msg)) {
        await markSubscriberBlocked(bot.id, sub.telegramUserId);
      }
    }

    await sleep(MSG_DELAY_MS);
  }

  if (floodPaused) return true;

  const more = batch.length >= BATCH_SIZE;
  await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: {
      sentCount: sent,
      failedCount: failed,
      cursorId: cursor,
      errorSamples: samples as unknown as Prisma.InputJsonValue,
      ...(more
        ? {}
        : { status: "completed" as const, finishedAt: new Date() }),
    },
  });

  return more;
}

/** Process one batch of deleteMessage for a recalling job. */
export async function processBroadcastRecallBatch(jobId: string): Promise<boolean> {
  const job = await prisma.telegramBroadcastJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "recalling") return false;

  const bot = await prisma.projectTelegramBot.findUnique({ where: { id: job.botId } });
  if (!bot?.botTokenEnc || !bot.enabled) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "telegram.bot_not_ready",
        recallFinishedAt: new Date(),
      },
    });
    return false;
  }
  const token = decryptSecret(bot.botTokenEnc);
  if (!token) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorMessage: "telegram.bot_not_ready",
        recallFinishedAt: new Date(),
      },
    });
    return false;
  }

  const batch = await prisma.telegramBroadcastDelivery.findMany({
    where: { jobId: job.id, deletedAt: null },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: {
      id: true,
      chatId: true,
      telegramMessageId: true,
    },
  });

  if (batch.length === 0) {
    await prisma.telegramBroadcastJob.update({
      where: { id: job.id },
      data: {
        status: "recalled",
        recallFinishedAt: new Date(),
      },
    });
    return false;
  }

  let recalled = job.recalledCount;
  let recallFailed = job.recallFailedCount;
  const samples = parseSamples(job.errorSamples);

  for (const row of batch) {
    const live = await prisma.telegramBroadcastJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    if (!live || live.status !== "recalling") {
      await prisma.telegramBroadcastJob.update({
        where: { id: job.id },
        data: {
          recalledCount: recalled,
          recallFailedCount: recallFailed,
          errorSamples: samples as unknown as Prisma.InputJsonValue,
        },
      });
      return false;
    }

    try {
      await deleteMessage(token, {
        chat_id: row.chatId,
        message_id: row.telegramMessageId,
      });
      await prisma.telegramBroadcastDelivery.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      recalled += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete_failed";
      if (/retry after|too many requests|flood/i.test(msg)) {
        await prisma.telegramBroadcastJob.update({
          where: { id: job.id },
          data: {
            recalledCount: recalled,
            recallFailedCount: recallFailed,
            errorSamples: samples as unknown as Prisma.InputJsonValue,
            errorMessage: msg.slice(0, 500),
            // stay recalling — worker will retry next tick after pause feel
          },
        });
        await sleep(2000);
        return true;
      }

      // Mark as handled so we don't loop forever (message too old / already deleted)
      await prisma.telegramBroadcastDelivery.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      recallFailed += 1;
      samples.push({
        chat_id: row.chatId,
        error: `recall: ${msg.slice(0, 180)}`,
        at: new Date().toISOString(),
      });
      while (samples.length > MAX_ERROR_SAMPLES) samples.shift();
    }

    await sleep(MSG_DELAY_MS);
  }

  const more = batch.length >= BATCH_SIZE;
  await prisma.telegramBroadcastJob.update({
    where: { id: job.id },
    data: {
      recalledCount: recalled,
      recallFailedCount: recallFailed,
      errorSamples: samples as unknown as Prisma.InputJsonValue,
      ...(more
        ? {}
        : {
            status: "recalled" as const,
            recallFinishedAt: new Date(),
          }),
    },
  });

  return more;
}

/** Prefer finishing in-flight send, then recall, then oldest queued send. */
export async function claimNextBroadcastWork(): Promise<
  { id: string; kind: "send" | "recall" } | null
> {
  const recalling = await prisma.telegramBroadcastJob.findFirst({
    where: { status: "recalling" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (recalling) return { id: recalling.id, kind: "recall" };

  const running = await prisma.telegramBroadcastJob.findFirst({
    where: { status: "running" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (running) return { id: running.id, kind: "send" };

  const queued = await prisma.telegramBroadcastJob.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return queued ? { id: queued.id, kind: "send" } : null;
}

/** @deprecated use claimNextBroadcastWork */
export async function claimNextBroadcastJobId(): Promise<string | null> {
  const work = await claimNextBroadcastWork();
  return work?.kind === "send" ? work.id : null;
}

/** Drop delivery rows older than recall window (housekeeping). */
export async function purgeExpiredBroadcastDeliveries(limit = 2000) {
  const before = new Date(Date.now() - RECALL_MAX_AGE_MS);
  const old = await prisma.telegramBroadcastDelivery.findMany({
    where: { createdAt: { lt: before } },
    select: { id: true },
    take: limit,
  });
  if (!old.length) return 0;
  const res = await prisma.telegramBroadcastDelivery.deleteMany({
    where: { id: { in: old.map((r) => r.id) } },
  });
  return res.count;
}
