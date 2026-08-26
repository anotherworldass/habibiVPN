import { prisma } from "../../lib/prisma.js";
import { regionZhName } from "../../lib/regions.js";
import {
  buildHistoryString,
  buildLastHourString,
  buildTodayHourString,
  lastHourWindow,
  STATUS_HISTORY_DAYS,
  STATUS_HOUR_CELLS,
  STATUS_HOUR_STEP_MS,
  STATUS_TODAY_HOURS,
  utcDayKey,
} from "./history.js";
import {
  classifyOverall,
  classifyRegion,
  foldDuplicateIncidents,
  median,
  successRate,
  type OverallStatus,
} from "./logic.js";

const STALE_MS = 36 * 3600_000;

export type PublicStatusNode = {
  name: string;
  protocol: string;
  last_ok: boolean | null;
  last_delay_ms: number | null;
  uptime_90d: number | null;
  uptime_today: number | null;
  uptime_hour: number | null;
  history: string;
  history_today: string;
  history_hour: string;
};

export type PublicStatusResponse = {
  overall: OverallStatus;
  vantage: "overseas";
  vantage_note: string;
  updated_at: string | null;
  history_days: number;
  history_today_hours: number;
  history_hour_cells: number;
  history_hour_step_ms: number;
  history_hour_from: string;
  today_hour: number;
  summary: {
    total: number;
    up: number;
    down: number;
    region_count: number;
  };
  regions: Array<{
    region: string;
    region_name: string;
    total: number;
    up: number;
    down: number;
    status: "active" | "partial" | "offline";
    uptime_90d: number | null;
    median_delay_ms: number | null;
    nodes: PublicStatusNode[];
  }>;
  incidents: Array<{
    kind: string;
    region: string | null;
    region_name: string | null;
    summary: string;
    opened_at: string;
    closed_at: string | null;
  }>;
};

export async function getPublicProbeStatus(): Promise<PublicStatusResponse> {
  const freshAfter = new Date(Date.now() - STALE_MS);
  const targets = await prisma.nodeProbeTarget.findMany({
    where: { lastSeenAt: { gte: freshAfter } },
    select: {
      id: true,
      name: true,
      protocol: true,
      region: true,
      lastOk: true,
      lastDelayMs: true,
      lastProbedAt: true,
    },
    orderBy: [{ region: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  const hourFrom = new Date(now.getTime() - STATUS_HISTORY_DAYS * 86400_000);
  const hourWin = lastHourWindow(now);
  const targetIds = targets.map((t) => t.id);
  const [hourlies, recentSamples] = targets.length
    ? await Promise.all([
        prisma.nodeProbeHourly.findMany({
          where: {
            targetId: { in: targetIds },
            hour: { gte: hourFrom },
          },
          select: {
            targetId: true,
            hour: true,
            okCount: true,
            failCount: true,
          },
        }),
        prisma.nodeProbeSample.findMany({
          where: {
            targetId: { in: targetIds },
            probedAt: { gte: hourWin.start },
          },
          select: {
            targetId: true,
            probedAt: true,
            ok: true,
          },
        }),
      ])
    : [[], []];

  const hoursByTarget = new Map<string, typeof hourlies>();
  for (const h of hourlies) {
    const list = hoursByTarget.get(h.targetId) || [];
    list.push(h);
    hoursByTarget.set(h.targetId, list);
  }

  const samplesByTarget = new Map<string, typeof recentSamples>();
  for (const s of recentSamples) {
    const list = samplesByTarget.get(s.targetId) || [];
    list.push(s);
    samplesByTarget.set(s.targetId, list);
  }

  const hourWinMs = { start: hourWin.start.getTime(), end: hourWin.end.getTime() };
  type NodeAcc = PublicStatusNode & { delays: number[] };
  const byRegion = new Map<string, { nodes: NodeAcc[] }>();

  for (const t of targets) {
    const rows = hoursByTarget.get(t.id) || [];
    const ok = rows.reduce((n, r) => n + r.okCount, 0);
    const fail = rows.reduce((n, r) => n + r.failCount, 0);
    const rate = successRate(ok, fail);
    const day = utcDayKey(now);
    const todayOk = rows.reduce(
      (n, r) => n + (utcDayKey(r.hour) === day ? r.okCount : 0),
      0,
    );
    const todayFail = rows.reduce(
      (n, r) => n + (utcDayKey(r.hour) === day ? r.failCount : 0),
      0,
    );
    const todayRate = successRate(todayOk, todayFail);
    const samples = samplesByTarget.get(t.id) || [];
    let hourOk = 0;
    let hourFail = 0;
    for (const s of samples) {
      const at = s.probedAt.getTime();
      if (at < hourWinMs.start || at >= hourWinMs.end) continue;
      if (s.ok) hourOk += 1;
      else hourFail += 1;
    }
    const hourRate = successRate(hourOk, hourFail);
    const node: NodeAcc = {
      name: t.name,
      protocol: t.protocol,
      last_ok: t.lastOk,
      last_delay_ms: t.lastDelayMs,
      uptime_90d: rate == null ? null : Math.round(rate * 1000) / 10,
      uptime_today: todayRate == null ? null : Math.round(todayRate * 1000) / 10,
      uptime_hour: hourRate == null ? null : Math.round(hourRate * 1000) / 10,
      history: buildHistoryString(rows, STATUS_HISTORY_DAYS, now),
      history_today: buildTodayHourString(rows, now),
      history_hour: buildLastHourString(samples, now),
      delays: t.lastOk && t.lastDelayMs != null ? [t.lastDelayMs] : [],
    };
    const bucket = byRegion.get(t.region) || { nodes: [] };
    bucket.nodes.push(node);
    byRegion.set(t.region, bucket);
  }

  const regions = [...byRegion.entries()]
    .map(([region, c]) => {
      const up = c.nodes.filter((n) => n.last_ok).length;
      const down = c.nodes.length - up;
      const delays = c.nodes.flatMap((n) => n.delays);
      const uptimes = c.nodes
        .map((n) => n.uptime_90d)
        .filter((n): n is number => n != null);
      const avgUptime =
        uptimes.length > 0
          ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length
          : null;
      const nodes = [...c.nodes]
        .sort((a, b) => Number(b.last_ok === false) - Number(a.last_ok === false) || a.name.localeCompare(b.name))
        .map(({ delays: _d, ...n }) => n);
      return {
        region,
        region_name: regionZhName(region),
        total: c.nodes.length,
        up,
        down,
        status: classifyRegion(up, down),
        uptime_90d: avgUptime == null ? null : Math.round(avgUptime * 10) / 10,
        median_delay_ms: median(delays),
        nodes,
      };
    })
    .sort((a, b) => b.total - a.total || a.region.localeCompare(b.region));

  const up = targets.filter((t) => t.lastOk).length;
  const down = targets.length - up;
  const updatedAt = targets.reduce<Date | null>((acc, t) => {
    if (!t.lastProbedAt) return acc;
    if (!acc || t.lastProbedAt > acc) return t.lastProbedAt;
    return acc;
  }, null);

  const incidentRows = await prisma.nodeProbeIncident.findMany({
    where: {
      openedAt: { gte: new Date(Date.now() - 14 * 86400_000) },
    },
    orderBy: { openedAt: "desc" },
    take: 20,
    select: {
      kind: true,
      region: true,
      summary: true,
      openedAt: true,
      closedAt: true,
    },
  });

  return {
    overall: classifyOverall(up, down),
    vantage: "overseas",
    vantage_note: "监测点位于境外机房，反映节点自身协议/出口是否健康，不代表国内用户可达性。",
    updated_at: updatedAt?.toISOString() ?? null,
    history_days: STATUS_HISTORY_DAYS,
    history_today_hours: STATUS_TODAY_HOURS,
    history_hour_cells: STATUS_HOUR_CELLS,
    history_hour_step_ms: STATUS_HOUR_STEP_MS,
    history_hour_from: hourWin.start.toISOString(),
    today_hour: now.getUTCHours(),
    summary: {
      total: targets.length,
      up,
      down,
      region_count: regions.length,
    },
    regions,
    incidents: foldDuplicateIncidents(
      incidentRows.map((r) => ({
        kind: r.kind,
        region: r.region,
        region_name: r.region ? regionZhName(r.region) : null,
        summary: r.summary,
        opened_at: r.openedAt.toISOString(),
        closed_at: r.closedAt?.toISOString() ?? null,
      })),
    ),
  };
}
