import { prisma } from "../../lib/prisma.js";
import { regionZhName } from "../../lib/regions.js";
import {
  classifyOverall,
  classifyRegion,
  median,
  successRate,
  type OverallStatus,
} from "./logic.js";

const STALE_MS = 36 * 3600_000;
const UPTIME_DAYS = 90;

export type PublicStatusResponse = {
  overall: OverallStatus;
  vantage: "overseas";
  vantage_note: string;
  updated_at: string | null;
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
      region: true,
      lastOk: true,
      lastDelayMs: true,
      lastProbedAt: true,
    },
  });

  const hourFrom = new Date(Date.now() - UPTIME_DAYS * 86400_000);
  const hourlies = targets.length
    ? await prisma.nodeProbeHourly.groupBy({
        by: ["targetId"],
        where: {
          targetId: { in: targets.map((t) => t.id) },
          hour: { gte: hourFrom },
        },
        _sum: { okCount: true, failCount: true },
      })
    : [];
  const uptimeByTarget = new Map<string, number | null>();
  for (const h of hourlies) {
    uptimeByTarget.set(
      h.targetId,
      successRate(h._sum.okCount ?? 0, h._sum.failCount ?? 0),
    );
  }

  const byRegion = new Map<
    string,
    { up: number; down: number; delays: number[]; uptimes: number[] }
  >();
  for (const t of targets) {
    const bucket = byRegion.get(t.region) || {
      up: 0,
      down: 0,
      delays: [],
      uptimes: [],
    };
    if (t.lastOk) bucket.up += 1;
    else bucket.down += 1;
    if (t.lastOk && t.lastDelayMs != null) bucket.delays.push(t.lastDelayMs);
    const u = uptimeByTarget.get(t.id);
    if (u != null) bucket.uptimes.push(u);
    byRegion.set(t.region, bucket);
  }

  const regions = [...byRegion.entries()]
    .map(([region, c]) => {
      const total = c.up + c.down;
      const avgUptime =
        c.uptimes.length > 0
          ? c.uptimes.reduce((a, b) => a + b, 0) / c.uptimes.length
          : null;
      return {
        region,
        region_name: regionZhName(region),
        total,
        up: c.up,
        down: c.down,
        status: classifyRegion(c.up, c.down),
        uptime_90d:
          avgUptime == null ? null : Math.round(avgUptime * 1000) / 10,
        median_delay_ms: median(c.delays),
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
    summary: {
      total: targets.length,
      up,
      down,
      region_count: regions.length,
    },
    regions,
    incidents: incidentRows.map((r) => ({
      kind: r.kind,
      region: r.region,
      region_name: r.region ? regionZhName(r.region) : null,
      summary: r.summary,
      opened_at: r.openedAt.toISOString(),
      closed_at: r.closedAt?.toISOString() ?? null,
    })),
  };
}
