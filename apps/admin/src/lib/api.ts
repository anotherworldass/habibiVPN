import { clearSession, getToken } from "./auth";
import { getProjectId } from "./project";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function adminFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const projectId = getProjectId();
  if (projectId) headers["X-Admin-Project-Id"] = projectId;

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 401 && path !== "/admin/v1/auth/login") {
    clearSession();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    const err =
      (typeof data?.message === "string" && data.message.trim()) ||
      (typeof data?.error === "string" && data.error.trim()) ||
      (typeof data?.detail === "string" && data.detail.trim()) ||
      `http.${res.status}`;
    throw new ApiError(err, res.status, data);
  }
  return data as T;
}

/** Normalize WireRaw list envelopes: items | customers | plans | nodes | array */
export function unwrapList<T>(data: unknown, keys: string[] = ["items", "customers", "plans", "nodes"]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
