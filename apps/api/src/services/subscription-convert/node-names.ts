import {
  inferRegionFromText,
  normalizeRegionCode,
  regionZhName,
  UNKNOWN_REGION,
} from "../../lib/regions.js";
import type { SubscriptionNodeNameMode } from "../system-settings.js";
import { cloneNodeWithName, type ProxyNode } from "./parse.js";

export type NodeNameMode = SubscriptionNodeNameMode;

export function applyNodeNameStyle(
  nodes: ProxyNode[],
  mode: NodeNameMode,
  hostRegionByServer?: Map<string, string>,
): ProxyNode[] {
  if (mode === "original" || !nodes.length) return nodes;

  const counts = new Map<string, number>();
  return nodes.map((node) => {
    const code = inferNodeRegion(node, hostRegionByServer);
    const n = (counts.get(code) || 0) + 1;
    counts.set(code, n);
    const seq = String(n).padStart(2, "0");
    const name =
      mode === "zh_region" ? `${regionZhName(code)} ${seq}` : `${code}${seq}`;
    return cloneNodeWithName(node, name);
  });
}

function inferNodeRegion(
  node: ProxyNode,
  hostRegionByServer?: Map<string, string>,
): string {
  const host = node.server.trim().toLowerCase();
  const fromHost = host ? hostRegionByServer?.get(host) : undefined;
  if (fromHost) return normalizeRegionCode(fromHost);

  const fromName = inferRegionFromText(node.name);
  if (fromName !== UNKNOWN_REGION) return fromName;

  return UNKNOWN_REGION;
}
