"use client";

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

type TelegramBackButton = {
  isVisible?: boolean;
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
};

type TelegramWebAppLike = {
  initData?: string;
  platform?: string;
  initDataUnsafe?: { user?: TgUser; start_param?: string };
  themeParams?: { bg_color?: string; button_color?: string };
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink?: (url: string) => void;
  BackButton?: TelegramBackButton;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  /** Ask user to allow bot DMs (shows “允许发消息给我”). */
  requestWriteAccess?: (cb?: (granted: boolean) => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
};

const SHELL_BG = "#0c0b0a";

function getSdk(): TelegramWebAppLike | null {
  if (typeof window === "undefined") return null;
  const fromWindow = (
    window as Window & { Telegram?: { WebApp?: TelegramWebAppLike } }
  ).Telegram?.WebApp;
  if (fromWindow) return fromWindow;
  return null;
}

export function isTelegramWebApp(): boolean {
  const app = getSdk();
  return Boolean(app?.initData || app?.platform);
}

export function getTelegramWebApp() {
  return getSdk();
}

export function getTelegramUser(): TgUser | null {
  const user = getSdk()?.initDataUnsafe?.user;
  if (!user?.id) return null;
  return user;
}

export function getTelegramInitData(): string {
  return getSdk()?.initData || "";
}

export function getTelegramStartParam(): string {
  const fromSdk = getSdk()?.initDataUnsafe?.start_param?.trim();
  if (fromSdk) return fromSdk;
  try {
    return (
      new URLSearchParams(window.location.search).get("tgWebAppStartParam")?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

/** Expand viewport + force dark shell; safe outside Telegram. */
export function bootTelegramWebApp() {
  const app = getSdk();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    app.disableVerticalSwipes?.();
    app.setHeaderColor(SHELL_BG);
    app.setBackgroundColor(SHELL_BG);
  } catch {
    /* ignore */
  }
}

export function openExternal(url: string) {
  const app = getSdk();
  if (!url) return;
  try {
    if (app?.openLink) {
      app.openLink(url);
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Open t.me / Telegram links inside the client when possible. */
export function openTelegramUrl(url: string) {
  if (!url) return;
  const app = getSdk();
  try {
    if (app?.openTelegramLink && /^https?:\/\/(t\.me|telegram\.me)\//i.test(url)) {
      app.openTelegramLink(url);
      return;
    }
  } catch {
    /* fall through */
  }
  openExternal(url);
}

/** Share via Telegram native share sheet when possible. */
export function shareInvite(url: string, text: string) {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const app = getSdk();
  try {
    if (app?.openTelegramLink) {
      app.openTelegramLink(shareUrl);
      return;
    }
  } catch {
    /* fall through */
  }
  openExternal(shareUrl);
}

export function haptic(style: "light" | "medium" | "heavy" = "medium") {
  try {
    getSdk()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

export function hapticSuccess() {
  try {
    getSdk()?.HapticFeedback?.notificationOccurred?.("success");
  } catch {
    /* ignore */
  }
}

/** Promise wrapper for requestWriteAccess (false if unsupported / denied). */
export function requestWriteAccess(): Promise<boolean> {
  const app = getSdk();
  if (!app?.requestWriteAccess) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      app.requestWriteAccess!((granted) => resolve(Boolean(granted)));
    } catch {
      resolve(false);
    }
  });
}
