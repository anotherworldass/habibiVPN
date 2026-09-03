import { normalizeAppCopyI18n, pickAppCopy } from "@habibi/shared";
import { z } from "zod";
import { resolveSource } from "./project.js";
import {
  getProjectSetting,
  SETTING_KEYS,
  upsertProjectSetting,
} from "./system-settings.js";

export const THIRD_PARTY_CLIENT_PLATFORMS = [
  "ios",
  "android",
  "windows",
  "macos",
  "linux",
] as const;

export type ThirdPartyClientPlatform =
  (typeof THIRD_PARTY_CLIENT_PLATFORMS)[number];

export const THIRD_PARTY_IMPORT_KEYS = [
  "shadowrocket",
  "clash_meta",
  "hiddify",
  "surge",
  "quantumult_x",
  "v2ray",
] as const;

export type ThirdPartyImportKey = (typeof THIRD_PARTY_IMPORT_KEYS)[number];

export const THIRD_PARTY_DOWNLOAD_CHANNELS = [
  "app_store",
  "play",
  "github",
  "website",
] as const;

export type ThirdPartyDownloadChannel =
  (typeof THIRD_PARTY_DOWNLOAD_CHANNELS)[number];

export const THIRD_PARTY_CLIENTS_MAX = 30;
export const THIRD_PARTY_NAME_MAX = 80;
export const THIRD_PARTY_SUMMARY_MAX = 160;
export const THIRD_PARTY_TIP_MAX = 2000;
export const THIRD_PARTY_URL_MAX = 500;
export const THIRD_PARTY_ID_MAX = 48;

const slugRe = /^[a-z][a-z0-9-]{0,47}$/;

const i18nMapSchema = z.record(z.string(), z.string());

const urlsSchema = z.object({
  ios: z.string().max(THIRD_PARTY_URL_MAX).optional(),
  android: z.string().max(THIRD_PARTY_URL_MAX).optional(),
  windows: z.string().max(THIRD_PARTY_URL_MAX).optional(),
  macos: z.string().max(THIRD_PARTY_URL_MAX).optional(),
  linux: z.string().max(THIRD_PARTY_URL_MAX).optional(),
});

export const thirdPartyClientItemSchema = z.object({
  id: z.string().trim().min(1).max(THIRD_PARTY_ID_MAX).regex(slugRe),
  enabled: z.boolean(),
  featured: z.boolean(),
  paid: z.boolean(),
  sort: z.number().int().min(0).max(9999),
  import_key: z.string().trim().max(32),
  name_i18n: i18nMapSchema,
  summary_i18n: i18nMapSchema,
  tip_i18n: i18nMapSchema,
  urls: urlsSchema,
});

export const thirdPartyClientsValueSchema = z.object({
  clients: z.array(thirdPartyClientItemSchema).max(THIRD_PARTY_CLIENTS_MAX),
});

export type ThirdPartyClientItem = z.infer<typeof thirdPartyClientItemSchema>;
export type ThirdPartyClientsValue = z.infer<
  typeof thirdPartyClientsValueSchema
>;

export const DEFAULT_THIRD_PARTY_CLIENTS_VALUE: ThirdPartyClientsValue = {
  clients: [
    {
      id: "shadowrocket",
      enabled: true,
      featured: true,
      paid: true,
      sort: 10,
      import_key: "shadowrocket",
      name_i18n: { zh: "Shadowrocket", en: "Shadowrocket" },
      summary_i18n: {
        zh: "iOS 常用付费客户端，需外区 App Store 账号",
        en: "Popular paid iOS client. Needs a non-CN App Store account.",
      },
      tip_i18n: {
        zh: "在美区 App Store 搜索并购买 Shadowrocket。安装后到本站「连接」页复制 Shadowrocket 订阅并导入。",
        en: "Buy it on a US App Store account. Then copy the Shadowrocket subscription from Connect.",
      },
      urls: {
        ios: "https://apps.apple.com/app/shadowrocket/id932747118",
      },
    },
    {
      id: "quantumult-x",
      enabled: true,
      featured: false,
      paid: true,
      sort: 20,
      import_key: "quantumult_x",
      name_i18n: { zh: "Quantumult X", en: "Quantumult X" },
      summary_i18n: {
        zh: "iOS 进阶付费客户端",
        en: "Advanced paid client for iOS.",
      },
      tip_i18n: {
        zh: "需外区 App Store。导入后在客户端更新订阅再选节点。",
        en: "Requires a non-CN App Store account. Update the subscription after import.",
      },
      urls: {
        ios: "https://apps.apple.com/app/quantumult-x/id1443980353",
      },
    },
    {
      id: "surge",
      enabled: true,
      featured: false,
      paid: true,
      sort: 30,
      import_key: "surge",
      name_i18n: { zh: "Surge", en: "Surge" },
      summary_i18n: {
        zh: "iOS / macOS 付费网络工具",
        en: "Paid network toolbox for iOS and macOS.",
      },
      tip_i18n: {
        zh: "从官方 App Store 购买。导入后在 Surge 中更新配置。",
        en: "Buy it from the official App Store, then refresh the profile in Surge.",
      },
      urls: {
        ios: "https://apps.apple.com/app/surge-5/id1442620678",
        macos: "https://apps.apple.com/app/surge-5/id1442620678",
      },
    },
    {
      id: "hiddify",
      enabled: true,
      featured: false,
      paid: false,
      sort: 40,
      import_key: "hiddify",
      name_i18n: { zh: "Hiddify", en: "Hiddify" },
      summary_i18n: {
        zh: "跨平台免费客户端，适合 Android 与桌面",
        en: "Free cross-platform client for Android and desktop.",
      },
      tip_i18n: {
        zh: "请从 GitHub Releases 下载官方包。安装后到「连接」页复制 Hiddify 订阅。",
        en: "Download only from the official GitHub Releases page. Then copy the Hiddify subscription from Connect.",
      },
      urls: {
        ios: "https://github.com/hiddify/hiddify-app/releases",
        android: "https://github.com/hiddify/hiddify-app/releases",
        windows: "https://github.com/hiddify/hiddify-app/releases",
        macos: "https://github.com/hiddify/hiddify-app/releases",
        linux: "https://github.com/hiddify/hiddify-app/releases",
      },
    },
    {
      id: "clash-verge",
      enabled: true,
      featured: true,
      paid: false,
      sort: 50,
      import_key: "clash_meta",
      name_i18n: { zh: "Clash Verge", en: "Clash Verge" },
      summary_i18n: {
        zh: "Windows / macOS / Linux 常用 Clash Meta 客户端",
        en: "Popular Clash Meta client for Windows, macOS, and Linux.",
      },
      tip_i18n: {
        zh: "请下载 Clash Verge Rev 官方 Release，不要使用已停更的旧版 Clash。导入 Clash 订阅后更新节点。",
        en: "Use Clash Verge Rev official releases — not the discontinued Clash. Import the Clash subscription, then update nodes.",
      },
      urls: {
        windows: "https://github.com/clash-verge-rev/clash-verge-rev/releases",
        macos: "https://github.com/clash-verge-rev/clash-verge-rev/releases",
        linux: "https://github.com/clash-verge-rev/clash-verge-rev/releases",
      },
    },
    {
      id: "clash-meta-android",
      enabled: true,
      featured: false,
      paid: false,
      sort: 60,
      import_key: "clash_meta",
      name_i18n: { zh: "Clash Meta", en: "Clash Meta" },
      summary_i18n: {
        zh: "Android 上的 Clash Meta 客户端",
        en: "Clash Meta client for Android.",
      },
      tip_i18n: {
        zh: "请从 ClashMetaForAndroid 官方 GitHub 下载。不要安装来源不明的 APK。",
        en: "Download ClashMetaForAndroid from the official GitHub repo. Do not install APKs from unknown sources.",
      },
      urls: {
        android: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases",
      },
    },
  ],
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function isHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function inferThirdPartyDownloadChannel(
  url: string,
): ThirdPartyDownloadChannel {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "apps.apple.com" || host === "itunes.apple.com") {
      return "app_store";
    }
    if (host === "play.google.com") return "play";
    if (host === "github.com" || host.endsWith(".github.io")) return "github";
  } catch {
    /* ignore */
  }
  return "website";
}

function sanitizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim().slice(0, THIRD_PARTY_URL_MAX);
  if (!text || !isHttpsUrl(text)) return undefined;
  return text;
}

function sanitizeSlug(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, THIRD_PARTY_ID_MAX);
}

function sanitizeImportKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const key = raw.trim();
  if (!key) return "";
  return (THIRD_PARTY_IMPORT_KEYS as readonly string[]).includes(key)
    ? key
    : "";
}

function sanitizeUrls(raw: unknown): ThirdPartyClientItem["urls"] {
  const o = asObject(raw);
  const urls: ThirdPartyClientItem["urls"] = {};
  for (const platform of THIRD_PARTY_CLIENT_PLATFORMS) {
    const url = sanitizeUrl(o[platform]);
    if (url) urls[platform] = url;
  }
  return urls;
}

export function parseThirdPartyClientsValue(
  raw: unknown,
): ThirdPartyClientsValue {
  const o = asObject(raw);
  const rows = Array.isArray(o.clients) ? o.clients : [];
  const seen = new Set<string>();
  const clients: ThirdPartyClientItem[] = [];

  for (const [index, row] of rows.entries()) {
    if (clients.length >= THIRD_PARTY_CLIENTS_MAX) break;
    const item = asObject(row);
    let id = sanitizeSlug(item.id);
    if (!id) continue;
    if (seen.has(id)) id = `${id}-${index + 1}`.slice(0, THIRD_PARTY_ID_MAX);
    if (seen.has(id) || !slugRe.test(id)) continue;
    seen.add(id);

    const nameI18n = normalizeAppCopyI18n(item.name_i18n, THIRD_PARTY_NAME_MAX);
    if (!nameI18n.zh?.trim()) continue;

    const sortRaw =
      typeof item.sort === "number" ? item.sort : Number(item.sort);
    const sort = Number.isInteger(sortRaw)
      ? Math.min(9999, Math.max(0, sortRaw))
      : (index + 1) * 10;

    clients.push({
      id,
      enabled: item.enabled !== false,
      featured: item.featured === true,
      paid: item.paid === true,
      sort,
      import_key: sanitizeImportKey(item.import_key),
      name_i18n: nameI18n,
      summary_i18n: normalizeAppCopyI18n(
        item.summary_i18n,
        THIRD_PARTY_SUMMARY_MAX,
      ),
      tip_i18n: normalizeAppCopyI18n(item.tip_i18n, THIRD_PARTY_TIP_MAX),
      urls: sanitizeUrls(item.urls),
    });
  }

  clients.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  return thirdPartyClientsValueSchema.parse({ clients });
}

export async function getThirdPartyClientsConfig(projectId: string): Promise<{
  enabled: boolean;
  value: ThirdPartyClientsValue;
  remark: string | null;
  stored: boolean;
}> {
  const row = await getProjectSetting(
    projectId,
    SETTING_KEYS.THIRD_PARTY_CLIENTS,
  );
  if (!row) {
    return {
      enabled: true,
      value: DEFAULT_THIRD_PARTY_CLIENTS_VALUE,
      remark: null,
      stored: false,
    };
  }
  return {
    enabled: row.enabled,
    value: parseThirdPartyClientsValue(row.value),
    remark: row.remark,
    stored: true,
  };
}

export async function upsertThirdPartyClientsConfig(input: {
  projectId: string;
  enabled: boolean;
  value: ThirdPartyClientsValue;
  remark?: string | null;
}) {
  const value = parseThirdPartyClientsValue(input.value);
  await upsertProjectSetting({
    projectId: input.projectId,
    key: SETTING_KEYS.THIRD_PARTY_CLIENTS,
    value,
    enabled: input.enabled,
    remark: input.remark ?? null,
  });
  return { enabled: input.enabled, value };
}

export type PublicThirdPartyClient = {
  id: string;
  featured: boolean;
  paid: boolean;
  import_key: string | null;
  name: string;
  summary: string;
  tip: string;
  urls: Partial<
    Record<
      ThirdPartyClientPlatform,
      { url: string; channel: ThirdPartyDownloadChannel }
    >
  >;
};

export async function listPublicThirdPartyClients(input: {
  projectCode?: string | null;
  siteHost?: string | null;
  locale?: string | null;
  platform?: string | null;
}): Promise<{ items: PublicThirdPartyClient[] }> {
  const source = await resolveSource({
    siteHost: input.siteHost,
    projectCode: input.projectCode,
  });
  const cfg = await getThirdPartyClientsConfig(source.projectId);
  if (!cfg.enabled) return { items: [] };

  const platform = input.platform?.trim().toLowerCase() || "";
  const wanted = THIRD_PARTY_CLIENT_PLATFORMS.includes(
    platform as ThirdPartyClientPlatform,
  )
    ? (platform as ThirdPartyClientPlatform)
    : null;

  const items: PublicThirdPartyClient[] = [];
  for (const client of cfg.value.clients) {
    if (!client.enabled) continue;
    const urls: PublicThirdPartyClient["urls"] = {};
    for (const key of THIRD_PARTY_CLIENT_PLATFORMS) {
      const url = client.urls[key];
      if (!url) continue;
      urls[key] = { url, channel: inferThirdPartyDownloadChannel(url) };
    }
    if (!Object.keys(urls).length) continue;
    if (wanted && !urls[wanted]) continue;
    const name = pickAppCopy(client.name_i18n, input.locale).text?.trim();
    if (!name) continue;
    items.push({
      id: client.id,
      featured: client.featured,
      paid: client.paid,
      import_key: client.import_key || null,
      name,
      summary: pickAppCopy(client.summary_i18n, input.locale).text?.trim() || "",
      tip: pickAppCopy(client.tip_i18n, input.locale).text?.trim() || "",
      urls,
    });
  }
  return { items };
}
