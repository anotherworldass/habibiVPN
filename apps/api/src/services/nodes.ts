import { wireraw } from "../wireraw/client.js";

type UpstreamNode = {
  name?: string;
  region?: string;
  status?: string;
};

export type RegionPool = {
  region: string;
  region_name: string;
  total: number;
  active: number;
  inactive: number;
  other: number;
  /** overall: active | partial | offline */
  status: "active" | "partial" | "offline";
};

const REGION_NAMES: Record<string, string> = {
  AE: "阿联酋",
  AU: "澳大利亚",
  BR: "巴西",
  CA: "加拿大",
  CH: "瑞士",
  DE: "德国",
  FR: "法国",
  GB: "英国",
  HK: "香港",
  IN: "印度",
  JP: "日本",
  KR: "韩国",
  NL: "荷兰",
  PH: "菲律宾",
  SE: "瑞典",
  SG: "新加坡",
  TW: "台湾",
  US: "美国",
  VN: "越南",
};

function unwrapNodes(data: unknown): UpstreamNode[] {
  if (Array.isArray(data)) return data as UpstreamNode[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["items", "nodes", "data"]) {
      if (Array.isArray(o[key])) return o[key] as UpstreamNode[];
    }
  }
  return [];
}

function regionName(code: string) {
  return REGION_NAMES[code] || code;
}

function classifyStatus(status?: string): "active" | "inactive" | "other" {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "online" || s === "up") return "active";
  if (
    s === "inactive" ||
    s === "offline" ||
    s === "down" ||
    s === "disabled" ||
    s === "maintenance"
  ) {
    return "inactive";
  }
  return "other";
}

export async function getPublicNodePool() {
  const raw = await wireraw.listNodes();
  const nodes = unwrapNodes(raw);

  const byRegion = new Map<
    string,
    { active: number; inactive: number; other: number }
  >();

  for (const n of nodes) {
    const region = (n.region || "UN").toUpperCase();
    const bucket = byRegion.get(region) || { active: 0, inactive: 0, other: 0 };
    const kind = classifyStatus(n.status);
    bucket[kind] += 1;
    byRegion.set(region, bucket);
  }

  const regions: RegionPool[] = [...byRegion.entries()]
    .map(([region, c]) => {
      const total = c.active + c.inactive + c.other;
      let status: RegionPool["status"] = "offline";
      if (c.active > 0 && c.active === total) status = "active";
      else if (c.active > 0) status = "partial";
      return {
        region,
        region_name: regionName(region),
        total,
        active: c.active,
        inactive: c.inactive,
        other: c.other,
        status,
      };
    })
    .sort((a, b) => b.total - a.total || a.region.localeCompare(b.region));

  const total_nodes = nodes.length;
  const active_nodes = regions.reduce((s, r) => s + r.active, 0);
  const region_count = regions.length;

  return {
    summary: {
      total_nodes,
      active_nodes,
      region_count,
      updated_at: new Date().toISOString(),
    },
    regions,
  };
}
