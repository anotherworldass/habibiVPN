/** Public copy & links for Telegram Mini App */
export const site = {
  brand: "TiTiVPN",
  slogan: "随时连上，快速访问",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@tizi.work",
  /** Optional override; otherwise use this Mini App bot (see supportTelegramUrl) */
  supportTelegram: process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM || "",
  botUsername: (process.env.NEXT_PUBLIC_TG_BOT_USERNAME || "").replace(
    /^@/,
    "",
  ),
  website: process.env.NEXT_PUBLIC_WEBSITE_URL || "",
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL || "#",
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL || "#",
  androidApkUrl: process.env.NEXT_PUBLIC_ANDROID_APK_URL || "#",
  windowsUrl: process.env.NEXT_PUBLIC_WINDOWS_URL || "#",
  macosUrl: process.env.NEXT_PUBLIC_MACOS_URL || "#",
};

const BOT_USER_KEY = "habibi_tg_bot_username";

export function isPlaceholderUrl(url: string) {
  return !url || url === "#";
}

/** Persist bot username from /telegram/bind for support deep-link. */
export function saveBotUsername(username: string | null | undefined) {
  if (typeof window === "undefined" || !username) return;
  const u = username.replace(/^@/, "").trim();
  if (!u) return;
  try {
    localStorage.setItem(BOT_USER_KEY, u);
  } catch {
    /* ignore */
  }
}

export function getBotUsername(): string {
  if (site.botUsername) return site.botUsername;
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(BOT_USER_KEY)?.replace(/^@/, "").trim() || "";
  } catch {
    return "";
  }
}

/** TG 客服 = 当前小程序 Bot（或 env 覆盖） */
export function supportTelegramUrl(): string {
  if (site.supportTelegram) return site.supportTelegram.trim();
  const bot = getBotUsername();
  return bot ? `https://t.me/${bot}` : "";
}

const CHANNEL_URL_KEY = "habibi_tg_channel_url";

export function getCachedChannelUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(CHANNEL_URL_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function cacheChannelUrl(url: string | null | undefined) {
  if (typeof window === "undefined") return;
  const v = (url || "").trim();
  try {
    if (v) localStorage.setItem(CHANNEL_URL_KEY, v);
    else localStorage.removeItem(CHANNEL_URL_KEY);
  } catch {
    /* ignore */
  }
}

export type TelegramPublicConfig = {
  channel_url: string;
  invite_share_text: string;
  bot_username: string;
};

/** Fetch public telegram config for Mini App (channel, invite share copy). */
export async function fetchTelegramPublicConfig(): Promise<TelegramPublicConfig> {
  const empty: TelegramPublicConfig = {
    channel_url: getCachedChannelUrl(),
    invite_share_text: "",
    bot_username: "",
  };
  try {
    const res = await fetch("/api/v1/telegram/config", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      channel_url?: string | null;
      invite_share_text?: string | null;
      bot_username?: string | null;
    };
    if (data.bot_username) saveBotUsername(data.bot_username);
    const url = (data.channel_url || "").trim();
    cacheChannelUrl(url || null);
    return {
      channel_url: url,
      invite_share_text: (data.invite_share_text || "").trim(),
      bot_username: (data.bot_username || "").trim(),
    };
  } catch {
    return empty;
  }
}

export async function fetchTelegramChannelUrl(): Promise<string> {
  const cfg = await fetchTelegramPublicConfig();
  return cfg.channel_url;
}

/** Single download entry for Mini App — prefer dedicated URL, else website /download */
export function appDownloadUrl() {
  const dedicated = process.env.NEXT_PUBLIC_DOWNLOAD_URL || "";
  if (dedicated && !isPlaceholderUrl(dedicated)) return dedicated;
  if (site.website) {
    return `${site.website.replace(/\/$/, "")}/download`;
  }
  return "#";
}
