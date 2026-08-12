import { clearToken, getToken } from "./auth";
import { getTelegramWebApp } from "./telegram";

function clientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "x-habibi-client": "h5",
    "x-habibi-shell": "telegram_mini_app",
    "x-habibi-app-version": "tg-mini",
  };
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) headers["x-habibi-timezone"] = tz;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    headers["x-habibi-locale"] = navigator.language;
  }
  const platform = getTelegramWebApp()?.platform;
  if (platform) headers["x-habibi-platform"] = platform;
  return headers;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...clientHeaders(),
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? "invalid_json" : `http.${res.status}`);
    }
  }

  if (res.status === 401) {
    clearToken();
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: unknown }).error
        : null;
    throw new Error(typeof err === "string" ? err : `http.${res.status}`);
  }
  return data as T;
}
