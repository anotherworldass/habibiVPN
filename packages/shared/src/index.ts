/** Shared API path prefixes */
export const USER_API_PREFIX = "/api/v1";
export const ADMIN_API_PREFIX = "/admin/v1";

export type ApiErrorBody = {
  error: string;
  message?: string;
  request_id?: string;
};

export type SubscriptionView = {
  status: "none" | "active" | "expired" | "disabled";
  expires_at: string | null;
  used_traffic_bytes: number | null;
  data_limit_bytes: number | null;
  subscription_url: string | null;
  online_ip_limit: number | null;
};

export type PlanView = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  /** Upstream WireRaw customer plan code, if mapped */
  upstream_plan_ref?: string | null;
  validity_seconds?: number | null;
  data_limit_bytes?: number | null;
  enabled: boolean;
};
