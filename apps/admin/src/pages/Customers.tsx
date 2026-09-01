import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDateTimePicker,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Descriptions, Dropdown, Modal, Space, Spin, Tag, Typography } from "antd";
import { CopyableUrlWithQr } from "../components/CopyableUrlWithQr";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { adminFetch, sortBandwidthPlansBySpeed, unwrapList } from "../lib/api";
import { formatDateTime } from "../lib/time";

type CustomerRow = {
  end_user?: {
    id?: string;
    username?: string;
    status?: string;
    expires_at?: string;
    used_traffic_bytes?: number;
    data_limit_bytes?: number;
    next_plan_ref?: string;
    current_bandwidth_plan_ref?: string;
    next_bandwidth_plan_ref?: string;
    online_ip_limit?: number;
    online_at?: string;
    email?: string;
    note?: string;
    validity_seconds?: number;
    current_node?: { id?: string; name?: string; region?: string } | null;
  };
  subscription_url?: string;
  online_device_count?: number;
  /** injected from /customers/online */
  is_online?: boolean;
};

function formatBytes(n?: number) {
  if (n == null) return "-";
  if (n === 0) return "不限";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = n / 1024 ** 2;
  return `${mb.toFixed(1)} MB`;
}

function formatTime(v?: string | null) {
  return formatDateTime(v, "-");
}

type CustomerDetail = {
  end_user?: CustomerRow["end_user"] & {
    created_at?: string;
    updated_at?: string;
    service_expires_at?: string;
    merchant_profile_id?: string;
    tenant_id?: string;
    service_group_ref?: string;
    online_since?: string | null;
    current_node?: { id?: string; name?: string; region?: string } | null;
    source_ips?: string[] | null;
    source_ip_history?: unknown;
    sdk_app_id?: string | null;
    sdk_device_id?: string | null;
    customer_source?: string | null;
    source?: string | null;
  };
  merchant_profile?: {
    id?: string;
    name?: string;
    tenant_id?: string;
    max_up_mbps?: number;
    max_down_mbps?: number;
  };
  subscription_url?: string | null;
  uuid?: string;
  password?: string;
  online_device_count?: number;
  subscription_online_devices?: number;
  bandwidth_policy?: {
    up_mbps?: number;
    down_mbps?: number;
    source?: string;
    source_ref?: string;
    editable?: boolean;
    enforcement?: string;
    protocols?: Record<string, string>;
  };
  subscription?: {
    revoked_at?: string | null;
    last_fetch_agent?: string | null;
    available_formats?: string[];
    url?: string;
    subscription_url?: string;
  };
  credentials?: Array<{
    id?: string;
    protocol?: string;
    allowed_inbound_tags?: string[];
  }>;
  creds_by_protocol?: Record<
    string,
    { uuid?: string; password?: string; flow?: string; method?: string }
  >;
  inbounds?: Record<string, string[]>;
};

function dash(v: unknown) {
  if (v == null || v === "") return "-";
  return String(v);
}

function formatTrafficPair(used?: number, limit?: number) {
  const u = formatBytes(used ?? 0);
  const l = limit == null || limit === 0 ? "∞" : formatBytes(limit);
  return `${u} / ${l}`;
}

function bandwidthSourceLabel(source?: string) {
  if (!source) return "-";
  if (source === "merchant_cap_default") return "商户默认限速";
  if (source === "merchant_plan") return "绑定带宽套餐";
  return source;
}

function formatInbounds(inbounds?: Record<string, string[]>) {
  if (!inbounds) return "-";
  return (
    Object.entries(inbounds)
      .map(([proto, tags]) => `${proto}: ${(tags || []).join(", ")}`)
      .join(" / ") || "-"
  );
}

function formatProtocols(inbounds?: Record<string, string[]>, credentials?: CustomerDetail["credentials"]) {
  if (inbounds && Object.keys(inbounds).length) {
    return Object.keys(inbounds)
      .map((p) => p.toUpperCase())
      .join(", ");
  }
  if (credentials?.length) {
    return credentials.map((c) => (c.protocol || "").toUpperCase()).filter(Boolean).join(", ");
  }
  return "-";
}

function formatCredsByProtocol(
  creds?: CustomerDetail["creds_by_protocol"],
) {
  if (!creds) return "-";
  return Object.entries(creds)
    .map(([proto, c]) => {
      const parts = [
        c.uuid ? `UUID: ${c.uuid}` : null,
        c.password ? `密码: ${c.password}` : null,
        c.flow ? `flow: ${c.flow}` : null,
        c.method ? `method: ${c.method}` : null,
      ].filter(Boolean);
      return `${proto.toUpperCase()}: ${parts.join("; ")}`;
    })
    .join(" · ");
}

async function loadUpstreamPlanOptions() {
  const data = await adminFetch<unknown>("/admin/v1/wireraw/customer-plans");
  const plans = unwrapList<{ code: string; name: string; type?: string }>(data, [
    "items",
    "plans",
  ]);
  return plans.map((p) => ({
    label: `${p.code}（[${p.type === "traffic" ? "流量" : "时长"}] ${p.name}）`,
    value: p.code,
  }));
}

async function loadBandwidthPlanOptions() {
  const data = await adminFetch<unknown>("/admin/v1/wireraw/bandwidth-plans");
  const plans = unwrapList<{
    id: string;
    name: string;
    max_up_mbps?: number;
    max_down_mbps?: number;
    status?: string;
  }>(data, ["plans", "items"]);
  return [
    { label: "（不绑定 / 商户默认）", value: "" },
    ...sortBandwidthPlansBySpeed(plans).map((p) => ({
      label: `${p.name} (${p.max_up_mbps ?? "?"}/${p.max_down_mbps ?? "?"}Mbps) · ${p.id}`,
      value: p.id,
    })),
  ];
}

export default function CustomersPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<CustomerRow | null>(null);
  const [extendRow, setExtendRow] = useState<CustomerRow | null>(null);
  const [selected, setSelected] = useState<CustomerRow[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailOnline, setDetailOnline] = useState(false);
  const [detailPlanLabel, setDetailPlanLabel] = useState("-");

  const reload = () => actionRef.current?.reload();

  const openDetail = async (row: CustomerRow) => {
    const id = row.end_user?.id;
    if (!id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailPlanLabel("-");
    try {
      const [data, online, plansRaw] = await Promise.all([
        adminFetch<CustomerDetail>(`/admin/v1/wireraw/customers/${id}`),
        adminFetch<{ usernames?: string[] }>(
          "/admin/v1/wireraw/customers/online?limit=100000",
        ).catch(() => ({ usernames: [] as string[] })),
        adminFetch<unknown>("/admin/v1/wireraw/customer-plans").catch(() => ({})),
      ]);
      const username = data.end_user?.username;
      const planCode = data.end_user?.next_plan_ref;
      const plans = unwrapList<{ code: string; name: string; type?: string }>(plansRaw, [
        "items",
        "plans",
      ]);
      const plan = plans.find((p) => p.code === planCode);
      setDetailPlanLabel(
        plan
          ? `[${plan.type === "traffic" ? "流量" : "时长"}] ${plan.name}`
          : planCode || "-",
      );
      setDetail(data);
      setDetailOnline(
        (!!username && (online.usernames || []).includes(username)) ||
          (data.online_device_count ?? 0) > 0 ||
          !!row.is_online,
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载详情失败");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ProColumns<CustomerRow>[] = [
    {
      title: "username",
      dataIndex: ["end_user", "username"],
      copyable: true,
      fieldProps: { placeholder: "搜索 username / 邮箱" },
    },
    {
      title: "账号状态",
      dataIndex: ["end_user", "status"],
      width: 100,
      valueType: "select",
      valueEnum: {
        active: { text: "active", status: "Success" },
        disabled: { text: "disabled", status: "Error" },
        pending: { text: "pending", status: "Warning" },
      },
    },
    {
      title: "在线",
      dataIndex: "is_online",
      width: 80,
      search: false,
      filters: [
        { text: "在线", value: true },
        { text: "离线", value: false },
      ],
      onFilter: (value, record) => !!record.is_online === value,
      render: (_, r) => {
        const devices = r.online_device_count ?? 0;
        if (r.is_online || devices > 0) {
          return <Tag color="success">在线</Tag>;
        }
        return <Tag>离线</Tag>;
      },
    },
    {
      title: "设备上限",
      dataIndex: ["end_user", "online_ip_limit"],
      search: false,
      width: 100,
      render: (_, r) => {
        const devices = r.online_device_count ?? 0;
        const limit = r.end_user?.online_ip_limit;
        if (limit == null) return "-";
        return `${devices}/${limit}`;
      },
    },
    {
      title: "所在节点",
      dataIndex: ["end_user", "current_node"],
      search: false,
      width: 160,
      ellipsis: true,
      render: (_, r) => {
        const node = r.end_user?.current_node;
        if (!node) return <Typography.Text type="secondary">-</Typography.Text>;
        const name = node.name || node.id || "-";
        const region = node.region ? ` (${node.region})` : "";
        return (
          <Typography.Text copyable={{ text: node.id || name }} ellipsis>
            {name}
            {region}
          </Typography.Text>
        );
      },
    },
    {
      title: "套餐",
      dataIndex: ["end_user", "next_plan_ref"],
      search: false,
      ellipsis: true,
      width: 130,
    },
    {
      title: "带宽档",
      dataIndex: ["end_user", "current_bandwidth_plan_ref"],
      search: false,
      ellipsis: true,
      width: 120,
      render: (_, r) => r.end_user?.current_bandwidth_plan_ref || "-",
    },
    {
      title: "到期",
      dataIndex: ["end_user", "expires_at"],
      valueType: "dateTime",
      search: false,
      width: 170,
    },
    {
      title: "流量上限",
      dataIndex: ["end_user", "data_limit_bytes"],
      search: false,
      width: 90,
      render: (_, r) => formatBytes(r.end_user?.data_limit_bytes),
    },
    {
      title: "已用",
      dataIndex: ["end_user", "used_traffic_bytes"],
      search: false,
      width: 90,
      render: (_, r) => formatBytes(r.end_user?.used_traffic_bytes),
    },
    {
      title: "订阅链接",
      dataIndex: "subscription_url",
      ellipsis: true,
      search: false,
      render: (_, r) =>
        r.subscription_url ? (
          <CopyableUrlWithQr url={r.subscription_url} label="订阅链接" ellipsis />
        ) : (
          "-"
        ),
    },
    {
      title: "操作",
      valueType: "option",
      width: 240,
      render: (_, row) => {
        const id = row.end_user?.id;
        if (!id) return null;
        return [
          <a key="detail" onClick={() => openDetail(row)}>
            详情
          </a>,
          <a key="edit" onClick={() => setEditRow(row)}>
            编辑
          </a>,
          <a key="extend" onClick={() => setExtendRow(row)}>
            续期
          </a>,
          <Dropdown
            key="more"
            menu={{
              items: [
                {
                  key: "disable",
                  label: "停用",
                  onClick: async () => {
                    await adminFetch("/admin/v1/wireraw/customers", {
                      method: "POST",
                      body: JSON.stringify({
                        id,
                        username: row.end_user?.username,
                        status: "disabled",
                      }),
                    });
                    message.success("已停用");
                    reload();
                  },
                },
                {
                  key: "enable",
                  label: "启用",
                  onClick: async () => {
                    await adminFetch("/admin/v1/wireraw/customers", {
                      method: "POST",
                      body: JSON.stringify({
                        id,
                        username: row.end_user?.username,
                        status: "active",
                      }),
                    });
                    message.success("已启用");
                    reload();
                  },
                },
                {
                  key: "renew",
                  label: "按套餐续费",
                  onClick: async () => {
                    await adminFetch(`/admin/v1/wireraw/customers/${id}/renew`, {
                      method: "POST",
                      body: "{}",
                    });
                    message.success("续费成功");
                    reload();
                  },
                },
                {
                  key: "refresh",
                  label: "换发订阅链接",
                  onClick: () => {
                    Modal.confirm({
                      title: "换发订阅 token？",
                      content: "旧 subscription_url 将立即失效",
                      onOk: async () => {
                        await adminFetch("/admin/v1/wireraw/subscriptions/refresh", {
                          method: "POST",
                          body: JSON.stringify({ user_id: id }),
                        });
                        message.success("已换发");
                        reload();
                      },
                    });
                  },
                },
                {
                  key: "revoke",
                  label: "撤销订阅",
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: "撤销订阅？",
                      content: "旧链接立即失效，可稍后重新签发",
                      okType: "danger",
                      onOk: async () => {
                        await adminFetch(`/admin/v1/wireraw/customers/${id}/revoke`, {
                          method: "POST",
                          body: "{}",
                        });
                        message.success("已撤销");
                        reload();
                      },
                    });
                  },
                },
              ],
            }}
          >
            <a>更多</a>
          </Dropdown>,
        ];
      },
    },
  ];

  return (
    <PageContainer title="上游顾客">
      <ProTable<CustomerRow>
        rowKey={(r) => r.end_user?.id || r.end_user?.username || Math.random().toString()}
        actionRef={actionRef}
        columns={columns}
        scroll={{ x: 1680 }}
        rowSelection={{
          onChange: (_keys, rows) => setSelected(rows),
        }}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            创建顾客
          </Button>,
          <Button
            key="bulk-disable"
            disabled={!selected.length}
            onClick={async () => {
              const ids = selected.map((s) => s.end_user?.id).filter(Boolean) as string[];
              await adminFetch("/admin/v1/wireraw/customers/bulk-status", {
                method: "POST",
                body: JSON.stringify({ ids, status: "disabled" }),
              });
              message.success(`已停用 ${ids.length} 人`);
              reload();
            }}
          >
            批量停用
          </Button>,
          <Button
            key="bulk-enable"
            disabled={!selected.length}
            onClick={async () => {
              const ids = selected.map((s) => s.end_user?.id).filter(Boolean) as string[];
              await adminFetch("/admin/v1/wireraw/customers/bulk-status", {
                method: "POST",
                body: JSON.stringify({ ids, status: "active" }),
              });
              message.success(`已启用 ${ids.length} 人`);
              reload();
            }}
          >
            批量启用
          </Button>,
        ]}
        request={async (params) => {
          const qs = new URLSearchParams();
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          const q = params.username || params.keyword;
          if (q) qs.set("q", String(q));
          if (params.status) qs.set("status", String(params.status));

          const [data, online] = await Promise.all([
            adminFetch<Record<string, unknown>>(`/admin/v1/wireraw/customers?${qs}`),
            adminFetch<{ usernames?: string[] }>(
              "/admin/v1/wireraw/customers/online?limit=100000",
            ).catch(() => ({ usernames: [] as string[] })),
          ]);

          const onlineSet = new Set(online.usernames || []);
          const list = unwrapList<CustomerRow>(data, ["items", "customers"]).map((row) => {
            const username = row.end_user?.username;
            const devices = row.online_device_count ?? 0;
            return {
              ...row,
              is_online: (username ? onlineSet.has(username) : false) || devices > 0,
            };
          });
          const total =
            typeof data.total === "number"
              ? data.total
              : typeof data.count === "number"
                ? data.count
                : list.length;
          return { data: list, success: true, total };
        }}
        search={{ labelWidth: "auto" }}
      />

      <Modal
        title={
          detail?.end_user ? (
            <Space>
              <span>顾客</span>
              <Typography.Text copyable>
                {detail.end_user.username} ({detail.end_user.id})
              </Typography.Text>
            </Space>
          ) : (
            "顾客详情"
          )
        }
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        footer={[
          <Button
            key="edit"
            type="primary"
            disabled={!detail?.end_user}
            onClick={() => {
              if (!detail?.end_user) return;
              setDetailOpen(false);
              setEditRow({
                end_user: detail.end_user,
                subscription_url:
                  detail.subscription_url ||
                  detail.subscription?.subscription_url ||
                  detail.subscription?.url ||
                  undefined,
                online_device_count: detail.online_device_count,
                is_online: detailOnline,
              });
            }}
          >
            编辑
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setDetailOpen(false);
              setDetail(null);
            }}
          >
            关闭
          </Button>,
        ]}
        width={860}
        styles={{ body: { maxHeight: "72vh", overflowY: "auto" } }}
        destroyOnClose
      >
        <Spin spinning={detailLoading}>
          {detail?.end_user && (
            <>
              <Descriptions
                size="small"
                bordered
                column={2}
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label="顾客" span={2}>
                  <Typography.Text copyable>
                    {detail.end_user.username} ({detail.end_user.id})
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="状态" span={2}>
                  <Space wrap>
                    <Tag
                      color={
                        detail.end_user.status === "active"
                          ? "success"
                          : detail.end_user.status === "disabled"
                            ? "error"
                            : "warning"
                      }
                    >
                      {detail.end_user.status === "active"
                        ? "启用"
                        : detail.end_user.status === "disabled"
                          ? "停用"
                          : detail.end_user.status || "-"}
                    </Tag>
                    <Tag color={detailOnline ? "success" : "default"}>
                      {detailOnline ? "在线" : "离线"}
                    </Tag>
                    <Typography.Text type="secondary" copyable={{ text: detail.end_user.online_at || "" }}>
                      {formatTime(detail.end_user.online_at)}
                    </Typography.Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="套餐" span={2}>
                  <Typography.Text copyable>{detailPlanLabel}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="下一套餐 / code" span={2}>
                  <Typography.Text copyable>
                    {dash(detail.end_user.next_plan_ref)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="限速" span={2}>
                  <Typography.Text copyable>
                    {detail.bandwidth_policy
                      ? `${bandwidthSourceLabel(detail.bandwidth_policy.source)} · ↑ ${detail.bandwidth_policy.up_mbps ?? "-"} Mbps / ↓ ${detail.bandwidth_policy.down_mbps ?? "-"} Mbps${detail.bandwidth_policy.editable === false ? " · 只读" : ""}`
                      : "-"}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="限速来源">
                  {bandwidthSourceLabel(detail.bandwidth_policy?.source)}
                </Descriptions.Item>
                <Descriptions.Item label="兼容限速">
                  {dash(
                    detail.bandwidth_policy?.enforcement ||
                      (detail.bandwidth_policy?.protocols
                        ? Object.entries(detail.bandwidth_policy.protocols)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(", ")
                        : null),
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="绑定带宽套餐 ID" span={2}>
                  <Typography.Text copyable={!!detail.end_user.current_bandwidth_plan_ref}>
                    {dash(detail.end_user.current_bandwidth_plan_ref)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="预约下期带宽套餐" span={2}>
                  <Typography.Text copyable={!!detail.end_user.next_bandwidth_plan_ref}>
                    {dash(detail.end_user.next_bandwidth_plan_ref)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="到期时间">
                  <Typography.Text copyable={{ text: detail.end_user.expires_at || "" }}>
                    {formatTime(detail.end_user.expires_at)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="服务停止时间">
                  <Typography.Text copyable={{ text: detail.end_user.service_expires_at || "" }}>
                    {formatTime(detail.end_user.service_expires_at)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="设备上限">
                  {dash(detail.end_user.online_ip_limit)}
                </Descriptions.Item>
                <Descriptions.Item label="在线设备数">
                  {detail.online_device_count ?? 0}
                </Descriptions.Item>
                <Descriptions.Item label="订阅在线设备">
                  {detail.subscription_online_devices ?? 0}
                </Descriptions.Item>
                <Descriptions.Item label="顾客在线">
                  {detailOnline ? "是" : "否"}
                </Descriptions.Item>
                <Descriptions.Item label="协议" span={2}>
                  {formatProtocols(detail.inbounds, detail.credentials)}
                </Descriptions.Item>
                <Descriptions.Item label="入站" span={2}>
                  {formatInbounds(detail.inbounds)}
                </Descriptions.Item>
                <Descriptions.Item label="可用格式">
                  {(detail.subscription?.available_formats || []).join(", ") || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="邮箱">
                  {dash(detail.end_user.email)}
                </Descriptions.Item>
                <Descriptions.Item label="商户">
                  {dash(detail.merchant_profile?.name)}
                </Descriptions.Item>
                <Descriptions.Item label="租户">
                  {dash(detail.end_user.tenant_id || detail.merchant_profile?.tenant_id)}
                </Descriptions.Item>
                <Descriptions.Item label="商户 ID" span={2}>
                  <Typography.Text copyable>
                    {dash(detail.end_user.merchant_profile_id || detail.merchant_profile?.id)}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="流量显示" span={2}>
                  {formatTrafficPair(
                    detail.end_user.used_traffic_bytes,
                    detail.end_user.data_limit_bytes,
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="已用流量">
                  {formatBytes(detail.end_user.used_traffic_bytes ?? 0)}
                </Descriptions.Item>
                <Descriptions.Item label="流量上限(字节)">
                  {!detail.end_user.data_limit_bytes
                    ? "∞"
                    : detail.end_user.data_limit_bytes}
                </Descriptions.Item>
                <Descriptions.Item label="最近活跃节点" span={2}>
                  {detail.end_user.current_node
                    ? `${detail.end_user.current_node.name || "-"} / ${detail.end_user.current_node.region || "-"}`
                    : "最近无活跃流量"}
                </Descriptions.Item>
                <Descriptions.Item label="本次在线时长">
                  {dash(detail.end_user.online_since)}
                </Descriptions.Item>
                <Descriptions.Item label="撤销时间">
                  {detail.subscription?.revoked_at ? (
                    <Typography.Text type="danger" copyable>
                      {formatTime(detail.subscription.revoked_at)}
                    </Typography.Text>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="源 IP 历史" span={2}>
                  {Array.isArray(detail.end_user.source_ip_history) &&
                  detail.end_user.source_ip_history.length
                    ? detail.end_user.source_ip_history.map((row, idx) => {
                        const o =
                          row && typeof row === "object"
                            ? (row as Record<string, unknown>)
                            : null;
                        const ip =
                          typeof row === "string"
                            ? row
                            : typeof o?.ip === "string"
                              ? o.ip
                              : typeof o?.source_ip === "string"
                                ? o.source_ip
                                : typeof o?.["来源 IP"] === "string"
                                  ? o["来源 IP"]
                                  : null;
                        const at =
                          typeof o?.observed_at === "string"
                            ? o.observed_at
                            : typeof o?.observedAt === "string"
                              ? o.observedAt
                              : typeof o?.OBSERVEDAT === "string"
                                ? o.OBSERVEDAT
                                : null;
                        if (!ip) return null;
                        return (
                          <div key={`${ip}-${idx}`}>
                            <Typography.Text copyable={{ text: String(ip) }}>
                              {String(ip)}
                              {at ? ` ${formatTime(String(at))}` : ""}
                            </Typography.Text>
                          </div>
                        );
                      })
                    : Array.isArray(detail.end_user.source_ips) &&
                        detail.end_user.source_ips.length
                      ? detail.end_user.source_ips.join(", ")
                      : "暂无源 IP 历史（顾客通过节点建立真实连接后采集，最多保留 8 个）"}
                </Descriptions.Item>
                <Descriptions.Item label="顾客 SDK 应用 ID">
                  {dash(detail.end_user.sdk_app_id)}
                </Descriptions.Item>
                <Descriptions.Item label="顾客 SDK 设备 ID">
                  {dash(detail.end_user.sdk_device_id)}
                </Descriptions.Item>
                <Descriptions.Item label="顾客来源" span={2}>
                  {dash(detail.end_user.customer_source || detail.end_user.source)}
                </Descriptions.Item>
                <Descriptions.Item label="备注" span={2}>
                  {dash(detail.end_user.note)}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {formatTime(detail.end_user.created_at)}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {formatTime(detail.end_user.updated_at)}
                </Descriptions.Item>
              </Descriptions>

              <Descriptions
                size="small"
                bordered
                column={1}
                title="凭据"
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label="UUID">
                  {detail.uuid ? (
                    <Typography.Text copyable>{detail.uuid}</Typography.Text>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="密码">
                  {detail.password ? (
                    <Typography.Text copyable>{detail.password}</Typography.Text>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="CREDS BY 协议">
                  <Typography.Paragraph
                    copyable={{ text: formatCredsByProtocol(detail.creds_by_protocol) }}
                    style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}
                  >
                    {formatCredsByProtocol(detail.creds_by_protocol)}
                  </Typography.Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="订阅链接">
                  {detail.subscription_url ||
                  detail.subscription?.subscription_url ||
                  detail.subscription?.url ? (
                    <CopyableUrlWithQr
                      url={
                        detail.subscription_url ||
                        detail.subscription?.subscription_url ||
                        detail.subscription?.url
                      }
                      label="订阅链接"
                    />
                  ) : detail.subscription?.revoked_at ? (
                    <Typography.Text type="danger">已撤销</Typography.Text>
                  ) : (
                    "-"
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="最近拉取 Agent">
                  {dash(detail.subscription?.last_fetch_agent)}
                </Descriptions.Item>
              </Descriptions>

              <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                说明：源 IP 历史 / SDK 应用与设备 ID / 顾客来源 / 本次在线时长 等字段以商户
                API 实际返回为准；当前上游未下发时显示「-」或提示文案。
              </Typography.Paragraph>
            </>
          )}
        </Spin>
      </Modal>

      <ModalForm
        title="创建上游顾客"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true, width: 640 }}
        onFinish={async (values) => {
          const body: Record<string, unknown> = {
            username: values.username,
            note: values.note || "",
            email: values.email || undefined,
            online_ip_limit: values.online_ip_limit ?? 3,
          };
          if (values.next_plan_ref) body.next_plan_ref = values.next_plan_ref;
          if (values.expire_at) {
            body.expire_at = dayjs(values.expire_at).toISOString();
          } else if (values.validity_seconds) {
            body.validity_seconds = Number(values.validity_seconds);
          }
          if (values.data_limit_gb != null && values.data_limit_gb !== "") {
            body.data_limit_bytes = Math.round(Number(values.data_limit_gb) * 1024 ** 3);
          }
          if (values.current_bandwidth_plan_ref) {
            body.current_bandwidth_plan_ref = values.current_bandwidth_plan_ref;
          }
          if (values.next_bandwidth_plan_ref) {
            body.next_bandwidth_plan_ref = values.next_bandwidth_plan_ref;
          }
          await adminFetch("/admin/v1/wireraw/customers", {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("创建成功");
          reload();
          return true;
        }}
      >
        <ProFormText name="username" label="username" rules={[{ required: true }]} />
        <ProFormText name="email" label="邮箱" />
        <ProFormDateTimePicker
          name="expire_at"
          label="到期时间（直接指定）"
          fieldProps={{ style: { width: "100%" }, showTime: true, format: "YYYY/MM/DD HH:mm" }}
        />
        <ProFormSelect
          name="next_plan_ref"
          label="套餐代码（配额/时长）"
          request={loadUpstreamPlanOptions}
          showSearch
          allowClear
        />
        <ProFormSelect
          name="current_bandwidth_plan_ref"
          label="带宽/限速档（速率）"
          request={loadBandwidthPlanOptions}
          showSearch
          allowClear
        />
        <ProFormSelect
          name="next_bandwidth_plan_ref"
          label="下期带宽套餐（到期生效）"
          request={loadBandwidthPlanOptions}
          showSearch
          allowClear
        />
        <ProFormDigit
          name="data_limit_gb"
          label="直传流量（GB，可选）"
          min={0}
          fieldProps={{ precision: 3 }}
          tooltip="0 = 不限流量；留空不设"
        />
        <ProFormDigit
          name="validity_seconds"
          label="直传有效期（秒，可选）"
          min={0}
          tooltip="未填到期时间时可用；与套餐二选一优先填到期时间"
        />
        <ProFormDigit
          name="online_ip_limit"
          label="最大在线设备数"
          min={1}
          initialValue={3}
        />
        <ProFormTextArea name="note" label="备注" />
      </ModalForm>

      <ModalForm
        title={`编辑顾客 — ${editRow?.end_user?.username || ""}`}
        open={!!editRow}
        onOpenChange={(open) => !open && setEditRow(null)}
        modalProps={{ destroyOnClose: true, width: 680 }}
        initialValues={
          editRow?.end_user
            ? {
                expire_at: editRow.end_user.expires_at
                  ? dayjs(editRow.end_user.expires_at)
                  : undefined,
                next_plan_ref: editRow.end_user.next_plan_ref || undefined,
                current_bandwidth_plan_ref:
                  editRow.end_user.current_bandwidth_plan_ref || "",
                next_bandwidth_plan_ref: editRow.end_user.next_bandwidth_plan_ref || "",
                data_limit_gb:
                  editRow.end_user.data_limit_bytes != null
                    ? Number((editRow.end_user.data_limit_bytes / 1024 ** 3).toFixed(6))
                    : 0,
                validity_seconds: 0,
                online_ip_limit: editRow.end_user.online_ip_limit ?? 3,
                note: editRow.end_user.note || "",
                status: editRow.end_user.status || "active",
              }
            : undefined
        }
        onFinish={async (values) => {
          const id = editRow?.end_user?.id;
          const username = editRow?.end_user?.username;
          if (!id || !username) return false;

          const body: Record<string, unknown> = {
            id,
            username,
            status: values.status || "active",
            note: values.note ?? "",
            online_ip_limit: Number(values.online_ip_limit ?? 3),
            next_plan_ref: values.next_plan_ref || "",
            current_bandwidth_plan_ref: values.current_bandwidth_plan_ref || "",
            next_bandwidth_plan_ref: values.next_bandwidth_plan_ref || "",
          };

          // Absolute expiry has highest priority (WireRaw field: expire_at)
          if (values.expire_at) {
            body.expire_at = dayjs(values.expire_at).toISOString();
          }

          // Optional direct traffic (GB → bytes). 0 = unlimited
          if (values.data_limit_gb != null && values.data_limit_gb !== "") {
            body.data_limit_bytes = Math.round(Number(values.data_limit_gb) * 1024 ** 3);
          }

          // Optional relative validity — only when expire_at empty and > 0
          if (
            !values.expire_at &&
            values.validity_seconds != null &&
            Number(values.validity_seconds) > 0
          ) {
            body.validity_seconds = Number(values.validity_seconds);
          }

          await adminFetch("/admin/v1/wireraw/customers", {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("已保存");
          reload();
          return true;
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          到期时间优先于「直传有效期」与套餐默认时长。带宽档空 = 回落商户默认上限。
        </Typography.Paragraph>
        <ProFormDateTimePicker
          name="expire_at"
          label="到期时间（直接指定）"
          rules={[{ required: true, message: "请指定到期时间" }]}
          fieldProps={{
            style: { width: "100%" },
            showTime: { format: "HH:mm" },
            format: "YYYY/MM/DD HH:mm",
          }}
        />
        <ProFormSelect
          name="next_plan_ref"
          label="套餐代码（配额/时长）"
          request={loadUpstreamPlanOptions}
          showSearch
          allowClear
          placeholder="如 unlimited_15d"
        />
        <ProFormSelect
          name="current_bandwidth_plan_ref"
          label="带宽/限速档（速率）"
          request={loadBandwidthPlanOptions}
          showSearch
        />
        <ProFormSelect
          name="next_bandwidth_plan_ref"
          label="下期带宽套餐（到期生效）"
          request={loadBandwidthPlanOptions}
          showSearch
        />
        <ProFormDigit
          name="data_limit_gb"
          label="直传流量（GB，可选）"
          min={0}
          fieldProps={{ precision: 3 }}
          tooltip="0 = 不限流量"
        />
        <ProFormDigit
          name="validity_seconds"
          label="直传有效期（秒，可选）"
          min={0}
          tooltip="已填到期时间时此项通常忽略；填 0 表示不用相对时长"
        />
        <ProFormDigit
          name="online_ip_limit"
          label="最大在线设备数"
          min={1}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="status"
          label="状态"
          options={[
            { value: "active", label: "active" },
            { value: "disabled", label: "disabled" },
            { value: "pending", label: "pending" },
          ]}
        />
        <ProFormTextArea name="note" label="备注" fieldProps={{ rows: 3 }} />
      </ModalForm>

      <ModalForm
        title={`续期 / 加量 — ${extendRow?.end_user?.username || ""}`}
        open={!!extendRow}
        onOpenChange={(open) => !open && setExtendRow(null)}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          const id = extendRow?.end_user?.id;
          if (!id) return false;
          const body: Record<string, unknown> = { note: values.note || undefined };
          if (values.validity_days) {
            body.validity_seconds = Number(values.validity_days) * 86400;
          }
          if (values.additional_gb) {
            body.additional_bytes = Math.round(Number(values.additional_gb) * 1024 ** 3);
          }
          if (!body.validity_seconds && !body.additional_bytes) {
            message.warning("请填写续期天数或加量 GB");
            return false;
          }
          await adminFetch(`/admin/v1/wireraw/customers/${id}/extend`, {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("续期成功");
          reload();
          return true;
        }}
      >
        <ProFormDigit name="validity_days" label="续期天数" min={1} />
        <ProFormDigit name="additional_gb" label="追加流量 (GB)" min={0} fieldProps={{ step: 1 }} />
        <ProFormTextArea name="note" label="备注" />
        <Space style={{ color: "#888", fontSize: 12 }}>至少填一项；未到期时长会叠加</Space>
      </ModalForm>
    </PageContainer>
  );
}
