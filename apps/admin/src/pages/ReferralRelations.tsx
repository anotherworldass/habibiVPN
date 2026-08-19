import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProTable,
} from "@ant-design/pro-components";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  EntitlementLedgerDetailModal,
  type EntitlementLedgerDetailRow,
} from "../components/EntitlementLedgerDetailModal";
import { CopyableUrlWithQr } from "../components/CopyableUrlWithQr";
import { adminFetch, unwrapList } from "../lib/api";

type RelationListItem = {
  id: string;
  uid?: number;
  email?: string | null;
  invite_code: string;
  invited_by_id?: string | null;
  promo_enabled: boolean;
  status: string;
  admin_remark?: string | null;
  created_at: string;
  invite_count: number;
  promo_group?: { id: string; name: string; code: string } | null;
  inviter?: {
    id: string;
    uid?: number;
    email?: string | null;
    invite_code: string;
  } | null;
  wallet?: {
    available_cents: number;
    pending_cents: number;
    withdrawn_cents: number;
    frozen_cents: number;
    spent_cents?: number;
  } | null;
};

type RelationRes = {
  user: {
    id: string;
    uid?: number;
    email?: string | null;
    emailVerifiedAt?: string | null;
    inviteCode: string;
    invitedById?: string | null;
    promoEnabled: boolean;
    promoGroupId?: string;
    status: string;
    adminRemark?: string | null;
    createdAt: string;
    sourceClient?: string | null;
    connectMode?: "unset" | "official_app" | "subscription_client";
    connectClients?: string[];
    connectPrefSource?: string | null;
    connectPrefAt?: string | null;
    sourceSite?: { id: string; name: string; host: string } | null;
    sourcePackage?: {
      id: string;
      name: string;
      packageName: string;
      client?: string | null;
    } | null;
    promoWallet?: {
      availableCents: number;
      pendingCents: number;
      withdrawnCents: number;
      frozenCents: number;
      spentCents?: number;
    } | null;
    promoGroup?: { id: string; name: string; code: string } | null;
    inviter?: {
      id: string;
      uid?: number;
      email?: string | null;
      inviteCode: string;
    } | null;
  };
  upline: Array<{
    level: number;
    user_id: string;
    email?: string | null;
    invite_code: string;
    status: string;
  }>;
  downline_by_level: Record<string, number>;
  groups: Array<{ id: string; name: string; code: string; enabled: boolean }>;
  invite_env?: InviteEnvCompare | null;
  direct_invitees_env?: DirectInviteeEnvRow[];
};

type InviteEnvFlag = "same_device" | "same_ip" | "similar_env";

type InviteEnvCompare = {
  flags: InviteEnvFlag[];
  shared_ips: string[];
  shared_device_count: number;
  similar: {
    timezone: string;
    locale: string;
    os_name: string;
    ua_stem: string;
  } | null;
  event_count_a: number;
  event_count_b: number;
};

type DirectInviteeEnvRow = {
  id: string;
  uid?: number;
  email?: string | null;
  invite_code: string;
  created_at: string;
  invite_env: InviteEnvCompare;
};

function inviteEnvFlagTags(flags: InviteEnvFlag[]) {
  return flags.map((f) => {
    if (f === "same_device") {
      return (
        <Tag key={f} color="error">
          同设备
        </Tag>
      );
    }
    if (f === "same_ip") {
      return (
        <Tag key={f} color="warning">
          同 IP
        </Tag>
      );
    }
    return (
      <Tag key={f} color="blue">
        环境相似
      </Tag>
    );
  });
}

function inviteEnvEvidence(env: InviteEnvCompare): string {
  const parts: string[] = [];
  if (env.shared_device_count > 0) {
    parts.push(`同设备哈希 ×${env.shared_device_count}`);
  }
  if (env.shared_ips.length) parts.push(`IP ${env.shared_ips.join("、")}`);
  if (env.similar) {
    parts.push(
      `${env.similar.timezone} · ${env.similar.locale} · ${env.similar.os_name} · ${env.similar.ua_stem}`,
    );
  }
  if (!env.event_count_a || !env.event_count_b) {
    parts.push("一方缺少认证记录");
  }
  return parts.join("；") || "—";
}

type ClientUrls = {
  clash_meta?: string;
  hiddify?: string;
  v2ray?: string;
  shadowrocket?: string;
  surge?: string;
  quantumult_x?: string;
};

const CLIENT_URL_LABELS: { key: keyof ClientUrls; label: string }[] = [
  { key: "clash_meta", label: "Mihomo / Clash Meta (YAML)" },
  { key: "hiddify", label: "Hiddify" },
  { key: "v2ray", label: "Xray / V2Ray (Base64)" },
  { key: "shadowrocket", label: "Shadowrocket" },
  { key: "surge", label: "Surge Profile" },
  { key: "quantumult_x", label: "Quantumult X" },
];

type SourceIpHistoryItem = {
  ip: string;
  observed_at?: string | null;
};

type SubscriptionSlot = {
  id: string;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  status: string;
  expires_at?: string | null;
  service_expires_at?: string | null;
  subscription_url?: string | null;
  client_urls?: ClientUrls | null;
  upstream_id?: string | null;
  upstream_username?: string;
  used_traffic_bytes?: number | null;
  data_limit_bytes?: number | null;
  online_ip_limit?: number | null;
  online_device_count?: number | null;
  subscription_online_devices?: number | null;
  online_at?: string | null;
  online_since?: string | null;
  online_seconds?: number | null;
  next_plan_ref?: string | null;
  current_bandwidth_plan_ref?: string | null;
  next_bandwidth_plan_ref?: string | null;
  bandwidth_policy?: {
    source?: string;
    up_mbps?: number | null;
    down_mbps?: number | null;
    editable?: boolean;
  } | null;
  current_node?: {
    id?: string;
    name?: string;
    region?: string;
  } | null;
  source_ips?: string[];
  source_ip_history?: SourceIpHistoryItem[];
  last_source_ip?: string | null;
  inbounds?: Record<string, string[]> | null;
  protocols?: string[];
  revoked_at?: string | null;
  last_fetch_agent?: string | null;
  available_formats?: string[];
  note?: string | null;
  last_synced_at?: string | null;
  fup?: {
    enabled?: boolean;
    throttled?: boolean;
    current_after_bytes?: number | null;
    current_bandwidth_plan_ref?: string | null;
    next_tier_after_bytes?: number | null;
    used_traffic_bytes?: number | null;
    next_reset_at?: string | null;
    tiers?: Array<{ after_bytes: number; bandwidth_plan_ref: string }>;
  } | null;
  fup_history?: Array<{
    id: string;
    created_at: string;
    from_ref?: string | null;
    to_ref?: string | null;
    used_traffic_bytes?: number | null;
    after_bytes?: number | null;
    reason?: string | null;
    actor_type?: string;
  }>;
};

function formatBytes(n?: number | null) {
  if (n == null) return "—";
  if (n === 0) return "不限";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = n / 1024 ** 2;
  return `${mb.toFixed(1)} MB`;
}

function formatTrafficPair(used?: number | null, limit?: number | null) {
  const u = used == null ? "—" : formatBytes(used);
  const l = limit == null || limit === 0 ? "∞" : formatBytes(limit);
  return `${u} / ${l}`;
}

function formatSubTime(v?: string | null) {
  if (!v) return "—";
  return v.slice(0, 19).replace("T", " ");
}

function formatOnlineSeconds(sec?: number | null) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const n = Math.trunc(sec);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const parts = [
    h > 0 ? `${h}h` : null,
    h > 0 || m > 0 ? `${m}m` : null,
    `${s}s`,
  ].filter(Boolean);
  return `${parts.join(" ")}（${n} 秒）`;
}

function formatInbounds(inbounds?: Record<string, string[]> | null) {
  if (!inbounds) return "—";
  const text = Object.entries(inbounds)
    .map(([proto, tags]) => `${proto}: ${(tags || []).join(", ")}`)
    .join(" / ");
  return text || "—";
}

function formatSourceIpHistory(
  history?: SourceIpHistoryItem[] | null,
  fallbackIps?: string[] | null,
) {
  const rows =
    Array.isArray(history) && history.length
      ? history
      : (fallbackIps || []).map((ip) => ({ ip, observed_at: null }));
  if (!rows.length) {
    return "暂无源 IP 历史（建立真实连接后采集，最多保留 8 个）";
  }
  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }}>
      {rows.map((row, idx) => (
        <Typography.Text key={`${row.ip}-${idx}`} copyable={{ text: row.ip }}>
          {row.ip}
          {row.observed_at ? (
            <Typography.Text type="secondary">
              {" "}
              {formatSubTime(row.observed_at)}
            </Typography.Text>
          ) : null}
        </Typography.Text>
      ))}
    </Space>
  );
}

function statusTagColor(status?: string) {
  if (status === "active") return "success";
  if (status === "expired") return "warning";
  if (status === "disabled") return "error";
  return "default";
}

type WalletLedgerRow = {
  id: string;
  entryType: string;
  availableDelta: number;
  pendingDelta: number;
  withdrawnDelta: number;
  frozenDelta: number;
  spentDelta: number;
  availableAfter: number;
  pendingAfter: number;
  withdrawnAfter: number;
  frozenAfter: number;
  spentAfter: number;
  refType?: string | null;
  refId?: string | null;
  remark?: string | null;
  createdAt: string;
};

type EntitlementLedgerRow = EntitlementLedgerDetailRow;

const ENTITLEMENT_FLAG_LABEL: Record<string, string> = {
  created: "开槽",
  renew: "续费",
  plan_change: "改套餐",
  traffic_adjust: "流量",
  expire_adjust: "到期",
  status_change: "状态",
  clawback: "扣回",
};

const ENTRY_LABEL: Record<string, string> = {
  commission_pending: "佣金入账(待结算)",
  commission_settle: "佣金结算",
  commission_invalidate_pending: "作废待结算",
  commission_clawback: "佣金追回",
  withdraw_hold: "提现扣款",
  withdraw_reject: "提现退回",
  withdraw_paid: "提现打款",
  spend_hold: "兑换扣款",
  spend_reject: "兑换退回",
  spend_fulfill: "兑换履约",
  freeze_set: "设置冻结",
};

const AUTH_EVENT_LABEL: Record<string, string> = {
  anonymous_bootstrap: "匿名开户",
  register: "注册",
  register_bind: "绑定邮箱",
  login: "登录",
  login_failed: "登录失败",
};

const CLIENT_LABEL: Record<string, string> = {
  h5: "H5",
  ios_appstore: "iOS App Store",
  ios_alt: "iOS 侧载",
  android_play: "Android Play",
  android_direct: "Android 直装",
  windows: "Windows",
  macos: "macOS",
};

function formatSourceClient(code?: string | null) {
  if (!code) return "—";
  return CLIENT_LABEL[code] ? `${CLIENT_LABEL[code]} (${code})` : code;
}

function formatConnectMode(mode?: string | null) {
  if (mode === "official_app") return "本站 App";
  if (mode === "subscription_client") return "订阅客户端（Shadowrocket 等）";
  if (mode === "unset") return "未设置";
  return "—";
}

function formatUserSource(user: RelationRes["user"]) {
  if (user.sourcePackage) {
    return `安装包：${user.sourcePackage.name} (${user.sourcePackage.packageName})`;
  }
  if (user.sourceSite) {
    return `站点：${user.sourceSite.name} (${user.sourceSite.host})`;
  }
  return null;
}

type AuthEventRow = {
  id: string;
  event_type: string;
  success: boolean;
  failure_reason?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  timezone?: string | null;
  locale?: string | null;
  client?: string | null;
  app_version?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  meta?: {
    shell?: string | null;
    platform?: string | null;
    [key: string]: unknown;
  } | null;
  created_at: string;
};

function formatAuthShell(meta?: AuthEventRow["meta"]) {
  if (!meta) return null;
  const shell = typeof meta.shell === "string" ? meta.shell : null;
  const platform = typeof meta.platform === "string" ? meta.platform : null;
  if (shell === "telegram_mini_app" || shell === "telegram") {
    return platform ? `TG Mini (${platform})` : "TG Mini";
  }
  if (shell && platform) return `${shell} · ${platform}`;
  return shell || platform || null;
}

type PaymentOrderRow = {
  id: string;
  amountCents: number;
  listPriceCents?: number | null;
  discountCents?: number;
  couponCode?: string | null;
  currency: string;
  status: string;
  commissionKind?: string;
  provider?: string | null;
  providerRef?: string | null;
  isTrialPeriod?: boolean;
  paidAt?: string | null;
  createdAt: string;
  failureReason?: string | null;
  plan?: { id: string; code: string; name: string } | null;
  paymentChannel?: { id: string; code: string; name: string } | null;
  _count?: { commissions: number };
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  provisioning: "开通中",
  provisioned: "已开通",
  failed: "失败",
  refunded: "已退款",
  cancelled: "已取消",
};

function orderStatusColor(status?: string) {
  if (status === "provisioned" || status === "paid") return "success";
  if (status === "pending" || status === "provisioning") return "processing";
  if (status === "failed" || status === "refunded") return "error";
  if (status === "cancelled") return "default";
  return "default";
}

type EntitlementRes = {
  ok: boolean;
  skipped?: string;
  error?: string;
  previous_expires_at?: string | null;
  new_expires_at?: string;
  clawback_seconds?: number;
  disabled?: boolean;
};

function formatEntitlementMsg(e?: EntitlementRes): string {
  if (!e) return "";
  if (!e.ok) {
    return `权益扣回失败：${e.error || "unknown"}（订单已退款，请手工改到期）`;
  }
  if (e.skipped === "no_slot") return "无对应订阅槽，未扣时长";
  if (e.skipped === "already_refunded") return "订单已退款，跳过权益扣回";
  const prev = e.previous_expires_at
    ? new Date(e.previous_expires_at).toLocaleString()
    : "—";
  const next = e.new_expires_at ? new Date(e.new_expires_at).toLocaleString() : "—";
  const secs =
    e.clawback_seconds != null ? `扣回 ${e.clawback_seconds} 秒 · ` : "";
  return `权益：${secs}到期 ${prev} → ${next}${e.disabled ? "（已禁用）" : ""}`;
}

function money(cents?: number) {
  return ((cents || 0) / 100).toFixed(2);
}

function signedMoney(cents: number) {
  if (!cents) return "—";
  const s = money(Math.abs(cents));
  return cents > 0 ? `+${s}` : `-${s}`;
}

export default function ReferralRelationsPage() {
  const { modal, message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const actionRef = useRef<ActionType>(undefined);
  const [userId, setUserId] = useState(searchParams.get("user") || "");
  const [data, setData] = useState<RelationRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [entitlementLedger, setEntitlementLedger] = useState<EntitlementLedgerRow[]>([]);
  const [entitlementLedgerTotal, setEntitlementLedgerTotal] = useState(0);
  const [entitlementLedgerLoading, setEntitlementLedgerLoading] = useState(false);
  const [entitlementDetail, setEntitlementDetail] =
    useState<EntitlementLedgerRow | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [inviteCodeDraft, setInviteCodeDraft] = useState("");
  const [inviteCodeSaving, setInviteCodeSaving] = useState(false);
  const [inviteCodeModalOpen, setInviteCodeModalOpen] = useState(false);
  const [groupEditValue, setGroupEditValue] = useState<string>();
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [inviterModalOpen, setInviterModalOpen] = useState(false);
  const [inviterDraft, setInviterDraft] = useState("");
  const [inviterSaving, setInviterSaving] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [subscriptionDrawerOpen, setSubscriptionDrawerOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionSlot[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [renewSlot, setRenewSlot] = useState<SubscriptionSlot | null>(null);
  const [renewForm] = Form.useForm<{
    plan_id?: string;
    upstream_plan_ref?: string;
    validity_days?: number;
    note?: string;
    keep_expires_at: boolean;
    keep_used_traffic: boolean;
  }>();
  const [planOptions, setPlanOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [upstreamPlanOptions, setUpstreamPlanOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [renewPreview, setRenewPreview] = useState<{
    before: Record<string, string | number | null>;
    after: Record<string, string | number | null>;
    warnings: string[];
  } | null>(null);
  const [renewPreviewLoading, setRenewPreviewLoading] = useState(false);
  const [renewSubmitting, setRenewSubmitting] = useState(false);
  const renewPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewPreviewSeq = useRef(0);
  const keepExpiresAtWatch = Form.useWatch("keep_expires_at", renewForm);
  const [authEvents, setAuthEvents] = useState<AuthEventRow[]>([]);
  const [authEventsTotal, setAuthEventsTotal] = useState(0);
  const [authEventsLoading, setAuthEventsLoading] = useState(false);
  const [orders, setOrders] = useState<PaymentOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);

  async function loadOrders(id: string) {
    setOrdersLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("user_id", id);
      qs.set("limit", "50");
      qs.set("offset", "0");
      const res = await adminFetch<{ items: PaymentOrderRow[]; total: number }>(
        `/admin/v1/referral/orders?${qs}`,
      );
      setOrders(res.items || []);
      setOrdersTotal(res.total || 0);
    } catch {
      setOrders([]);
      setOrdersTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadAuthEvents(id: string) {
    setAuthEventsLoading(true);
    try {
      const res = await adminFetch<{ items: AuthEventRow[]; total: number }>(
        `/admin/v1/users/${encodeURIComponent(id)}/auth-events?limit=50&offset=0`,
      );
      setAuthEvents(res.items || []);
      setAuthEventsTotal(res.total || 0);
    } catch {
      setAuthEvents([]);
      setAuthEventsTotal(0);
    } finally {
      setAuthEventsLoading(false);
    }
  }

  async function loadSubscriptions(id: string) {
    setSubscriptionsLoading(true);
    try {
      const res = await adminFetch<{ subscriptions: SubscriptionSlot[] }>(
        `/admin/v1/users/${encodeURIComponent(id)}/subscriptions`,
      );
      setSubscriptions(res.subscriptions || []);
    } catch (e) {
      setSubscriptions([]);
      message.error(e instanceof Error ? e.message : "加载订阅失败");
    } finally {
      setSubscriptionsLoading(false);
    }
  }

  async function openSubscriptionDrawer() {
    if (!data) return;
    setSubscriptionDrawerOpen(true);
    await loadSubscriptions(data.user.id);
  }

  async function loadRenewSelectOptions() {
    try {
      const [plansRes, upstreamRes] = await Promise.all([
        adminFetch<{ plans: { id: string; name: string; code: string }[] }>(
          "/admin/v1/plans",
        ),
        adminFetch("/admin/v1/wireraw/customer-plans"),
      ]);
      setPlanOptions(
        (plansRes.plans || []).map((p) => ({
          label: `${p.name} (${p.code})`,
          value: p.id,
        })),
      );
      const upstream = unwrapList<{ code: string; name: string }>(upstreamRes, [
        "items",
        "plans",
      ]);
      setUpstreamPlanOptions(
        upstream.map((p) => ({
          label: `${p.name} (${p.code})`,
          value: p.code,
        })),
      );
    } catch {
      setPlanOptions([]);
      setUpstreamPlanOptions([]);
    }
  }

  function scheduleRenewPreview(
    delayMs = 280,
    slot?: SubscriptionSlot | null,
  ) {
    if (renewPreviewTimer.current) clearTimeout(renewPreviewTimer.current);
    renewPreviewTimer.current = setTimeout(() => {
      void previewRenewChange({ silent: true, slot: slot ?? renewSlot });
    }, delayMs);
  }

  async function openRenewModal(slot: SubscriptionSlot) {
    setRenewSlot(slot);
    setRenewPreview(null);
    renewForm.setFieldsValue({
      plan_id: slot.plan_id || undefined,
      upstream_plan_ref: slot.next_plan_ref || undefined,
      validity_days: undefined,
      note: undefined,
      keep_expires_at: true,
      keep_used_traffic: true,
    });
    await loadRenewSelectOptions();
    scheduleRenewPreview(0, slot);
  }

  function buildRenewBody(slot?: SubscriptionSlot | null) {
    const current = slot ?? renewSlot;
    if (!current) return null;
    const values = renewForm.getFieldsValue();
    const body: Record<string, unknown> = {
      slot_id: current.id,
      keep_expires_at: values.keep_expires_at !== false,
      // Upstream cannot clear used traffic — always keep.
      keep_used_traffic: true,
    };
    if (values.plan_id) body.plan_id = values.plan_id;
    if (values.upstream_plan_ref) {
      body.upstream_plan_ref = values.upstream_plan_ref;
    }
    if (!values.keep_expires_at && values.validity_days) {
      body.validity_seconds = Number(values.validity_days) * 86400;
    }
    if (values.note) body.note = values.note;
    return body;
  }

  async function previewRenewChange(opts?: {
    silent?: boolean;
    slot?: SubscriptionSlot | null;
  }) {
    const silent = Boolean(opts?.silent);
    const slot = opts?.slot ?? renewSlot;
    if (!data || !slot) return;
    const body = buildRenewBody(slot);
    if (!body) return;
    if (
      !body.plan_id &&
      !body.upstream_plan_ref &&
      !body.validity_seconds &&
      !body.keep_expires_at
    ) {
      setRenewPreview(null);
      if (!silent) message.warning("请至少选择套餐，或填写延长天数");
      return;
    }
    const seq = ++renewPreviewSeq.current;
    setRenewPreviewLoading(true);
    try {
      const res = await adminFetch<{
        preview: {
          before: Record<string, string | number | null>;
          after: Record<string, string | number | null>;
          warnings?: string[];
        };
      }>(`/admin/v1/users/${data.user.id}/provision/preview`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (seq !== renewPreviewSeq.current) return;
      setRenewPreview({
        before: res.preview.before,
        after: res.preview.after,
        warnings: res.preview.warnings || [],
      });
    } catch (e) {
      if (seq !== renewPreviewSeq.current) return;
      setRenewPreview(null);
      if (!silent) {
        message.error(e instanceof Error ? e.message : "预览失败");
      }
    } finally {
      if (seq === renewPreviewSeq.current) {
        setRenewPreviewLoading(false);
      }
    }
  }

  async function submitRenewChange() {
    if (!data || !renewSlot || !renewPreview) {
      message.warning("请先预览变更");
      return;
    }
    const body = buildRenewBody();
    if (!body) return;
    setRenewSubmitting(true);
    try {
      const res = await adminFetch<{
        subscription_url_unchanged?: boolean;
      }>(`/admin/v1/users/${data.user.id}/provision`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      message.success(
        res.subscription_url_unchanged
          ? "已更新，订阅链接未变"
          : "已更新（请核对订阅链接）",
      );
      setRenewSlot(null);
      setRenewPreview(null);
      void loadSubscriptions(data.user.id);
      void loadEntitlementLedger(data.user.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "变更失败");
    } finally {
      setRenewSubmitting(false);
    }
  }

  async function syncSubscriptions() {
    if (!data) return;
    setSubscriptionsLoading(true);
    try {
      await adminFetch(`/admin/v1/users/${data.user.id}/sync`, {
        method: "POST",
        body: "{}",
      });
      message.success("已同步全部订阅");
      await loadSubscriptions(data.user.id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSubscriptionsLoading(false);
    }
  }

  async function loadLedger(id: string) {
    setLedgerLoading(true);
    try {
      const res = await adminFetch<{ items: WalletLedgerRow[]; total: number }>(
        `/admin/v1/referral/users/${encodeURIComponent(id)}/wallet-ledger?limit=50&offset=0`,
      );
      setLedger(res.items || []);
      setLedgerTotal(res.total || 0);
    } catch {
      setLedger([]);
      setLedgerTotal(0);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function loadEntitlementLedger(id: string) {
    setEntitlementLedgerLoading(true);
    try {
      const res = await adminFetch<{
        items: EntitlementLedgerRow[];
        total: number;
      }>(
        `/admin/v1/users/${encodeURIComponent(id)}/entitlement-ledgers?limit=50&offset=0`,
      );
      setEntitlementLedger(res.items || []);
      setEntitlementLedgerTotal(res.total || 0);
    } catch {
      setEntitlementLedger([]);
      setEntitlementLedgerTotal(0);
    } finally {
      setEntitlementLedgerLoading(false);
    }
  }

  async function load(id: string) {
    if (!id.trim()) {
      message.warning("请输入 UID / 邮箱 / 邀请码 / 用户 ID");
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch<RelationRes>(
        `/admin/v1/referral/users/${encodeURIComponent(id.trim())}/relations`,
      );
      setData(res);
      setUserId(res.user.id);
      setRemarkDraft(res.user.adminRemark || "");
      setSearchParams({ user: res.user.id }, { replace: true });
      void loadLedger(res.user.id);
      void loadEntitlementLedger(res.user.id);
      void loadAuthEvents(res.user.id);
      void loadOrders(res.user.id);
    } catch (e) {
      setData(null);
      setLedger([]);
      setEntitlementLedger([]);
      setEntitlementLedgerTotal(0);
      setAuthEvents([]);
      setAuthEventsTotal(0);
      setOrders([]);
      setOrdersTotal(0);
      message.error(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const q = searchParams.get("user");
    if (q) {
      setUserId(q);
      void load(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePromo(promoEnabled: boolean, frozenCents?: number) {
    if (!data) return;
    await adminFetch(`/admin/v1/referral/users/${data.user.id}/promo`, {
      method: "PATCH",
      body: JSON.stringify({
        promo_enabled: promoEnabled,
        ...(frozenCents != null ? { frozen_cents: frozenCents } : {}),
      }),
    });
    message.success("已更新");
    await load(data.user.id);
    actionRef.current?.reload();
  }

  async function saveGroup(groupId: string) {
    if (!data) return;
    setGroupSaving(true);
    try {
      await adminFetch(`/admin/v1/referral/users/${data.user.id}/promo-group`, {
        method: "PATCH",
        body: JSON.stringify({ promo_group_id: groupId }),
      });
      message.success("分佣组已更新（仅影响之后新订单）");
      setGroupModalOpen(false);
      await load(data.user.id);
      actionRef.current?.reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setGroupSaving(false);
    }
  }

  function openGroupModal() {
    if (!data) return;
    setGroupEditValue(data.user.promoGroupId || data.user.promoGroup?.id);
    setGroupModalOpen(true);
  }

  async function saveGroupFromModal() {
    if (!groupEditValue) {
      message.warning("请选择分佣组");
      return;
    }
    await saveGroup(groupEditValue);
  }

  async function bindInviter() {
    if (!data) return;
    const inviter = inviterDraft.trim();
    if (!inviter) {
      message.warning("请输入上级 UID、邮箱、邀请码或用户 ID");
      return;
    }
    setInviterSaving(true);
    try {
      await adminFetch(`/admin/v1/referral/users/${data.user.id}/inviter`, {
        method: "POST",
        body: JSON.stringify({ inviter }),
      });
      message.success("上级关联成功");
      setInviterModalOpen(false);
      setInviterDraft("");
      await load(data.user.id);
      actionRef.current?.reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "关联失败");
    } finally {
      setInviterSaving(false);
    }
  }

  async function resetPassword() {
    if (!data) return;
    if (newPassword.length < 6) {
      message.warning("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      message.warning("两次输入的密码不一致");
      return;
    }
    setPasswordSaving(true);
    try {
      await adminFetch(`/admin/v1/users/${data.user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword }),
      });
      message.success("密码已重置");
      setPasswordModalOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "重置密码失败");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function saveRemark() {
    if (!data) return;
    setRemarkSaving(true);
    try {
      await adminFetch(`/admin/v1/referral/users/${data.user.id}/remark`, {
        method: "PATCH",
        body: JSON.stringify({
          admin_remark: remarkDraft.trim() ? remarkDraft.trim() : null,
        }),
      });
      message.success("备注已保存");
      await load(data.user.id);
      actionRef.current?.reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setRemarkSaving(false);
    }
  }

  async function saveInviteCode() {
    if (!data) return;
    const code = inviteCodeDraft.trim().toUpperCase();
    if (code.length < 3 || code.length > 8) {
      message.warning("邀请码长度为 3–8 位");
      return;
    }
    setInviteCodeSaving(true);
    try {
      await adminFetch(`/admin/v1/referral/users/${data.user.id}/invite-code`, {
        method: "PATCH",
        body: JSON.stringify({ invite_code: code }),
      });
      message.success("邀请码已更新");
      setInviteCodeModalOpen(false);
      await load(data.user.id);
      actionRef.current?.reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setInviteCodeSaving(false);
    }
  }

  function openInviteCodeModal() {
    if (!data) return;
    setInviteCodeDraft(data.user.inviteCode || "");
    setInviteCodeModalOpen(true);
  }

  function resetInviteCodeDraft() {
    if (!data) return;
    const original = data.user.inviteCode || "";
    if (inviteCodeDraft === original) {
      message.info("已是当前邀请码");
      return;
    }
    setInviteCodeDraft(original);
    message.success("已恢复为当前邀请码");
  }

  function resetRemarkDraft() {
    if (!data) return;
    const original = data.user.adminRemark || "";
    if (remarkDraft === original) {
      message.info("已是当前备注");
      return;
    }
    setRemarkDraft(original);
    message.success("已恢复为已保存备注");
  }

  function clearDetail() {
    setData(null);
    setLedger([]);
    setLedgerTotal(0);
    setRemarkDraft("");
    setInviteCodeDraft("");
    setInviteCodeModalOpen(false);
    setGroupEditValue(undefined);
    setGroupModalOpen(false);
    setInviterModalOpen(false);
    setInviterDraft("");
    setPasswordModalOpen(false);
    setNewPassword("");
    setConfirmPassword("");
    setSubscriptionDrawerOpen(false);
    setSubscriptions([]);
    setProvisionOpen(false);
    setRenewSlot(null);
    setRenewPreview(null);
    if (renewPreviewTimer.current) {
      clearTimeout(renewPreviewTimer.current);
      renewPreviewTimer.current = null;
    }
    setEntitlementLedger([]);
    setEntitlementLedgerTotal(0);
    setEntitlementDetail(null);
    setAuthEvents([]);
    setAuthEventsTotal(0);
    setOrders([]);
    setOrdersTotal(0);
    setUserId("");
    setSearchParams({}, { replace: true });
  }

  const downlineRows = Object.entries(data?.downline_by_level || {})
    .map(([level, count]) => ({ level: Number(level), count }))
    .sort((a, b) => a.level - b.level);

  const listColumns: ProColumns<RelationListItem>[] = [
    {
      title: "UID",
      dataIndex: "uid",
      width: 100,
      search: false,
      copyable: true,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      width: 240,
      ellipsis: true,
      copyable: true,
      render: (_, r) => r.email || <Tag>匿名</Tag>,
    },
    {
      title: "邀请码",
      dataIndex: "invite_code",
      width: 120,
      copyable: true,
      search: false,
    },
    {
      title: "上级",
      search: false,
      width: 220,
      ellipsis: true,
      render: (_, r) =>
        r.inviter
          ? `${r.inviter.email || r.inviter.uid || r.inviter.id} (${r.inviter.invite_code})`
          : "—",
    },
    {
      title: "直邀人数",
      dataIndex: "invite_count",
      width: 90,
      search: false,
    },
    {
      title: "分佣组",
      dataIndex: ["promo_group", "name"],
      width: 100,
      search: false,
      render: (_, r) => r.promo_group?.name || "—",
    },
    {
      title: "可提现",
      search: false,
      width: 100,
      render: (_, r) => money(r.wallet?.available_cents),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      search: false,
      render: (_, r) =>
        r.status === "active" ? (
          <Tag color="success">active</Tag>
        ) : (
          <Tag color="error">{r.status}</Tag>
        ),
    },
    {
      title: "备注",
      dataIndex: "admin_remark",
      search: false,
      width: 180,
      ellipsis: true,
      render: (_, r) => r.admin_remark || "—",
    },
    {
      title: "操作",
      valueType: "option",
      width: 90,
      render: (_, row) => [
        <a key="detail" onClick={() => void load(row.id)}>
          用户详情
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      title="用户详情"
      subTitle={
        data ? (
          <span>
            UID {data.user.uid ?? "—"}
            {data.user.email ? ` · ${data.user.email}` : ""}
            {" · "}
            <Link to="/users">返回用户列表</Link>
          </span>
        ) : (
          <span>
            按 UID / 邮箱 / 邀请码查询用户；也可从{" "}
            <Link to="/users">用户列表</Link>进入
          </span>
        )
      }
    >
      <Card>
        <Space>
          <Input
            style={{ width: 420 }}
            placeholder="UID / 邮箱 / 邀请码 / 用户 ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onPressEnter={() => void load(userId)}
          />
          <Button type="primary" loading={loading} onClick={() => void load(userId)}>
            查询
          </Button>
          {data && (
            <Button onClick={clearDetail}>清除查询</Button>
          )}
        </Space>
      </Card>

      {!data && (
        <Card style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }}>
          <ProTable<RelationListItem>
            rowKey="id"
            actionRef={actionRef}
            columns={listColumns}
            search={false}
            options={false}
            pagination={{ defaultPageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1200 }}
            request={async (params) => {
              const qs = new URLSearchParams();
              qs.set("limit", String(params.pageSize || 20));
              qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
              const res = await adminFetch<{ items: RelationListItem[]; total: number }>(
                `/admin/v1/referral/relations?${qs}`,
              );
              return { data: res.items || [], success: true, total: res.total || 0 };
            }}
          />
        </Card>
      )}

      {data && (
        <>
          {data.invite_env && data.invite_env.flags.length > 0 && (
            <Alert
              style={{ marginTop: 16 }}
              showIcon
              type={
                data.invite_env.flags.includes("same_device")
                  ? "error"
                  : data.invite_env.flags.includes("same_ip")
                    ? "warning"
                    : "info"
              }
              message="与邀请人环境重叠（仅标注，不自动处理）"
              description={
                <span>
                  {inviteEnvFlagTags(data.invite_env.flags)}
                  <Typography.Text type="secondary">
                    {inviteEnvEvidence(data.invite_env)}
                    。不会拒绝绑定或扣佣金，可结合运营备注 / 关闭推广资格处理。
                  </Typography.Text>
                </span>
              }
            />
          )}
          <Card
            title="基本信息"
            style={{ marginTop: 16 }}
            loading={loading}
            extra={
              <Space>
                {data.user.email && (
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordModalOpen(true);
                    }}
                  >
                    重置密码
                  </Button>
                )}
                <Button
                  size="small"
                  type="primary"
                  onClick={() => setProvisionOpen(true)}
                >
                  新增套餐
                </Button>
                <Button size="small" onClick={() => void openSubscriptionDrawer()}>
                  订阅详情
                </Button>
              </Space>
            }
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="UID">{data.user.uid ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="邮箱">
                <Space size={6} wrap>
                  <span>{data.user.email || "—"}</span>
                  {data.user.email ? (
                    data.user.emailVerifiedAt ? (
                      <>
                        <Tag color="success">已验证</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {String(data.user.emailVerifiedAt)
                            .slice(0, 19)
                            .replace("T", " ")}
                        </Typography.Text>
                      </>
                    ) : (
                      <Tag color="warning">未验证</Tag>
                    )
                  ) : null}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="邀请码">
                <Space>
                  <span>{data.user.inviteCode}</span>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={openInviteCodeModal}>
                    修改
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="状态">{data.user.status}</Descriptions.Item>
              <Descriptions.Item label="来源客户端">
                {formatSourceClient(data.user.sourceClient)}
              </Descriptions.Item>
              <Descriptions.Item label="使用偏好">
                <Space size={6} wrap>
                  <Tag
                    color={
                      data.user.connectMode === "official_app"
                        ? "blue"
                        : data.user.connectMode === "subscription_client"
                          ? "orange"
                          : "default"
                    }
                  >
                    {formatConnectMode(data.user.connectMode)}
                  </Tag>
                  {(data.user.connectClients || []).length > 0 && (
                    <Typography.Text type="secondary">
                      {(data.user.connectClients || []).join(" · ")}
                    </Typography.Text>
                  )}
                  {data.user.connectPrefSource && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {data.user.connectPrefSource}
                      {data.user.connectPrefAt
                        ? ` · ${String(data.user.connectPrefAt).slice(0, 19).replace("T", " ")}`
                        : ""}
                    </Typography.Text>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="注册来源">
                {formatUserSource(data.user) || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="分佣组（当前）">
                <Space>
                  <span>
                    <strong>{data.user.promoGroup?.name || "—"}</strong>
                    {data.user.promoGroup?.code ? ` (${data.user.promoGroup.code})` : ""}
                  </span>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={openGroupModal}>
                    修改
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="上级">
                <Space size={6} wrap>
                  <span>
                    {data.user.inviter
                      ? `${data.user.inviter.email || data.user.inviter.uid || data.user.inviter.id} (${data.user.inviter.inviteCode})`
                      : "无"}
                  </span>
                  {data.invite_env ? inviteEnvFlagTags(data.invite_env.flags) : null}
                  {!data.user.inviter && (
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() => {
                        setInviterDraft("");
                        setInviterModalOpen(true);
                      }}
                    >
                      关联
                    </Button>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="可提现">{money(data.user.promoWallet?.availableCents)}</Descriptions.Item>
              <Descriptions.Item label="待结算">{money(data.user.promoWallet?.pendingCents)}</Descriptions.Item>
              <Descriptions.Item label="已提现">{money(data.user.promoWallet?.withdrawnCents)}</Descriptions.Item>
              <Descriptions.Item label="已兑换">{money(data.user.promoWallet?.spentCents)}</Descriptions.Item>
              <Descriptions.Item label="冻结">{money(data.user.promoWallet?.frozenCents)}</Descriptions.Item>
            </Descriptions>

            <Form layout="inline" style={{ marginTop: 16 }}>
              <Form.Item label="推广资格">
                <Switch
                  checked={data.user.promoEnabled}
                  onChange={(v) => void savePromo(v)}
                />
              </Form.Item>
              <Form.Item label="冻结金额（分）">
                <InputNumber
                  min={0}
                  defaultValue={data.user.promoWallet?.frozenCents || 0}
                  onPressEnter={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    void savePromo(data.user.promoEnabled, v);
                  }}
                />
              </Form.Item>
              <span style={{ color: "#999", fontSize: 12 }}>回车保存冻结金额</span>
            </Form>

            <div style={{ marginTop: 20 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>运营备注</div>
              <Input.TextArea
                rows={3}
                maxLength={5000}
                showCount
                placeholder="仅后台可见，可记录风控、沟通、特殊约定等"
                value={remarkDraft}
                onChange={(e) => setRemarkDraft(e.target.value)}
              />
              <Space style={{ marginTop: 8 }}>
                <Button type="primary" loading={remarkSaving} onClick={() => void saveRemark()}>
                  保存备注
                </Button>
                <Button onClick={resetRemarkDraft}>重置</Button>
              </Space>
            </div>
          </Card>

          <Card title="上级链（只读）" style={{ marginTop: 16 }}>
            <Table
              size="small"
              rowKey="user_id"
              pagination={false}
              dataSource={data.upline}
              columns={[
                { title: "层级", dataIndex: "level", width: 80 },
                { title: "邮箱", dataIndex: "email" },
                { title: "邀请码", dataIndex: "invite_code" },
                { title: "状态", dataIndex: "status", width: 100 },
              ]}
            />
          </Card>

          <Card title="下级人数" style={{ marginTop: 16 }}>
            <Table
              size="small"
              rowKey="level"
              pagination={false}
              dataSource={downlineRows}
              columns={[
                { title: "层级", dataIndex: "level" },
                { title: "人数", dataIndex: "count" },
              ]}
            />
          </Card>

          <Card
            title="直邀环境比对"
            style={{ marginTop: 16 }}
            extra="最近 50 人 · 同设备 / 公网同 IP / 环境相似仅供参考"
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.direct_invitees_env || []}
              locale={{ emptyText: "暂无直邀" }}
              columns={[
                {
                  title: "UID",
                  width: 100,
                  render: (_, r: DirectInviteeEnvRow) => (
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        void load(r.id);
                      }}
                    >
                      {r.uid ?? r.id.slice(0, 8)}
                    </a>
                  ),
                },
                {
                  title: "邮箱",
                  dataIndex: "email",
                  ellipsis: true,
                  render: (v: string | null) => v || <Tag>匿名</Tag>,
                },
                {
                  title: "邀请码",
                  dataIndex: "invite_code",
                  width: 110,
                },
                {
                  title: "重叠",
                  width: 200,
                  render: (_, r: DirectInviteeEnvRow) =>
                    r.invite_env.flags.length
                      ? inviteEnvFlagTags(r.invite_env.flags)
                      : "—",
                },
                {
                  title: "证据",
                  ellipsis: true,
                  render: (_, r: DirectInviteeEnvRow) =>
                    inviteEnvEvidence(r.invite_env),
                },
              ]}
            />
          </Card>

          <Card
            title="支付订单"
            style={{ marginTop: 16 }}
            extra={`最近 50 条${ordersTotal > 50 ? ` · 共 ${ordersTotal} 条` : ""}`}
          >
            <Table
              size="small"
              rowKey="id"
              loading={ordersLoading}
              pagination={false}
              scroll={{ x: 1200 }}
              dataSource={orders}
              locale={{ emptyText: "暂无支付订单" }}
              columns={[
                {
                  title: "创建时间",
                  dataIndex: "createdAt",
                  width: 170,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: "套餐",
                  width: 160,
                  ellipsis: true,
                  render: (_, r) =>
                    r.plan ? `${r.plan.name} (${r.plan.code})` : "—",
                },
                {
                  title: "金额",
                  width: 110,
                  render: (_, r) => {
                    const paid = money(r.amountCents);
                    if (r.isTrialPeriod) return `${paid} ${r.currency} · 试用`;
                    if (r.discountCents && r.discountCents > 0) {
                      return (
                        <span>
                          {paid} {r.currency}
                          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                            原价 {money(r.listPriceCents ?? r.amountCents + r.discountCents)}
                            {r.couponCode ? ` · ${r.couponCode}` : ""}
                          </Typography.Text>
                        </span>
                      );
                    }
                    return `${paid} ${r.currency}`;
                  },
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  width: 100,
                  render: (s: string) => (
                    <Tag color={orderStatusColor(s)}>{ORDER_STATUS_LABEL[s] || s}</Tag>
                  ),
                },
                {
                  title: "类型",
                  width: 80,
                  render: (_, r) =>
                    r.commissionKind === "renew" ? "续费" : r.commissionKind === "first" ? "首购" : "—",
                },
                {
                  title: "来源",
                  width: 140,
                  ellipsis: true,
                  render: (_, r) =>
                    r.paymentChannel?.name || r.provider || "—",
                },
                {
                  title: "支付时间",
                  dataIndex: "paidAt",
                  width: 170,
                  render: (v?: string | null) => (v ? new Date(v).toLocaleString() : "—"),
                },
                {
                  title: "佣金",
                  width: 70,
                  render: (_, r) => r._count?.commissions ?? 0,
                },
                {
                  title: "单号",
                  dataIndex: "id",
                  width: 180,
                  ellipsis: true,
                  render: (id: string) => (
                    <Typography.Text copyable={{ text: id }} style={{ fontSize: 12 }}>
                      {id.slice(0, 12)}…
                    </Typography.Text>
                  ),
                },
                {
                  title: "操作",
                  width: 90,
                  render: (_, row) =>
                    row.status !== "refunded" &&
                    row.status !== "cancelled" &&
                    row.status !== "pending" &&
                    row.amountCents > 0 ? (
                      <a
                        onClick={(e) => {
                          e.preventDefault();
                          modal.confirm({
                            title: "退款并作废佣金？",
                            content: (
                              <div>
                                <div>
                                  订单 {row.id.slice(0, 12)}… · {money(row.amountCents)}{" "}
                                  {row.currency}
                                </div>
                                <div style={{ marginTop: 8, color: "#666" }}>
                                  将同步从套餐到期时间末尾扣回本单时长；扣完则禁用订阅槽。
                                </div>
                              </div>
                            ),
                            okText: "确认退款",
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                const res = await adminFetch<{
                                  ok: boolean;
                                  entitlement?: EntitlementRes;
                                }>(`/admin/v1/referral/orders/${row.id}/refund`, {
                                  method: "POST",
                                  body: JSON.stringify({ reason: "admin_refund" }),
                                });
                                const ent = formatEntitlementMsg(res.entitlement);
                                if (res.entitlement && !res.entitlement.ok) {
                                  message.warning(`已退款。${ent}`);
                                } else {
                                  message.success(ent ? `已退款。${ent}` : "已退款");
                                }
                                if (data) await loadOrders(data.user.id);
                              } catch (err) {
                                message.error(
                                  err instanceof Error ? err.message : "退款失败",
                                );
                                throw err;
                              }
                            },
                          });
                        }}
                      >
                        退款作废
                      </a>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </Card>

          <Card
            title="登录 / 注册记录"
            style={{ marginTop: 16 }}
            extra={`最近 50 条${authEventsTotal > 50 ? ` · 共 ${authEventsTotal} 条` : ""}`}
          >
            <Table
              size="small"
              rowKey="id"
              loading={authEventsLoading}
              pagination={false}
              scroll={{ x: 1100 }}
              dataSource={authEvents}
              locale={{ emptyText: "暂无记录（仅本功能上线后的注册/登录）" }}
              columns={[
                {
                  title: "时间",
                  dataIndex: "created_at",
                  width: 170,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: "类型",
                  dataIndex: "event_type",
                  width: 100,
                  render: (t: string, r) => (
                    <Tag color={r.success ? "blue" : "error"}>
                      {AUTH_EVENT_LABEL[t] || t}
                    </Tag>
                  ),
                },
                { title: "IP", dataIndex: "ip", width: 130, ellipsis: true },
                {
                  title: "时区",
                  dataIndex: "timezone",
                  width: 140,
                  ellipsis: true,
                  render: (v?: string | null) => v || "—",
                },
                {
                  title: "渠道",
                  width: 100,
                  render: (_, r) => formatSourceClient(r.client),
                },
                {
                  title: "系统",
                  width: 130,
                  ellipsis: true,
                  render: (_, r) =>
                    r.os_name ? `${r.os_name}${r.os_version ? ` ${r.os_version}` : ""}` : "—",
                },
                {
                  title: "入口",
                  width: 130,
                  ellipsis: true,
                  render: (_, r) => formatAuthShell(r.meta) || "—",
                },
                {
                  title: "App版本",
                  dataIndex: "app_version",
                  width: 90,
                  render: (v?: string | null) => v || "—",
                },
                {
                  title: "语言",
                  dataIndex: "locale",
                  width: 80,
                  render: (v?: string | null) => v || "—",
                },
                {
                  title: "UA",
                  dataIndex: "user_agent",
                  ellipsis: true,
                  render: (v?: string | null) => v || "—",
                },
                {
                  title: "备注",
                  width: 120,
                  ellipsis: true,
                  render: (_, r) => r.failure_reason || "—",
                },
              ]}
            />
          </Card>

          <Card
            title="权益流水"
            style={{ marginTop: 16 }}
            extra={
              <Space>
                <span>
                  最近 50 条
                  {entitlementLedgerTotal > 50
                    ? ` · 共 ${entitlementLedgerTotal} 条`
                    : ""}
                </span>
                <Link to="/entitlement-ledgers">全部</Link>
              </Space>
            }
          >
            <Table
              size="small"
              rowKey="id"
              loading={entitlementLedgerLoading}
              pagination={false}
              scroll={{ x: 1200 }}
              dataSource={entitlementLedger}
              locale={{ emptyText: "暂无流水（仅记录本功能上线后）" }}
              onRow={(r) => ({
                onDoubleClick: () => setEntitlementDetail(r),
              })}
              columns={[
                {
                  title: "时间",
                  dataIndex: "created_at",
                  width: 170,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: "原因",
                  dataIndex: "reason_label",
                  width: 100,
                },
                {
                  title: "变更",
                  width: 160,
                  render: (_, r) => {
                    const flags = r.change_flags || {};
                    const keys = Object.keys(flags).filter((k) => flags[k]);
                    if (!keys.length) return "—";
                    return keys
                      .map((k) => ENTITLEMENT_FLAG_LABEL[k] || k)
                      .join(" · ");
                  },
                },
                {
                  title: "套餐",
                  width: 160,
                  ellipsis: true,
                  render: (_, r) => {
                    const after =
                      r.plan_after?.name || r.plan_id_after || "—";
                    const before =
                      r.plan_before?.name || r.plan_id_before || "—";
                    return before === after ? after : `${before} → ${after}`;
                  },
                },
                {
                  title: "到期",
                  width: 200,
                  render: (_, r) => {
                    const before = r.expires_at_before
                      ? new Date(r.expires_at_before).toLocaleString()
                      : "—";
                    const after = r.expires_at_after
                      ? new Date(r.expires_at_after).toLocaleString()
                      : "—";
                    return `${before} → ${after}`;
                  },
                },
                {
                  title: "流量Δ",
                  width: 100,
                  render: (_, r) => r.data_limit_delta || "—",
                },
                {
                  title: "槽",
                  dataIndex: "slot_id",
                  width: 120,
                  ellipsis: true,
                },
                {
                  title: "引用",
                  width: 140,
                  ellipsis: true,
                  render: (_, r) =>
                    r.ref_type || r.ref_id
                      ? `${r.ref_type || ""}:${r.ref_id || ""}`
                      : "—",
                },
                {
                  title: "操作",
                  width: 70,
                  fixed: "right",
                  render: (_, r) => (
                    <a onClick={() => setEntitlementDetail(r)}>详情</a>
                  ),
                },
              ]}
            />
            <EntitlementLedgerDetailModal
              row={entitlementDetail}
              onClose={() => setEntitlementDetail(null)}
              hideUser
            />
          </Card>

          <Card
            title="佣金余额流水"
            style={{ marginTop: 16 }}
            extra={`最近 50 条${ledgerTotal > 50 ? ` · 共 ${ledgerTotal} 条` : ""}`}
          >
            <Table
              size="small"
              rowKey="id"
              loading={ledgerLoading}
              pagination={false}
              scroll={{ x: 1100 }}
              dataSource={ledger}
              locale={{ emptyText: "暂无流水（历史变动仅记录本功能上线后）" }}
              columns={[
                {
                  title: "时间",
                  dataIndex: "createdAt",
                  width: 170,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: "类型",
                  dataIndex: "entryType",
                  width: 120,
                  render: (t: string) => ENTRY_LABEL[t] || t,
                },
                {
                  title: "可提现Δ",
                  width: 90,
                  render: (_, r) => signedMoney(r.availableDelta),
                },
                {
                  title: "待结算Δ",
                  width: 90,
                  render: (_, r) => signedMoney(r.pendingDelta),
                },
                {
                  title: "已提现Δ",
                  width: 90,
                  render: (_, r) => signedMoney(r.withdrawnDelta),
                },
                {
                  title: "已兑换Δ",
                  width: 90,
                  render: (_, r) => signedMoney(r.spentDelta),
                },
                {
                  title: "冻结Δ",
                  width: 80,
                  render: (_, r) => signedMoney(r.frozenDelta),
                },
                {
                  title: "可提现后",
                  width: 90,
                  render: (_, r) => money(r.availableAfter),
                },
                {
                  title: "关联",
                  ellipsis: true,
                  render: (_, r) =>
                    r.refType ? `${r.refType}:${r.refId || ""}` : "—",
                },
                {
                  title: "备注",
                  dataIndex: "remark",
                  ellipsis: true,
                  render: (v?: string | null) => v || "—",
                },
              ]}
            />
          </Card>
        </>
      )}

      <Modal
        title={`关联上级 — ${data?.user.email || data?.user.uid || data?.user.id || ""}`}
        open={inviterModalOpen}
        onCancel={() => setInviterModalOpen(false)}
        onOk={() => void bindInviter()}
        confirmLoading={inviterSaving}
        destroyOnClose
        okText="确认关联"
      >
        <Typography.Paragraph type="secondary">
          关联后将建立永久邀请关系，不能在后台直接改绑。请输入上级的任一标识。
        </Typography.Paragraph>
        <Input
          value={inviterDraft}
          onChange={(e) => setInviterDraft(e.target.value)}
          onPressEnter={() => void bindInviter()}
          placeholder="上级 UID / 邮箱 / 邀请码 / 用户 ID"
        />
      </Modal>

      <Modal
        title={`重置密码 — ${data?.user.email || ""}`}
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onOk={() => void resetPassword()}
        confirmLoading={passwordSaving}
        destroyOnClose
        okText="确认重置"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Typography.Text type="secondary">
            用户下次登录时需使用新密码。现有登录会话不会自动退出。
          </Typography.Text>
          <Input.Password
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="新密码（至少 6 位）"
            autoComplete="new-password"
          />
          <Input.Password
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onPressEnter={() => void resetPassword()}
            placeholder="再次输入新密码"
            autoComplete="new-password"
          />
        </Space>
      </Modal>

      <Modal
        title={`修改邀请码 — ${data?.user.email || data?.user.uid || data?.user.id || ""}`}
        open={inviteCodeModalOpen}
        onCancel={() => setInviteCodeModalOpen(false)}
        onOk={() => void saveInviteCode()}
        confirmLoading={inviteCodeSaving}
        destroyOnClose
        okText="保存"
      >
        <div style={{ marginBottom: 8, color: "#666" }}>
          当前：{data?.user.inviteCode || "—"}。3–8 位，仅 A–Z、2–9（不含 0/O/1/I），全局唯一。
        </div>
        <Input
          value={inviteCodeDraft}
          onChange={(e) => setInviteCodeDraft(e.target.value.toUpperCase())}
          maxLength={8}
          showCount
          placeholder="新邀请码"
        />
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={resetInviteCodeDraft}>
            重置为当前邀请码
          </Button>
        </div>
      </Modal>

      <Modal
        title={`修改分佣组 — ${data?.user.email || data?.user.uid || data?.user.id || ""}`}
        open={groupModalOpen}
        onCancel={() => setGroupModalOpen(false)}
        onOk={() => void saveGroupFromModal()}
        confirmLoading={groupSaving}
        destroyOnClose
        okText="保存"
      >
        <div style={{ marginBottom: 12, color: "#666" }}>
          当前：{data?.user.promoGroup?.name || "—"}
          {data?.user.promoGroup?.code ? ` (${data.user.promoGroup.code})` : ""}
          。改组只影响之后新订单的分佣费率。
        </div>
        <Select
          style={{ width: "100%" }}
          placeholder="选择分佣组（铜牌 / 银牌 / 金牌）"
          value={groupEditValue}
          onChange={setGroupEditValue}
          options={(data?.groups || [])
            .filter((g) => g.enabled || g.id === data?.user.promoGroupId)
            .map((g) => ({
              value: g.id,
              label: g.enabled ? g.name : `${g.name}（已禁用）`,
            }))}
        />
      </Modal>

      <ModalForm
        title={`新增套餐 — UID ${data?.user.uid ?? ""} ${data?.user.email || ""}`}
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!data) return false;
          const body: Record<string, unknown> = {};
          if (values.plan_id) body.plan_id = values.plan_id;
          if (values.upstream_plan_ref) {
            body.upstream_plan_ref = values.upstream_plan_ref;
          }
          if (values.validity_days) {
            body.validity_seconds = Number(values.validity_days) * 86400;
          }
          if (values.note) body.note = values.note;
          await adminFetch(`/admin/v1/users/${data.user.id}/provision`, {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("已创建新上游顾客 / 套餐槽");
          void loadEntitlementLedger(data.user.id);
          if (subscriptionDrawerOpen) {
            void loadSubscriptions(data.user.id);
          }
          return true;
        }}
      >
        <ProFormSelect
          name="plan_id"
          label="本地售卖套餐"
          request={async () => {
            const res = await adminFetch<{
              plans: { id: string; name: string; code: string }[];
            }>("/admin/v1/plans");
            return (res.plans || []).map((p) => ({
              label: `${p.name} (${p.code})`,
              value: p.id,
            }));
          }}
          allowClear
          tooltip="同一本地套餐每位用户只能开一次槽；续费请在订阅详情里操作"
        />
        <ProFormSelect
          name="upstream_plan_ref"
          label="或直接选上游套餐 code"
          request={async () => {
            const res = await adminFetch("/admin/v1/wireraw/customer-plans");
            const plans = unwrapList<{ code: string; name: string }>(res, [
              "items",
              "plans",
            ]);
            return plans.map((p) => ({
              label: `${p.name} (${p.code})`,
              value: p.code,
            }));
          }}
          showSearch
          allowClear
        />
        <ProFormDigit
          name="validity_days"
          label="或：直传有效天数"
          min={1}
          tooltip="都不选时默认开通 1 天"
        />
        <ProFormText name="note" label="备注" />
      </ModalForm>

      <Modal
        title={`变更套餐（保链接）— ${renewSlot?.plan_name || renewSlot?.plan_code || renewSlot?.upstream_username || ""}`}
        open={!!renewSlot}
        onCancel={() => {
          setRenewSlot(null);
          setRenewPreview(null);
        }}
        width={800}
        destroyOnClose
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setRenewSlot(null);
              setRenewPreview(null);
            }}
          >
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            disabled={!renewPreview || renewPreviewLoading}
            loading={renewSubmitting}
            onClick={() => void submitRenewChange()}
          >
            确认变更
          </Button>,
        ]}
      >
        <Form
          form={renewForm}
          layout="vertical"
          onValuesChange={() => scheduleRenewPreview()}
        >
          <Form.Item
            name="plan_id"
            label="改为本地套餐"
            tooltip="同用户已拥有的本地套餐不能再绑到另一槽"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={planOptions}
              placeholder="选择本地套餐"
            />
          </Form.Item>
          <Form.Item name="upstream_plan_ref" label="或上游套餐 code">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={upstreamPlanOptions}
              placeholder="选择上游套餐 code"
            />
          </Form.Item>
          <Form.Item
            name="keep_expires_at"
            label="到期时间不变"
            valuePropName="checked"
            extra="勾选后保留当前到期；关闭后可按新套餐时长重算，或填写延长天数"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="validity_days"
            label="延长天数"
            extra={
              keepExpiresAtWatch
                ? "已勾选「到期时间不变」，延长天数不会生效"
                : "从当前未过期到期日叠加；已过期则从现在起算"
            }
          >
            <InputNumber
              min={1}
              style={{ width: "100%" }}
              disabled={Boolean(keepExpiresAtWatch)}
              placeholder="可选"
            />
          </Form.Item>
          <Form.Item
            name="keep_used_traffic"
            label="已用流量不变"
            valuePropName="checked"
            extra="上游不支持清零已用流量，此项固定开启"
          >
            <Switch disabled />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input allowClear />
          </Form.Item>
        </Form>

        {renewPreview?.warnings?.length ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={renewPreview.warnings.join("；")}
          />
        ) : null}

        {renewPreviewLoading && !renewPreview ? (
          <Typography.Text type="secondary">正在预览…</Typography.Text>
        ) : null}

        {renewPreview ? (
          <Table
            size="small"
            pagination={false}
            rowKey="field"
            loading={renewPreviewLoading}
            style={{ marginTop: 8 }}
            dataSource={[
              {
                field: "套餐",
                before:
                  renewPreview.before.plan_name ||
                  renewPreview.before.plan_code ||
                  renewPreview.before.plan_id ||
                  "—",
                after:
                  renewPreview.after.plan_name ||
                  renewPreview.after.plan_code ||
                  renewPreview.after.plan_id ||
                  "—",
              },
              {
                field: "到期",
                before: renewPreview.before.expires_at
                  ? formatSubTime(String(renewPreview.before.expires_at))
                  : "—",
                after: renewPreview.after.expires_at
                  ? formatSubTime(String(renewPreview.after.expires_at))
                  : "—",
              },
              {
                field: "已用流量",
                before:
                  renewPreview.before.used_traffic_bytes == null
                    ? "—"
                    : Number(renewPreview.before.used_traffic_bytes) === 0
                      ? "0"
                      : formatBytes(
                          Number(renewPreview.before.used_traffic_bytes),
                        ),
                after:
                  renewPreview.after.used_traffic_bytes == null
                    ? "—"
                    : Number(renewPreview.after.used_traffic_bytes) === 0
                      ? "0"
                      : formatBytes(
                          Number(renewPreview.after.used_traffic_bytes),
                        ),
              },
              {
                field: "流量限额",
                before: formatBytes(
                  renewPreview.before.data_limit_bytes == null
                    ? null
                    : Number(renewPreview.before.data_limit_bytes),
                ),
                after: formatBytes(
                  renewPreview.after.data_limit_bytes == null
                    ? null
                    : Number(renewPreview.after.data_limit_bytes),
                ),
              },
              {
                field: "设备数",
                before: renewPreview.before.online_ip_limit ?? "—",
                after: renewPreview.after.online_ip_limit ?? "—",
              },
              {
                field: "重置策略",
                before: renewPreview.before.reset_policy || "—",
                after: renewPreview.after.reset_policy || "—",
              },
              {
                field: "状态",
                before: renewPreview.before.status || "—",
                after: renewPreview.after.status || "—",
              },
            ]}
            columns={[
              { title: "字段", dataIndex: "field", width: 100 },
              { title: "前", dataIndex: "before" },
              { title: "后", dataIndex: "after" },
            ]}
          />
        ) : !renewPreviewLoading ? (
          <Typography.Text type="secondary">
            调整上方选项后，下方会自动同步预览对照。
          </Typography.Text>
        ) : null}
      </Modal>

      <Drawer
        title={`订阅 — ${data?.user.email || data?.user.uid || ""}`}
        open={subscriptionDrawerOpen}
        onClose={() => setSubscriptionDrawerOpen(false)}
        width={640}
        extra={
          <Space>
            <Button size="small" type="primary" onClick={() => setProvisionOpen(true)}>
              新增套餐
            </Button>
            <Button
              size="small"
              loading={subscriptionsLoading}
              onClick={() => void syncSubscriptions()}
            >
              同步全部
            </Button>
          </Space>
        }
      >
        {subscriptionsLoading && subscriptions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24 }}>加载中…</div>
        ) : subscriptions.length === 0 ? (
          <Typography.Text type="secondary">
            暂无套餐槽，可点右上角「新增套餐」
          </Typography.Text>
        ) : (
          <Tabs
            type="card"
            items={subscriptions.map((s, idx) => ({
              key: s.id,
              label: (
                <Space size={4}>
                  <span>{s.plan_name || s.plan_code || `套餐 ${idx + 1}`}</span>
                  <Tag
                    color={statusTagColor(s.status)}
                    style={{ marginInlineEnd: 0, lineHeight: "18px" }}
                  >
                    {s.status || "active"}
                  </Tag>
                  {s.fup?.enabled ? (
                    <Tag
                      color={s.fup.throttled ? "warning" : "success"}
                      style={{ marginInlineEnd: 0, lineHeight: "18px" }}
                    >
                      {s.fup.throttled ? "已限速" : "全速"}
                    </Tag>
                  ) : null}
                </Space>
              ),
              children: (
                <Tabs
                  size="small"
                  items={[
                    {
                      key: "basic",
                      label: "基本信息",
                      children: (
                        <Space
                          direction="vertical"
                          size="middle"
                          style={{ width: "100%" }}
                        >
                          <Descriptions size="small" column={2} bordered>
                            <Descriptions.Item label="状态" span={2}>
                              <Space wrap>
                                <Tag color={statusTagColor(s.status)}>
                                  {s.status || "active"}
                                </Tag>
                                {s.plan_code && <Tag>{s.plan_code}</Tag>}
                                {s.fup?.enabled ? (
                                  <Tag color={s.fup.throttled ? "warning" : "success"}>
                                    {s.fup.throttled ? "已限速" : "全速"}
                                  </Tag>
                                ) : null}
                                {s.revoked_at && <Tag color="error">已撤销</Tag>}
                              </Space>
                            </Descriptions.Item>
                            <Descriptions.Item label="上游用户" span={2}>
                              <Typography.Text copyable>
                                {s.upstream_username || "—"}
                                {s.upstream_id ? ` (${s.upstream_id})` : ""}
                              </Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="本地套餐 ID" span={2}>
                              {s.plan_id ? (
                                <Typography.Text copyable>
                                  {s.plan_id}
                                </Typography.Text>
                              ) : (
                                "—"
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="上游套餐 code" span={2}>
                              {s.next_plan_ref ? (
                                <Typography.Text copyable>
                                  {s.next_plan_ref}
                                </Typography.Text>
                              ) : (
                                "—"
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="到期时间">
                              {formatSubTime(s.expires_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="服务停止">
                              {formatSubTime(s.service_expires_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="撤销时间">
                              {s.revoked_at ? (
                                <Typography.Text type="danger">
                                  {formatSubTime(s.revoked_at)}
                                </Typography.Text>
                              ) : (
                                "—"
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="上次同步">
                              {formatSubTime(s.last_synced_at)}
                            </Descriptions.Item>
                            {s.note && (
                              <Descriptions.Item label="备注" span={2}>
                                {s.note}
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                          <Button
                            type="primary"
                            disabled={Boolean(s.revoked_at)}
                            onClick={() => void openRenewModal(s)}
                          >
                            变更套餐
                          </Button>
                        </Space>
                      ),
                    },
                    {
                      key: "usage",
                      label: "流量与设备",
                      children: (
                        <Descriptions size="small" column={2} bordered>
                          <Descriptions.Item label="流量" span={2}>
                            {formatTrafficPair(s.used_traffic_bytes, s.data_limit_bytes)}
                            {s.used_traffic_bytes != null && (
                              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                                （{s.used_traffic_bytes}
                                {s.data_limit_bytes != null && s.data_limit_bytes > 0
                                  ? ` / ${s.data_limit_bytes}`
                                  : ""}{" "}
                                字节）
                              </Typography.Text>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="在线设备上限">
                            {s.online_ip_limit ?? "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="在线设备">
                            {s.online_device_count ?? 0}
                            {s.subscription_online_devices != null
                              ? `（订阅 ${s.subscription_online_devices}）`
                              : ""}
                          </Descriptions.Item>
                          <Descriptions.Item label="上线时间">
                            {formatSubTime(s.online_at)}
                          </Descriptions.Item>
                          <Descriptions.Item label="在线 SINCE">
                            {formatSubTime(s.online_since)}
                          </Descriptions.Item>
                          <Descriptions.Item label="当前在线" span={2}>
                            {formatOnlineSeconds(s.online_seconds)}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近来源 IP" span={2}>
                            {s.last_source_ip ? (
                              <Typography.Text copyable>
                                {s.last_source_ip}
                              </Typography.Text>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="源 IP 历史" span={2}>
                            {formatSourceIpHistory(
                              s.source_ip_history,
                              s.source_ips,
                            )}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    },
                    {
                      key: "network",
                      label: "带宽与节点",
                      children: (
                        <Descriptions size="small" column={2} bordered>
                          <Descriptions.Item label="公平使用" span={2}>
                            {s.fup?.enabled ? (
                              <Space direction="vertical" size={4}>
                                <Space wrap>
                                  <Tag color={s.fup.throttled ? "warning" : "success"}>
                                    {s.fup.throttled ? "已限速" : "全速"}
                                  </Tag>
                                  <span>
                                    当前档阈值{" "}
                                    {s.fup.current_after_bytes
                                      ? formatBytes(s.fup.current_after_bytes)
                                      : "0 GB（全速）"}
                                  </span>
                                </Space>
                                <span>
                                  当月已用 {(() => {
                                    const u = s.fup.used_traffic_bytes ?? s.used_traffic_bytes;
                                    if (u == null) return "—";
                                    if (u === 0) return "0";
                                    return formatBytes(u);
                                  })()}
                                  {s.fup.next_tier_after_bytes != null
                                    ? ` · 下一档 ${formatBytes(s.fup.next_tier_after_bytes)}`
                                    : " · 已是最高档"}
                                </span>
                                {s.fup.next_reset_at ? (
                                  <span>下次流量重置 {formatSubTime(s.fup.next_reset_at)}</span>
                                ) : null}
                              </Space>
                            ) : (
                              "未配置"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="限速" span={2}>
                            {s.bandwidth_policy
                              ? `${s.bandwidth_policy.source || "—"} · ↑ ${s.bandwidth_policy.up_mbps ?? "—"} / ↓ ${s.bandwidth_policy.down_mbps ?? "—"} Mbps${s.bandwidth_policy.editable === false ? " · 只读" : ""}`
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="切档记录" span={2}>
                            {(s.fup_history || []).length ? (
                              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                {(s.fup_history || []).slice(0, 10).map((h) => (
                                  <Typography.Text key={h.id} type="secondary" style={{ fontSize: 12 }}>
                                    {formatSubTime(h.created_at)} · {h.reason || h.actor_type || "—"} ·{" "}
                                    {h.from_ref || "—"} → {h.to_ref || "—"}
                                    {h.after_bytes != null
                                      ? ` · 档 ${h.after_bytes === 0 ? "0 GB" : formatBytes(h.after_bytes)}`
                                      : ""}
                                  </Typography.Text>
                                ))}
                              </Space>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="绑定带宽套餐" span={2}>
                            {s.current_bandwidth_plan_ref ? (
                              <Typography.Text copyable>
                                {s.current_bandwidth_plan_ref}
                              </Typography.Text>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="预约下期带宽" span={2}>
                            {s.next_bandwidth_plan_ref ? (
                              <Typography.Text copyable>
                                {s.next_bandwidth_plan_ref}
                              </Typography.Text>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="协议" span={2}>
                            {(s.protocols || []).length
                              ? (s.protocols || []).join(", ")
                              : "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="入站" span={2}>
                            {formatInbounds(s.inbounds)}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近活跃节点" span={2}>
                            {s.current_node ? (
                              <Space direction="vertical" size={0}>
                                <Typography.Text
                                  copyable={
                                    s.current_node.id
                                      ? { text: s.current_node.id }
                                      : undefined
                                  }
                                >
                                  {s.current_node.name ||
                                    s.current_node.id ||
                                    "—"}
                                  {s.current_node.region
                                    ? `（${s.current_node.region}）`
                                    : ""}
                                </Typography.Text>
                                {s.current_node.id &&
                                  s.current_node.name &&
                                  s.current_node.id !== s.current_node.name && (
                                    <Typography.Text
                                      type="secondary"
                                      style={{ fontSize: 12 }}
                                    >
                                      ID: {s.current_node.id}
                                    </Typography.Text>
                                  )}
                              </Space>
                            ) : (
                              "最近无活跃流量"
                            )}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    },
                    {
                      key: "link",
                      label: "订阅链接",
                      children: (
                        <Descriptions size="small" column={1} bordered>
                          <Descriptions.Item label="上游原始订阅">
                            {s.subscription_url ? (
                              <CopyableUrlWithQr
                                url={s.subscription_url}
                                label="上游原始订阅"
                              />
                            ) : s.revoked_at ? (
                              <Typography.Text type="danger">已撤销</Typography.Text>
                            ) : (
                              "—"
                            )}
                          </Descriptions.Item>
                          {CLIENT_URL_LABELS.map(({ key, label }) => {
                            const url = s.client_urls?.[key];
                            if (!url) return null;
                            return (
                              <Descriptions.Item key={key} label={label}>
                                <CopyableUrlWithQr url={url} label={label} />
                              </Descriptions.Item>
                            );
                          })}
                          <Descriptions.Item label="可用格式">
                            {(s.available_formats || []).join(", ") || "—"}
                          </Descriptions.Item>
                          <Descriptions.Item label="最近拉取 Agent">
                            {s.last_fetch_agent || "—"}
                          </Descriptions.Item>
                        </Descriptions>
                      ),
                    },
                  ]}
                />
              ),
            }))}
          />
        )}
      </Drawer>
    </PageContainer>
  );
}
