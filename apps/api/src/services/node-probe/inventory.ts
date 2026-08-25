import { ProxyAgent, fetch as undiciFetch } from "undici";
import { env } from "../../config.js";
import { prisma } from "../../lib/prisma.js";
import { inferRegionFromText } from "../../lib/regions.js";
import { wireraw } from "../../wireraw/client.js";
import { getNodeRegionByHost } from "../nodes.js";
import {
  extractShareUris,
  parseShareUri,
  type ProxyNode,
} from "../subscription-convert/parse.js";
import { clashNameFor, targetFingerprint } from "./fingerprint.js";

const proxyDispatcher = env.WIRERAW_HTTP_PROXY
  ? new ProxyAgent(env.WIRERAW_HTTP_PROXY)
  : undefined;

function probeErr(code: string, statusCode = 400): Error {
  return Object.assign(new Error(code), { statusCode });
}

/** Accept slot id, WireRaw usr- id / username, or Habibi user id. */
export async function resolveProbeSlot(raw: string) {
  const key = raw.trim().replace(/^['"]+|['"]+$/g, "");
  if (!key) throw probeErr("node_probe.slot_not_found");

  let slot = await prisma.userUpstream.findUnique({ where: { id: key } });
  if (!slot) {
    slot = await prisma.userUpstream.findFirst({
      where: { OR: [{ upstreamId: key }, { upstreamUsername: key }] },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!slot) {
    const user = await prisma.user.findUnique({
      where: { id: key },
      include: {
        upstreams: { orderBy: { createdAt: "desc" } },
      },
    });
    if (user) {
      if (!user.upstreams.length) throw probeErr("node_probe.user_no_slot");
      slot =
        user.upstreams.find((s) => s.status === "active" && s.subscriptionUrl) ||
        user.upstreams.find((s) => s.subscriptionUrl) ||
        user.upstreams[0] ||
        null;
    }
  }

  if (!slot) {
    const plan = await prisma.plan.findUnique({
      where: { id: key },
      select: { id: true },
    });
    if (plan) throw probeErr("node_probe.got_plan_id");
    throw probeErr("node_probe.slot_not_found");
  }
  if (!slot.subscriptionUrl) throw probeErr("node_probe.slot_no_subscription");
  if (slot.status !== "active") throw probeErr("node_probe.slot_disabled");
  return slot;
}

export type ProbeInbound = {
  fingerprint: string;
  clashName: string;
  displayName: string;
  region: string;
  protocol: string;
  server: string;
  port: number;
  wirerawName: string | null;
  node: ProxyNode;
};

function unwrapNodes(data: unknown): Array<{
  name?: string;
  public_ip?: string;
  advertise_host?: string;
}> {
  if (Array.isArray(data)) return data as Array<{ name?: string }>;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["items", "nodes", "data"]) {
      if (Array.isArray(o[key])) {
        return o[key] as Array<{
          name?: string;
          public_ip?: string;
          advertise_host?: string;
        }>;
      }
    }
  }
  return [];
}

async function hostToWirerawName(): Promise<Map<string, string>> {
  try {
    const raw = await wireraw.listNodes();
    const map = new Map<string, string>();
    for (const n of unwrapNodes(raw)) {
      const name = (n.name || "").trim();
      if (!name) continue;
      if (n.advertise_host?.trim()) {
        map.set(n.advertise_host.trim().toLowerCase(), name);
      }
      if (n.public_ip?.trim()) {
        map.set(n.public_ip.trim().toLowerCase(), name);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchSubscriptionBody(slot: {
  upstreamId: string | null;
  subscriptionUrl: string;
}): Promise<string> {
  if (slot.upstreamId) {
    try {
      const rendered = await wireraw.getSubscription(slot.upstreamId, "base64");
      const b64 = rendered.payload?.Body;
      if (typeof b64 === "string" && b64.trim()) {
        try {
          return Buffer.from(b64.trim(), "base64").toString("utf8");
        } catch {
          return b64.trim();
        }
      }
    } catch {
      /* fall through to public URL */
    }
  }
  const res = await undiciFetch(slot.subscriptionUrl, {
    method: "GET",
    headers: {
      Accept: "*/*",
      "User-Agent": "v2rayN/6.45",
    },
    ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error("node_probe.subscription_fetch_failed"), {
      statusCode: 502,
    });
  }
  return text;
}

function lookupRegion(
  node: ProxyNode,
  hostRegions: Map<string, string>,
): string {
  const host = node.server.trim().toLowerCase();
  const fromHost = hostRegions.get(host);
  if (fromHost) return fromHost;
  const sni = node.servername?.trim().toLowerCase();
  if (sni && hostRegions.get(sni)) return hostRegions.get(sni)!;
  return inferRegionFromText(node.name) || "UN";
}

export async function loadProbeInbounds(probeSlotId: string): Promise<ProbeInbound[]> {
  const slot = await resolveProbeSlot(probeSlotId);

  const [body, hostRegions, nameByHost] = await Promise.all([
    fetchSubscriptionBody({
      upstreamId: slot.upstreamId,
      subscriptionUrl: slot.subscriptionUrl,
    }),
    getNodeRegionByHost(),
    hostToWirerawName(),
  ]);
  const parsed = extractShareUris(body)
    .map(parseShareUri)
    .filter((n): n is ProxyNode => !!n);

  const seen = new Set<string>();
  const inbounds: ProbeInbound[] = [];

  for (const node of parsed) {
    const fingerprint = targetFingerprint(node.type, node.server, node.port);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const clashNm = clashNameFor(node.type, fingerprint);
    const host = node.server.trim().toLowerCase();
    const sni = node.servername?.trim().toLowerCase();
    const wirerawName =
      nameByHost.get(host) || (sni ? nameByHost.get(sni) ?? null : null);
    inbounds.push({
      fingerprint,
      clashName: clashNm,
      displayName: node.name,
      region: lookupRegion(node, hostRegions),
      protocol: node.type,
      server: node.server,
      port: node.port,
      wirerawName,
      node: { ...node, name: clashNm },
    });
  }

  return inbounds;
}

export async function upsertProbeTargets(inbounds: ProbeInbound[]): Promise<
  Array<ProbeInbound & { targetId: string }>
> {
  const now = new Date();
  const out: Array<ProbeInbound & { targetId: string }> = [];
  for (const item of inbounds) {
    const row = await prisma.nodeProbeTarget.upsert({
      where: { fingerprint: item.fingerprint },
      create: {
        fingerprint: item.fingerprint,
        name: item.displayName,
        region: item.region,
        protocol: item.protocol,
        server: item.server,
        port: item.port,
        wirerawName: item.wirerawName,
        clashName: item.clashName,
        lastSeenAt: now,
      },
      update: {
        name: item.displayName,
        region: item.region,
        protocol: item.protocol,
        server: item.server,
        port: item.port,
        wirerawName: item.wirerawName,
        clashName: item.clashName,
        lastSeenAt: now,
      },
    });
    out.push({ ...item, targetId: row.id });
  }
  return out;
}
