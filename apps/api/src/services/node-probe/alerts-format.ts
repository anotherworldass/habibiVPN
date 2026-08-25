export type ProbeDigestItem = {
  region: string;
  line: string;
};

const TG_MAX = 3500;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function clampTelegramHtml(s: string, max = TG_MAX): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 12)}\n…（已截断）`;
}

/** One Telegram message: a single item, or a merged list grouped by region. */
export function formatProbeDigest(input: {
  emoji: string;
  title: string;
  items: ProbeDigestItem[];
  regionName: (code: string) => string;
  /** If a region has this many items, only show the count (no per-node lines). */
  collapseRegionAt?: number;
  footer?: string;
}): string {
  if (!input.items.length) return "";
  const footer = input.footer ?? "监测点：境外机房";
  if (input.items.length === 1) {
    const it = input.items[0]!;
    return clampTelegramHtml(
      `${input.emoji} <b>${input.title}</b> · ${escapeHtml(input.regionName(it.region))}\n${it.line}\n${footer}`,
    );
  }

  const byRegion = new Map<string, ProbeDigestItem[]>();
  for (const it of input.items) {
    const list = byRegion.get(it.region) || [];
    list.push(it);
    byRegion.set(it.region, list);
  }

  const chunks: string[] = [
    `${input.emoji} <b>${input.title}</b> · 共 ${input.items.length} 条`,
    `${footer} · 已合并`,
    "",
  ];
  const collapseAt = input.collapseRegionAt ?? Number.POSITIVE_INFINITY;
  for (const [region, list] of byRegion) {
    const name = escapeHtml(input.regionName(region));
    if (list.length >= collapseAt) {
      chunks.push(`<b>${name}</b> · ${list.length} 条`);
    } else {
      chunks.push(`<b>${name}</b>`);
      for (const it of list) chunks.push(`· ${it.line}`);
    }
    chunks.push("");
  }
  return clampTelegramHtml(chunks.join("\n").trim());
}
