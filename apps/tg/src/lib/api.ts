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

function isBootstrapPath(path: string) {
  return path.includes("/auth/bootstrap");
}

function errorFromBody(data: unknown, status: number): Error {
  const err =
    data && typeof data === "object" && "error" in data
      ? (data as { error?: unknown }).error
      : null;
  return new Error(typeof err === "string" ? err : `http.${status}`);
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  if (!isBootstrapPath(path) && !getToken()) {
    const { ensureSession } = await import("./session");
    await ensureSession();
  }

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

  if (res.status === 401 && !isBootstrapPath(path) && !retried) {
    const { refreshSession } = await import("./session");
    const next = await refreshSession();
    if (next) return apiFetch<T>(path, init, true);
    clearToken();
    throw errorFromBody(data, res.status);
  }

  if (res.status === 401) {
    clearToken();
  }
  if (!res.ok) {
    throw errorFromBody(data, res.status);
  }
  return data as T;
}
