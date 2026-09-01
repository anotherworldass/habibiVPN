import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { Space, Tag, Typography } from "antd";
import {
  ENTITLEMENT_CHANGE_FLAG_LABEL,
  EntitlementLedgerDetailModal,
  type EntitlementLedgerDetailRow,
} from "../components/EntitlementLedgerDetailModal";
import { adminFetch } from "../lib/api";
import { formatDateTime } from "../lib/time";

type EntitlementRow = EntitlementLedgerDetailRow;

const REASON_ENUM = {
  order_paid: { text: "订单开通" },
  iap: { text: "应用内购买" },
  redeem: { text: "兑换码" },
  campaign: { text: "活动奖励" },
  free_claim: { text: "免费领取" },
  admin_provision: { text: "后台开通" },
  refund_clawback: { text: "退款扣回" },
  signup_trial: { text: "注册赠送" },
} as const;

function formatBytes(raw: string | null | undefined) {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const abs = Math.abs(n);
  if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (abs >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatDeltaSeconds(sec: number | null | undefined) {
  if (sec == null) return "—";
  const sign = sec > 0 ? "+" : sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  if (abs >= 86400) return `${sign}${(abs / 86400).toFixed(1)} 天`;
  if (abs >= 3600) return `${sign}${(abs / 3600).toFixed(1)} 小时`;
  if (abs >= 60) return `${sign}${Math.round(abs / 60)} 分`;
  return `${sign}${abs} 秒`;
}

function planLabel(
  p: { id: string; code: string; name: string } | null | undefined,
  id: string | null,
) {
  if (p) return `${p.name} (${p.code})`;
  return id || "—";
}

function changeFlagTags(flags: Record<string, boolean> | undefined) {
  const keys = Object.keys(flags || {}).filter((k) => flags?.[k]);
  if (!keys.length) return "—";
  return (
    <Space size={[4, 4]} wrap>
      {keys.map((k) => (
        <Tag key={k}>{ENTITLEMENT_CHANGE_FLAG_LABEL[k] || k}</Tag>
      ))}
    </Space>
  );
}

export default function EntitlementLedgerPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [detail, setDetail] = useState<EntitlementRow | null>(null);

  const columns: ProColumns<EntitlementRow>[] = [
    {
      title: "时间",
      dataIndex: "created_at",
      width: 170,
      search: false,
      render: (_, r) => formatDateTime(r.created_at),
    },
    {
      title: "用户",
      dataIndex: "q",
      width: 160,
      fieldProps: { placeholder: "UID / 邮箱 / 槽 / 引用" },
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Link
            to={`/users/detail?user=${encodeURIComponent(r.user_id || "")}`}
          >
            UID {r.user?.uid ?? "—"}
          </Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.user?.email || (r.user_id || "").slice(0, 10)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "槽 ID",
      dataIndex: "slot_id",
      width: 140,
      search: false,
      ellipsis: true,
      copyable: true,
    },
    {
      title: "原因",
      dataIndex: "reason",
      width: 110,
      valueType: "select",
      valueEnum: REASON_ENUM,
      render: (_, r) => r.reason_label || r.reason,
    },
    {
      title: "变更",
      dataIndex: "change_flags",
      width: 180,
      search: false,
      render: (_, r) => changeFlagTags(r.change_flags),
    },
    {
      title: "套餐",
      search: false,
      width: 200,
      render: (_, r) => {
        const before = planLabel(r.plan_before, r.plan_id_before);
        const after = planLabel(r.plan_after, r.plan_id_after);
        if (before === after) return after;
        return (
          <span>
            {before} → {after}
          </span>
        );
      },
    },
    {
      title: "到期",
      search: false,
      width: 220,
      render: (_, r) => {
        const before = formatDateTime(r.expires_at_before);
        const after = formatDateTime(r.expires_at_after);
        return (
          <Space direction="vertical" size={0}>
            <span>
              {before} → {after}
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Δ {formatDeltaSeconds(r.expire_delta_seconds)}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: "流量限额",
      search: false,
      width: 160,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>
            {formatBytes(r.data_limit_before)} → {formatBytes(r.data_limit_after)}
          </span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Δ {formatBytes(r.data_limit_delta)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "引用",
      search: false,
      width: 160,
      ellipsis: true,
      render: (_, r) => {
        if (!r.ref_type && !r.ref_id) return "—";
        if (r.ref_type === "order" && r.ref_id) {
          return (
            <Link to={`/orders?q=${encodeURIComponent(r.ref_id)}`}>
              订单 {r.ref_id.slice(0, 10)}…
            </Link>
          );
        }
        return `${r.ref_type || "—"}:${r.ref_id || "—"}`;
      },
    },
    {
      title: "操作者",
      search: false,
      width: 120,
      ellipsis: true,
      render: (_, r) => {
        if (!r.actor_type) return "—";
        return `${r.actor_type}${r.actor_id ? `:${r.actor_id.slice(0, 8)}` : ""}`;
      },
    },
    {
      title: "操作",
      valueType: "option",
      width: 80,
      fixed: "right",
      render: (_, r) => [
        <a key="detail" onClick={() => setDetail(r)}>
          详情
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      title="权益流水"
      subTitle="Habibi 套餐槽的开通 / 续费 / 改套餐 / 流量 / 退款扣回（仅本功能上线后）"
    >
      <ProTable<EntitlementRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        scroll={{ x: 1680 }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        onRow={(r) => ({
          onDoubleClick: () => setDetail(r),
        })}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.reason) qs.set("reason", String(params.reason));
          if (params.q) qs.set("q", String(params.q));
          qs.set("limit", String(params.pageSize || 20));
          qs.set(
            "offset",
            String(((params.current || 1) - 1) * (params.pageSize || 20)),
          );
          const data = await adminFetch<{ total: number; items: EntitlementRow[] }>(
            `/admin/v1/entitlement-ledgers?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
      <EntitlementLedgerDetailModal
        row={detail}
        onClose={() => setDetail(null)}
      />
    </PageContainer>
  );
}
