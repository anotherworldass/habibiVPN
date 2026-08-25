import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_PROJECT_ID } from "../project.js";
import {
  SETTING_KEYS,
  getProjectSetting,
  upsertProjectSetting,
} from "../system-settings.js";

export const NODE_PROBE_SECRET_MASK = "********";

export const DEFAULT_NODE_PROBE_VALUE = {
  probeSlotId: null as string | null,
  delayIntervalSec: 120,
  speedIntervalSec: 900,
  delayUrl: "http://www.gstatic.com/generate_204",
  speedUrl: "",
  speedBytes: 1_048_576,
  speedEnabled: true,
  delayTimeoutMs: 5000,
  speedTimeoutMs: 10_000,
  delayConcurrency: 8,
  downFailStreak: 3,
  unstableWindowMin: 15,
  unstableSuccessRate: 0.8,
  delayP95Ms: 1500,
  slowMbps: 5,
  slowStreak: 2,
  alertCooldownSec: 900,
  regionDigestMin: 3,
  mihomoApiUrl: "http://127.0.0.1:19090",
  mihomoSecret: "habibi-probe",
  mixedPort: 17890,
  telegramChatId: null as string | null,
};

export type NodeProbeValue = typeof DEFAULT_NODE_PROBE_VALUE;

const schema = z.object({
  probeSlotId: z.string().max(64).nullable(),
  delayIntervalSec: z.number().int().min(60).max(3600),
  speedIntervalSec: z.number().int().min(900).max(86_400),
  delayUrl: z.string().url().max(500),
  speedUrl: z.string().max(500),
  speedBytes: z.number().int().min(262_144).max(5_242_880),
  speedEnabled: z.boolean(),
  delayTimeoutMs: z.number().int().min(1000).max(15_000),
  speedTimeoutMs: z.number().int().min(3000).max(30_000),
  delayConcurrency: z.number().int().min(1).max(8),
  downFailStreak: z.number().int().min(2).max(10),
  unstableWindowMin: z.number().int().min(5).max(120),
  unstableSuccessRate: z.number().min(0.1).max(1),
  delayP95Ms: z.number().int().min(200).max(20_000),
  slowMbps: z.number().min(0.1).max(500),
  slowStreak: z.number().int().min(1).max(5),
  alertCooldownSec: z.number().int().min(60).max(86_400),
  regionDigestMin: z.number().int().min(2).max(50),
  mihomoApiUrl: z.string().url().max(200),
  mihomoSecret: z.string().max(128),
  mixedPort: z.number().int().min(1024).max(65535),
  telegramChatId: z.string().max(64).nullable(),
});

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function parseNodeProbeValue(raw: unknown): NodeProbeValue {
  const o = asObject(raw);
  const d = DEFAULT_NODE_PROBE_VALUE;
  const speedUrlRaw = typeof o.speedUrl === "string" ? o.speedUrl.trim() : "";
  const merged = {
    probeSlotId: strOrNull(o.probeSlotId),
    delayIntervalSec: num(o.delayIntervalSec, d.delayIntervalSec),
    speedIntervalSec: num(o.speedIntervalSec, d.speedIntervalSec),
    delayUrl: strOrNull(o.delayUrl) || d.delayUrl,
    speedUrl: speedUrlRaw,
    speedBytes: num(o.speedBytes, d.speedBytes),
    speedEnabled: bool(o.speedEnabled, d.speedEnabled),
    delayTimeoutMs: num(o.delayTimeoutMs, d.delayTimeoutMs),
    speedTimeoutMs: num(o.speedTimeoutMs, d.speedTimeoutMs),
    delayConcurrency: num(o.delayConcurrency, d.delayConcurrency),
    downFailStreak: num(o.downFailStreak, d.downFailStreak),
    unstableWindowMin: num(o.unstableWindowMin, d.unstableWindowMin),
    unstableSuccessRate: num(o.unstableSuccessRate, d.unstableSuccessRate),
    delayP95Ms: num(o.delayP95Ms, d.delayP95Ms),
    slowMbps: num(o.slowMbps, d.slowMbps),
    slowStreak: num(o.slowStreak, d.slowStreak),
    alertCooldownSec: num(o.alertCooldownSec, d.alertCooldownSec),
    regionDigestMin: num(o.regionDigestMin, d.regionDigestMin),
    mihomoApiUrl: strOrNull(o.mihomoApiUrl) || d.mihomoApiUrl,
    mihomoSecret: typeof o.mihomoSecret === "string" ? o.mihomoSecret : d.mihomoSecret,
    mixedPort: num(o.mixedPort, d.mixedPort),
    telegramChatId: strOrNull(o.telegramChatId),
  };
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    throw Object.assign(new Error("node_probe.invalid"), {
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }
  const speedUrl = parsed.data.speedUrl.trim();
  if (speedUrl && !/^https?:\/\//i.test(speedUrl)) {
    throw Object.assign(new Error("node_probe.speed_url_invalid"), {
      statusCode: 400,
    });
  }
  return { ...parsed.data, speedUrl };
}

export function maskNodeProbeValue(value: NodeProbeValue) {
  return {
    ...value,
    mihomoSecret: value.mihomoSecret ? NODE_PROBE_SECRET_MASK : "",
  };
}

export async function getNodeProbeConfig(projectId: string): Promise<{
  enabled: boolean;
  remark: string | null;
  value: NodeProbeValue;
}> {
  const row = await getProjectSetting(projectId, SETTING_KEYS.NODE_PROBE);
  if (!row) {
    return { enabled: false, remark: null, value: { ...DEFAULT_NODE_PROBE_VALUE } };
  }
  return {
    enabled: row.enabled,
    remark: row.remark,
    value: parseNodeProbeValue(row.value),
  };
}

export async function upsertNodeProbeConfig(input: {
  projectId: string;
  enabled: boolean;
  remark?: string | null;
  patch: Partial<NodeProbeValue> & { mihomoSecret?: string };
}): Promise<{ enabled: boolean; remark: string | null; value: NodeProbeValue }> {
  const current = await getNodeProbeConfig(input.projectId);
  const incomingSecret = input.patch.mihomoSecret;
  const keepSecret =
    incomingSecret == null ||
    incomingSecret === "" ||
    incomingSecret === NODE_PROBE_SECRET_MASK ||
    incomingSecret === current.value.mihomoSecret;
  const merged = parseNodeProbeValue({
    ...current.value,
    ...input.patch,
    mihomoSecret: keepSecret ? current.value.mihomoSecret : incomingSecret,
  });
  const row = await upsertProjectSetting({
    projectId: input.projectId,
    key: SETTING_KEYS.NODE_PROBE,
    value: merged as unknown as Prisma.InputJsonValue,
    enabled: input.enabled,
    remark: input.remark ?? current.remark,
  });
  return { enabled: row.enabled, remark: row.remark, value: merged };
}

export type ProbeRuntime = {
  projectId: string;
  enabled: boolean;
  value: NodeProbeValue;
};

/** One global probe cycle: default project if enabled, else first enabled. */
export async function resolveProbeRuntime(): Promise<ProbeRuntime | null> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: SETTING_KEYS.NODE_PROBE, enabled: true },
  });
  if (!rows.length) return null;
  const preferred =
    rows.find((r) => r.projectId === DEFAULT_PROJECT_ID) || rows[0]!;
  return {
    projectId: preferred.projectId,
    enabled: true,
    value: parseNodeProbeValue(preferred.value),
  };
}
