import { getTelegramWebApp, getTelegramUser } from "./telegram";

/** Map Telegram WebApp.platform → OS label used in auth events. */
function osFromTelegramPlatform(platform?: string | null): {
  osName: string | null;
  osVersion: string | null;
} {
  const p = (platform || "").toLowerCase();
  if (p === "ios") return { osName: "iOS", osVersion: null };
  if (p === "android" || p === "android_x") return { osName: "Android", osVersion: null };
  if (p === "macos") return { osName: "macOS", osVersion: null };
  if (p === "tdesktop" || p === "unigram") {
    // Desktop Telegram — refine via UA below
    return { osName: null, osVersion: null };
  }
  if (p === "weba" || p === "webk" || p === "web") {
    return { osName: null, osVersion: null };
  }
  return { osName: null, osVersion: null };
}

function parseOsFromUserAgent(ua: string): {
  osName: string | null;
  osVersion: string | null;
} {
  const ios =
    ua.match(/(?:iPhone|iPad|iPod).*OS (\d+[._]\d+(?:[._]\d+)?)/i) ||
    ua.match(/CPU (?:iPhone )?OS (\d+[._]\d+(?:[._]\d+)?)/i);
  if (ios) {
    return { osName: "iOS", osVersion: ios[1]!.replace(/_/g, ".") };
  }

  const android = ua.match(/Android (\d+(?:\.\d+)*)/i);
  if (android) {
    return { osName: "Android", osVersion: android[1]! };
  }

  const mac = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/i);
  if (mac) {
    return { osName: "macOS", osVersion: mac[1]!.replace(/_/g, ".") };
  }

  const win = ua.match(/Windows NT (\d+\.\d+)/i);
  if (win) {
    const map: Record<string, string> = {
      "10.0": "10/11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
    };
    const nt = win[1]!;
    return { osName: "Windows", osVersion: map[nt] || nt };
  }

  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    return { osName: "Linux", osVersion: null };
  }
  return { osName: null, osVersion: null };
}

export type TgClientMeta = {
  device_id: string;
  timezone?: string;
  locale?: string;
  os_name?: string;
  os_version?: string;
  app_version: string;
  /** Shell / entry — not OS (stored in auth event meta) */
  shell: string;
  /** Telegram WebApp.platform raw value */
  platform?: string;
};

/** Rich client_meta for bootstrap / auth so admin login log has OS + timezone. */
export function buildTgClientMeta(deviceId: string): TgClientMeta {
  const app = getTelegramWebApp();
  const platform = app?.platform || undefined;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const fromTg = osFromTelegramPlatform(platform);
  const fromUa = parseOsFromUserAgent(ua);

  const osName = fromUa.osName || fromTg.osName || undefined;
  const osVersion = fromUa.osVersion || fromTg.osVersion || undefined;

  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    timezone = undefined;
  }

  const tgUser = getTelegramUser();
  const locale =
    (typeof navigator !== "undefined" ? navigator.language : undefined) ||
    tgUser?.language_code ||
    undefined;

  return {
    device_id: deviceId,
    timezone,
    locale,
    os_name: osName,
    os_version: osVersion,
    app_version: "tg-mini",
    shell: "telegram_mini_app",
    platform: platform || undefined,
  };
}
