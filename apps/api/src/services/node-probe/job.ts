import { prisma } from "../../lib/prisma.js";
import {
  redisGet,
  redisSetEx,
  redisDel,
} from "../../lib/redis.js";
import { DEFAULT_PROJECT_ID } from "../project.js";
import { renderProbeClashYaml } from "./clash.js";
import { evaluateAndAlert, type ProbeRoundSample } from "./alerts.js";
import { truncateError } from "./fingerprint.js";
import { loadProbeInbounds, upsertProbeTargets } from "./inventory.js";
import { shouldSkipSpeedRound } from "./logic.js";
import { downloadViaMixedPort, MihomoClient } from "./mihomo.js";
import {
  getNodeProbeConfig,
  resolveProbeRuntime,
  type NodeProbeValue,
} from "./settings.js";
import { tcpConnectMs } from "./tcp.js";

const LAST_DELAY_KEY = "node-probe:last-delay";
const LAST_SPEED_KEY = "node-probe:last-speed";
const LAST_RUN_KEY = "node-probe:last-run";
const TICK_KEY = "node-probe:last-tick";
const LOCK_TTL_SEC = 12 * 60;
const TICK_MS = 20_000;
const SAMPLE_TTL_DAYS = 14;
const HOURLY_TTL_DAYS = 90;
const SPEED_ROUND_BUDGET_MS = 8 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

type LogFn = {
  info: (o: unknown, msg?: string) => void;
  warn?: (o: unknown, msg?: string) => void;
  error?: (o: unknown, msg?: string) => void;
};

export type ProbeLastRun = {
  at: string;
  ok: boolean;
  error?: string | null;
  targetCount: number;
  delayOk: number;
  delayFail: number;
  speedCount: number;
  speedMs: number | null;
};

export type ProbeTick = {
  at: string;
  result: string;
};

let memoryLastRun: ProbeLastRun | null = null;
let memoryTick: ProbeTick | null = null;
let memoryLastDelay = 0;
let memoryLastSpeed = 0;

const LEASE_ID = "probe";

function busyError() {
  return Object.assign(new Error("node_probe.busy"), { statusCode: 409 });
}

async function acquireDbLease(owner: string, ttlSec: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSec * 1000);
  const updated = await prisma.nodeProbeLease.updateMany({
    where: { id: LEASE_ID, OR: [{ expiresAt: { lt: now } }, { owner }] },
    data: { owner, expiresAt },
  });
  if (updated.count === 1) return true;
  try {
    await prisma.nodeProbeLease.create({
      data: { id: LEASE_ID, owner, expiresAt },
    });
    return true;
  } catch {
    return false;
  }
}

async function releaseDbLease(owner: string) {
  await prisma.nodeProbeLease.updateMany({
    where: { id: LEASE_ID, owner },
    data: { expiresAt: new Date() },
  });
}

export async function getProbeLastRun(): Promise<ProbeLastRun | null> {
  try {
    const raw = await redisGet(LAST_RUN_KEY);
    if (!raw) return memoryLastRun;
    const parsed = JSON.parse(raw) as ProbeLastRun;
    memoryLastRun = parsed;
    return parsed;
  } catch {
    return memoryLastRun;
  }
}

async function saveLastRun(run: ProbeLastRun) {
  memoryLastRun = run;
  try {
    await redisSetEx(LAST_RUN_KEY, 7 * 24 * 3600, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}

async function saveTick(result: string) {
  memoryTick = { at: new Date().toISOString(), result };
  try {
    await redisSetEx(TICK_KEY, 7 * 24 * 3600, JSON.stringify(memoryTick));
  } catch {
    /* ignore */
  }
}

export async function getProbeTick(): Promise<ProbeTick | null> {
  try {
    const raw = await redisGet(TICK_KEY);
    if (!raw) return memoryTick;
    const parsed = JSON.parse(raw) as ProbeTick;
    memoryTick = parsed;
    return parsed;
  } catch {
    return memoryTick;
  }
}

export async function getProbeSchedule(delayIntervalSec: number): Promise<{
  last_tick: ProbeTick | null;
  next_probe_at: string | null;
}> {
  const [lastTick, lastDelayRaw] = await Promise.all([
    getProbeTick(),
    redisGet(LAST_DELAY_KEY).catch(() => null),
  ]);
  const lastDelay = Number(lastDelayRaw || 0);
  const nextMs = lastDelay > 0 ? lastDelay + delayIntervalSec * 1000 : Date.now();
  return {
    last_tick: lastTick,
    next_probe_at: new Date(Math.max(nextMs, Date.now())).toISOString(),
  };
}

/** Next scheduled tick probes immediately instead of waiting out the interval. */
export async function resetProbeDelaySchedule() {
  await redisDel(LAST_DELAY_KEY).catch(() => undefined);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function hourBucket(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()),
  );
}

function controllerHost(apiUrl: string): string {
  try {
    const u = new URL(apiUrl);
    return `${u.hostname}:${u.port || "80"}`;
  } catch {
    return "127.0.0.1:19090";
  }
}

async function persistSample(input: {
  targetId: string;
  probedAt: Date;
  ok: boolean;
  tcpMs: number | null;
  delayMs: number | null;
  downloadMbps: number | null;
  error: string | null;
}) {
  await prisma.nodeProbeSample.create({
    data: {
      targetId: input.targetId,
      probedAt: input.probedAt,
      ok: input.ok,
      tcpMs: input.tcpMs,
      delayMs: input.delayMs,
      downloadMbps: input.downloadMbps,
      error: input.error,
    },
  });
  await prisma.nodeProbeTarget.update({
    where: { id: input.targetId },
    data: {
      lastOk: input.ok,
      lastTcpMs: input.tcpMs,
      lastDelayMs: input.delayMs,
      lastError: input.error,
      lastProbedAt: input.probedAt,
      ...(input.downloadMbps != null ? { lastDownloadMbps: input.downloadMbps } : {}),
    },
  });
  const hour = hourBucket(input.probedAt);
  await prisma.nodeProbeHourly.upsert({
    where: { targetId_hour: { targetId: input.targetId, hour } },
    create: {
      targetId: input.targetId,
      hour,
      okCount: input.ok ? 1 : 0,
      failCount: input.ok ? 0 : 1,
      delaySumMs: input.delayMs ?? 0,
      delayCount: input.delayMs != null ? 1 : 0,
      mbpsSum: input.downloadMbps ?? 0,
      mbpsCount: input.downloadMbps != null ? 1 : 0,
    },
    update: {
      okCount: { increment: input.ok ? 1 : 0 },
      failCount: { increment: input.ok ? 0 : 1 },
      ...(input.delayMs != null
        ? {
            delaySumMs: { increment: input.delayMs },
            delayCount: { increment: 1 },
          }
        : {}),
      ...(input.downloadMbps != null
        ? {
            mbpsSum: { increment: input.downloadMbps },
            mbpsCount: { increment: 1 },
          }
        : {}),
    },
  });
}

async function cleanupOldRows() {
  const sampleCut = new Date(Date.now() - SAMPLE_TTL_DAYS * 86400_000);
  const hourlyCut = new Date(Date.now() - HOURLY_TTL_DAYS * 86400_000);
  await prisma.nodeProbeSample.deleteMany({ where: { probedAt: { lt: sampleCut } } });
  await prisma.nodeProbeHourly.deleteMany({ where: { hour: { lt: hourlyCut } } });
}

export async function runNodeProbeRound(input?: {
  force?: boolean;
  includeSpeed?: boolean;
  projectId?: string;
  log?: LogFn;
}): Promise<ProbeLastRun> {
  let projectId = input?.projectId;
  let cfg: NodeProbeValue | null = null;
  let alertProjectId: string | null = null;

  if (projectId) {
    const row = await getNodeProbeConfig(projectId);
    cfg = row.value;
    alertProjectId = row.enabled ? projectId : null;
  } else {
    const runtime = await resolveProbeRuntime();
    if (!runtime && !input?.force) {
      await saveTick("disabled");
      return {
        at: new Date().toISOString(),
        ok: true,
        error: "disabled",
        targetCount: 0,
        delayOk: 0,
        delayFail: 0,
        speedCount: 0,
        speedMs: null,
      };
    }
    if (runtime) {
      projectId = runtime.projectId;
      cfg = runtime.value;
      alertProjectId = runtime.projectId;
    } else {
      const row = await getNodeProbeConfig(DEFAULT_PROJECT_ID);
      projectId = DEFAULT_PROJECT_ID;
      cfg = row.value;
    }
  }

  if (!cfg || !cfg.probeSlotId) {
    const run: ProbeLastRun = {
      at: new Date().toISOString(),
      ok: false,
      error: "node_probe.slot_missing",
      targetCount: 0,
      delayOk: 0,
      delayFail: 0,
      speedCount: 0,
      speedMs: null,
    };
    await saveLastRun(run);
    await saveTick("slot_missing");
    return run;
  }

  const probeCfg = cfg;

  const dbLeaseOwner = `${process.pid}:${Date.now()}`;
  const gotDb = await acquireDbLease(dbLeaseOwner, LOCK_TTL_SEC).catch(() => false);
  if (!gotDb) throw busyError();

  const started = Date.now();
  let delayOk = 0;
  let delayFail = 0;
  let speedCount = 0;
  try {
    const now = Date.now();
    const lastDelay = Number(
      (await redisGet(LAST_DELAY_KEY).catch(() => null)) || memoryLastDelay || 0,
    );
    const lastSpeed = Number(
      (await redisGet(LAST_SPEED_KEY).catch(() => null)) || memoryLastSpeed || 0,
    );
    const delayDue =
      input?.force || !lastDelay || now - lastDelay >= probeCfg.delayIntervalSec * 1000;
    if (!delayDue) {
      await saveTick("skipped_interval");
      return {
        at: new Date().toISOString(),
        ok: true,
        error: "skipped_interval",
        targetCount: 0,
        delayOk: 0,
        delayFail: 0,
        speedCount: 0,
        speedMs: null,
      };
    }

    const speedDue =
      Boolean(input?.includeSpeed) ||
      (probeCfg.speedEnabled &&
        Boolean(probeCfg.speedUrl) &&
        (input?.force ||
          !lastSpeed ||
          now - lastSpeed >= probeCfg.speedIntervalSec * 1000));

    const inbounds = await loadProbeInbounds(probeCfg.probeSlotId!);
    const targets = await upsertProbeTargets(inbounds);
    if (!targets.length) {
      throw Object.assign(new Error("node_probe.empty_subscription"), {
        statusCode: 502,
      });
    }

    const mihomo = new MihomoClient(probeCfg.mihomoApiUrl, probeCfg.mihomoSecret);
    await mihomo.ping();
    const yaml = renderProbeClashYaml({
      nodes: targets.map((t) => t.node),
      mixedPort: probeCfg.mixedPort,
      controllerHost: controllerHost(probeCfg.mihomoApiUrl),
      secret: probeCfg.mihomoSecret,
    });
    await mihomo.putConfig(yaml);

    const probedAt = new Date();
    const round: ProbeRoundSample[] = [];

    const delayResults = await mapPool(
      targets,
      probeCfg.delayConcurrency,
      async (t) => {
        const [tcp, delay] = await Promise.all([
          tcpConnectMs(t.server, t.port, 3000),
          mihomo.proxyDelay(t.clashName, probeCfg.delayUrl, probeCfg.delayTimeoutMs),
        ]);
        return { t, tcp, delay };
      },
    );

    for (const row of delayResults) {
      const ok = row.delay.ok;
      if (ok) delayOk += 1;
      else delayFail += 1;
      await persistSample({
        targetId: row.t.targetId,
        probedAt,
        ok,
        tcpMs: row.tcp.ok ? row.tcp.ms : null,
        delayMs: row.delay.ok ? row.delay.delayMs : null,
        downloadMbps: null,
        error: row.delay.ok ? null : row.delay.error,
      });
      round.push({
        targetId: row.t.targetId,
        region: row.t.region,
        name: row.t.displayName,
        protocol: row.t.protocol,
        ok,
        delayMs: row.delay.ok ? row.delay.delayMs : null,
        downloadMbps: null,
      });
    }

    await redisSetEx(LAST_DELAY_KEY, 7 * 86400, String(Date.now())).catch(() => undefined);
    memoryLastDelay = Date.now();

    const skipSpeed = shouldSkipSpeedRound(delayOk, delayFail);
    if (speedDue && skipSpeed) {
      input?.log?.warn?.(
        { delayOk, delayFail },
        "node-probe skip speed; delay round too lossy",
      );
    }

    if (speedDue && !skipSpeed) {
      const speedStarted = Date.now();
      for (const row of delayResults) {
        if (Date.now() - speedStarted > SPEED_ROUND_BUDGET_MS) break;
        if (!row.delay.ok) continue;
        try {
          await mihomo.selectGlobal(row.t.clashName);
          const speed = await downloadViaMixedPort({
            mixedPort: probeCfg.mixedPort,
            url: probeCfg.speedUrl,
            maxBytes: probeCfg.speedBytes,
            timeoutMs: probeCfg.speedTimeoutMs,
          });
          speedCount += 1;
          await prisma.nodeProbeSample.updateMany({
            where: {
              targetId: row.t.targetId,
              probedAt,
            },
            data: { downloadMbps: speed.mbps },
          });
          await prisma.nodeProbeTarget.update({
            where: { id: row.t.targetId },
            data: { lastDownloadMbps: speed.mbps },
          });
          const hour = hourBucket(probedAt);
          await prisma.nodeProbeHourly.update({
            where: { targetId_hour: { targetId: row.t.targetId, hour } },
            data: {
              mbpsSum: { increment: speed.mbps },
              mbpsCount: { increment: 1 },
            },
          });
          const rec = round.find((r) => r.targetId === row.t.targetId);
          if (rec) rec.downloadMbps = speed.mbps;
        } catch (err) {
          input?.log?.warn?.(
            { name: row.t.displayName, err: truncateError(err) },
            "node-probe speed failed",
          );
        }
      }
      await redisSetEx(LAST_SPEED_KEY, 7 * 86400, String(Date.now())).catch(
        () => undefined,
      );
      memoryLastSpeed = Date.now();
    }

    await evaluateAndAlert({
      projectId: alertProjectId || projectId || DEFAULT_PROJECT_ID,
      cfg: probeCfg,
      round,
      log: input?.log,
      notify: Boolean(alertProjectId) && probeCfg.telegramEnabled,
    });
    await cleanupOldRows().catch(() => undefined);

    const run: ProbeLastRun = {
      at: new Date().toISOString(),
      ok: true,
      error: null,
      targetCount: targets.length,
      delayOk,
      delayFail,
      speedCount,
      speedMs: Date.now() - started,
    };
    await saveLastRun(run);
    await saveTick("ok");
    input?.log?.info?.(
      { targetCount: targets.length, delayOk, delayFail, speedCount },
      "node-probe round ok",
    );
    return run;
  } catch (err) {
    const run: ProbeLastRun = {
      at: new Date().toISOString(),
      ok: false,
      error: truncateError(err),
      targetCount: 0,
      delayOk,
      delayFail,
      speedCount,
      speedMs: Date.now() - started,
    };
    await saveLastRun(run);
    await saveTick(truncateError(err, 80));
    throw err;
  } finally {
    if (dbLeaseOwner) {
      await releaseDbLease(dbLeaseOwner).catch(() => undefined);
    }
  }
}

export function startNodeProbeJob(log?: LogFn) {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNodeProbeRound({ log });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "node_probe.busy") {
        await saveTick("busy");
      } else {
        log?.error?.({ err: msg }, "node-probe job error");
        console.error("[node-probe]", msg);
      }
    } finally {
      running = false;
    }
  };
  void tick();
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}

export function stopNodeProbeJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
