import { apiFetch } from "./api";

const GUEST_TOKEN_KEY = "habibi_support_guest";

export function getSupportGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GUEST_TOKEN_KEY);
}

export function setSupportGuestToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_TOKEN_KEY, token);
}

export type SupportEntry = "h5" | "app";

let supportEntry: SupportEntry = "h5";

/** Optional overrides from App deep-link query (/chat?from=app&os_name=…). */
let queryClientMeta: Record<string, string | null> = {};

/** Set before opening /chat from App WebView (also via ?from=app). */
export function setSupportEntry(entry: SupportEntry) {
  supportEntry = entry === "app" ? "app" : "h5";
}

export function getSupportEntry(): SupportEntry {
  return supportEntry;
}

/** Call once on /chat boot so session/messages carry native client fields. */
export function setSupportQueryClientMeta(
  meta: Record<string, string | null | undefined>,
) {
  const next: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    const v = (value ?? "").trim();
    next[key] = v ? v.slice(0, 128) : null;
  }
  queryClientMeta = next;
}

export function clientMetaBody() {
  let timezone: string | null = null;
  let locale: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    locale = navigator.language;
  }
  const q = queryClientMeta;
  const entryRaw = (q.entry || "").toLowerCase();
  const entry: SupportEntry =
    entryRaw === "app" || supportEntry === "app" ? "app" : "h5";
  return {
    timezone,
    locale: q.locale || locale,
    entry,
    os_name: q.os_name || null,
    os_version: q.os_version || null,
    app_version: q.app_version || null,
    platform: q.platform || null,
    shell: q.shell || (entry === "app" ? "app" : null),
    device_id: q.device_id || null,
  };
}

function supportHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const guest = getSupportGuestToken();
  if (guest) headers["x-support-guest-token"] = guest;
  return headers;
}

/** Prefer same-origin /api path so Next rewrite serves the image. */
export function supportMediaSrc(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname.startsWith("/api/")) return `${u.pathname}${u.search}`;
  } catch {
    /* ignore */
  }
  return url;
}

export type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  source: string;
  content_type: string;
  text: string | null;
  media_url?: string | null;
  recalled_at?: string | null;
  recallable?: boolean;
  created_at: string;
  /** Stable React key for optimistic → server replace (avoids image remount flash). */
  local_key?: string;
  /** Client-only: image still uploading / sending. */
  uploading?: boolean;
};

export async function supportSession() {
  const res = await apiFetch<{
    guest_token: string;
    conversation_id: string;
    guest_id: string;
    user_id: string | null;
    created: boolean;
  }>("/api/v1/support/web/session", {
    method: "POST",
    headers: supportHeaders(),
    body: JSON.stringify({ client_meta: clientMetaBody() }),
  });
  if (res.guest_token) setSupportGuestToken(res.guest_token);
  return res;
}

export async function supportFetchMessages(after?: string) {
  // Latest-N is enforced server-side via 系统设置 support.client_message_window.
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";
  const res = await apiFetch<{
    guest_token: string;
    conversation_id: string;
    message_window_size?: number;
    items: SupportMessage[];
  }>(`/api/v1/support/web/messages${qs}`, {
    headers: supportHeaders(),
  });
  if (res.guest_token) setSupportGuestToken(res.guest_token);
  return res;
}

export async function supportUploadImage(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
  const res = await apiFetch<{
    guest_token: string;
    media_url: string;
    mime: string;
  }>("/api/v1/support/web/upload", {
    method: "POST",
    headers: supportHeaders(),
    body: JSON.stringify({
      image: dataUrl,
      mime: file.type || undefined,
      client_meta: clientMetaBody(),
    }),
  });
  if (res.guest_token) setSupportGuestToken(res.guest_token);
  return res;
}

export async function supportSendMessage(input: {
  text?: string;
  media_url?: string;
}) {
  const res = await apiFetch<{
    guest_token: string;
    conversation_id: string;
    message: SupportMessage;
  }>("/api/v1/support/web/messages", {
    method: "POST",
    headers: supportHeaders(),
    body: JSON.stringify({
      text: input.text,
      media_url: input.media_url,
      content_type: input.media_url ? "image" : "text",
      client_meta: clientMetaBody(),
    }),
  });
  if (res.guest_token) setSupportGuestToken(res.guest_token);
  return res;
}

/** Bind guest conversation to logged-in user (call after login/register). */
export async function bindSupportSession(): Promise<void> {
  try {
    await supportSession();
  } catch {
    /* non-blocking */
  }
}

export async function supportRecallMessage(messageId: string) {
  const res = await apiFetch<SupportMessage>(
    `/api/v1/support/web/messages/${encodeURIComponent(messageId)}/recall`,
    {
      method: "POST",
      headers: supportHeaders(),
    },
  );
  return res;
}
