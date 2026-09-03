import { randomUUID } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { env } from "../config.js";

/** Fail fast so user requests do not hang on a wedged upstream port. */
export const WIRERAW_TIMEOUT_MS = 10_000;

export class WireRawError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
    public readonly requestId?: string,
  ) {
    super(`WireRaw ${status}: ${code}`);
    this.name = "WireRawError";
  }
}

export type WireRawRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  idempotencyKey?: string;
};

const proxyDispatcher = env.WIRERAW_HTTP_PROXY
  ? new ProxyAgent(env.WIRERAW_HTTP_PROXY)
  : undefined;

function buildUrl(path: string, query?: WireRawRequestOptions["query"]): string {
  const base = env.WIRERAW_HOST.replace(/\/$/, "");
  const url = new URL(path.startsWith("http") ? path : `${base}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function errName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name?: unknown }).name || "");
  }
  return "";
}

function errCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code || "");
  }
  return "";
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_ABORTED",
  "UND_ERR_SOCKET",
]);

export function isAbortOrNetworkError(err: unknown): boolean {
  const name = errName(err);
  if (name === "TimeoutError" || name === "AbortError") return true;
  const code = errCode(err);
  if (NETWORK_CODES.has(code)) return true;
  const msg = errMessage(err).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("network")
  );
}

/** Transient control-plane failures that should be retried / served stale. */
export function isRetryableUpstreamError(err: unknown): boolean {
  if (err instanceof WireRawError) {
    if (
      err.code === "upstream.unavailable" ||
      err.code === "upstream.timeout"
    ) {
      return true;
    }
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return isAbortOrNetworkError(err);
}

function wrapTransportError(err: unknown, requestId: string): WireRawError {
  if (err instanceof WireRawError) return err;
  const timeout =
    errName(err) === "TimeoutError" ||
    errName(err) === "AbortError" ||
    (NETWORK_CODES.has(errCode(err)) && errCode(err).includes("TIMEOUT"));
  return new WireRawError(
    503,
    timeout ? "upstream.timeout" : "upstream.unavailable",
    { message: errMessage(err), code: errCode(err) || undefined },
    requestId,
  );
}

export async function wirerawRequest<T = unknown>(
  options: WireRawRequestOptions,
): Promise<T> {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    "X-Wireraw-Key-ID": env.WIRERAW_KEY_ID,
    "X-Wireraw-Key-Secret": env.WIRERAW_KEY_SECRET,
    "X-Request-ID": requestId,
    Accept: "application/json",
  };

  const method = options.method ?? (options.body ? "POST" : "GET");
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(buildUrl(options.path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(WIRERAW_TIMEOUT_MS),
      ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
    });
  } catch (err) {
    throw wrapTransportError(err, requestId);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const code =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `http.${res.status}`;
    throw new WireRawError(res.status, code, data, requestId);
  }

  return data as T;
}

/** Convenience wrappers for Phase 0–1 */
export const wireraw = {
  listCustomerPlans: () =>
    wirerawRequest<{ plans?: unknown[] } | unknown[]>({
      path: "/v1/proxy/customer-plans",
    }),

  listCustomers: (query?: {
    limit?: number;
    offset?: number;
    q?: string;
    status?: string;
  }) =>
    wirerawRequest({
      path: "/v1/proxy/customers",
      query,
    }),

  getCustomer: (id: string) =>
    wirerawRequest({ path: `/v1/proxy/customers/${id}` }),

  getCustomerByUsername: (username: string) =>
    wirerawRequest({
      path: "/v1/proxy/customers/by-username",
      query: { username },
    }),

  upsertCustomer: (body: Record<string, unknown>) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/customers",
      body,
    }),

  extendSubscription: (
    id: string,
    body: {
      expires_at?: string;
      validity_seconds?: number;
      additional_bytes?: number;
      note?: string;
    },
  ) =>
    wirerawRequest({
      method: "POST",
      path: `/v1/proxy/customers/${id}/subscription/extend`,
      body,
    }),

  revokeSubscription: (id: string) =>
    wirerawRequest({
      method: "POST",
      path: `/v1/proxy/customers/${id}/subscription/revoke`,
    }),

  renewCustomer: (id: string) =>
    wirerawRequest({
      method: "POST",
      path: `/v1/proxy/customers/${id}/renew`,
    }),

  refreshSubscription: (userId: string) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/subscriptions/refresh",
      body: { user_id: userId },
    }),

  /** Rendered subscription payload (merchant-auth). Body is base64 bytes. */
  getSubscription: (userId: string, format?: string) =>
    wirerawRequest<{
      available_formats?: string[];
      payload?: { ContentType?: string; Body?: string };
    }>({
      path: `/v1/proxy/subscriptions/${userId}`,
      query: format ? { format } : undefined,
    }),

  listOnlineUsernames: (query?: { limit?: number; offset?: number }) =>
    wirerawRequest({
      path: "/v1/proxy/customers/online",
      query,
    }),

  bulkStatus: (body: {
    usernames?: string[];
    ids?: string[];
    status: "active" | "disabled";
  }) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/customers/bulk-status",
      body,
    }),

  bulkExtend: (body: {
    usernames?: string[];
    ids?: string[];
    validity_seconds?: number;
    additional_bytes?: number;
  }) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/customers/bulk-extend",
      body,
    }),

  bulkRevoke: (body: { usernames?: string[]; ids?: string[] }) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/customers/bulk-revoke",
      body,
    }),

  batchLookup: (body: { usernames?: string[]; ids?: string[] }) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/customers/batch-lookup",
      body,
    }),

  listNodes: () => wirerawRequest({ path: "/v1/proxy/nodes" }),

  listNodeLinks: (region?: string) =>
    wirerawRequest({
      path: "/v1/proxy/nodes/links",
      query: region ? { region } : undefined,
    }),

  dial: (body: {
    region?: string;
    mode?: string;
    sticky?: boolean;
    username?: string;
    limit?: number;
  }) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/dial",
      body,
    }),

  trafficSummary: (query?: {
    since?: string;
    until?: string;
    customer_id?: string;
    granularity?: "day" | "month";
  }) =>
    wirerawRequest({
      path: "/v1/proxy/customers/traffic/summary",
      query,
    }),

  getMerchant: (id: string) =>
    wirerawRequest({ path: `/v1/proxy/merchants/${id}` }),

  listBandwidthPlans: () =>
    wirerawRequest({ path: "/v1/proxy/merchant-bandwidth-plans" }),

  upsertBandwidthPlan: (body: Record<string, unknown>) =>
    wirerawRequest({
      method: "POST",
      path: "/v1/proxy/merchant-bandwidth-plans",
      body,
    }),

  deleteBandwidthPlan: (id: string) =>
    wirerawRequest({
      method: "DELETE",
      path: `/v1/proxy/merchant-bandwidth-plans/${id}`,
    }),

  listSdkKeys: () => wirerawRequest({ path: "/v1/platform/sdk-keys" }),
};
