export type WireRawCustomerPlan = {
  code: string;
  name: string;
  type?: string;
  data_limit_bytes?: number;
  validity_seconds?: number;
  online_ip_limit?: number;
  protocols?: string[];
  price_monthly_cents?: number;
  enabled?: boolean;
};

export type WireRawCustomerView = {
  end_user: {
    id: string;
    username: string;
    status?: string;
    expires_at?: string | null;
    used_traffic_bytes?: number;
    online_ip_limit?: number;
    next_plan_ref?: string | null;
    current_bandwidth_plan_ref?: string | null;
    next_bandwidth_plan_ref?: string | null;
    online_at?: string | null;
    online_since?: string | null;
    online_seconds?: number | null;
    current_node?: {
      id: string;
      name: string;
      region: string;
    } | null;
    source_ips?: string[] | null;
    source_ip_history?: Array<{
      ip?: string;
      source_ip?: string;
      observed_at?: string;
    }> | null;
    last_source_ip?: string | null;
  };
  subscription_url?: string | null;
  uuid?: string;
  password?: string;
  online_device_count?: number;
  inbounds?: Record<string, string[]>;
  creds_by_protocol?: Record<string, unknown>;
};

export type WireRawUpsertCustomerInput = {
  id?: string;
  username: string;
  next_plan_ref?: string;
  expire_at?: string;
  validity_seconds?: number;
  data_limit_bytes?: number;
  online_ip_limit?: number;
  status?: "active" | "disabled" | "pending";
  note?: string;
  email?: string;
  current_bandwidth_plan_ref?: string;
  next_bandwidth_plan_ref?: string;
  reset_policy?: string;
  custom_reset_interval?: string;
};

export type WireRawExtendInput = {
  expires_at?: string;
  validity_seconds?: number;
  additional_bytes?: number;
  note?: string;
};

export type WireRawDialInput = {
  region?: string;
  mode?: "region" | "smart" | string;
  sticky?: boolean;
  username?: string;
  limit?: number;
};

export type WireRawNode = {
  name: string;
  region: string;
  status?: string;
  public_ip?: string;
  advertise_host?: string;
  active_customers?: number;
  current_mbps_up?: number;
  current_mbps_down?: number;
};
