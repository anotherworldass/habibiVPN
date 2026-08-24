import { useRef } from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { App, Button, Tag, Typography } from "antd";
import { adminFetch } from "../lib/api";

type OrderRow = {
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
  provisionError?: string | null;
  user: { id: string; email?: string | null; uid?: number | null };
  plan: { id: string; code: string; name: string };
  paymentChannel?: { id: string; code: string; name: string } | null;
  _count?: { commissions: number };
};

type EntitlementRes = {
  ok: boolean;
  skipped?: string;
  error?: string;
  previous_expires_at?: string | null;
  new_expires_at?: string;
  clawback_seconds?: number;
  disabled?: boolean;
};

const STATUS_ENUM = {
  pending: { text: "待支付", status: "Processing" },
  paid: { text: "已支付", status: "Success" },
  provisioning: { text: "开通中", status: "Processing" },
  provisioned: { text: "已开通", status: "Success" },
  failed: { text: "失败", status: "Error" },
  refunded: { text: "已退款", status: "Error" },
  cancelled: { text: "已取消", status: "Default" },
} as const;

function money(cents: number, currency = "CNY") {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function statusColor(status: string) {
  if (status === "provisioned" || status === "paid") return "success";
  if (status === "pending" || status === "provisioning") return "processing";
  if (status === "failed" || status === "refunded") return "error";
  return "default";
}

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

export default function OrdersPage() {
  const actionRef = useRef<ActionType>(undefined);
  const { modal, message } = App.useApp();

  async function refund(row: OrderRow) {
    modal.confirm({
      title: "退款并作废佣金？",
      content: "将同步从套餐到期时间末尾扣回本单时长；扣完则禁用订阅槽。",
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
          actionRef.current?.reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "退款失败");
          throw err;
        }
      },
    });
  }

  async function cancel(row: OrderRow) {
    modal.confirm({
      title: "取消这笔待支付订单？",
      content:
        "将释放该用户占用的待支付名额与优惠券。若用户之后仍完成支付，订单会照常转为已支付并开通。",
      okText: "确认取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await adminFetch(`/admin/v1/orders/${row.id}/cancel`, {
            method: "POST",
          });
          message.success("已取消");
          actionRef.current?.reload();
        } catch (err) {
          message.error(err instanceof Error ? err.message : "取消失败");
          throw err;
        }
      },
    });
  }

  const columns: ProColumns<OrderRow>[] = [
    {
      title: "关键词",
      dataIndex: "q",
      hideInTable: true,
      fieldProps: { placeholder: "UID / 邮箱 / 订单号 / 渠道单号" },
    },
    {
      title: "仅已收款",
      dataIndex: "paid_only",
      hideInTable: true,
      valueType: "select",
      initialValue: "",
      valueEnum: {
        "": { text: "全部" },
        "1": { text: "仅已收款（>0）" },
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      width: 168,
      search: false,
      sorter: true,
    },
    {
      title: "用户",
      dataIndex: ["user", "email"],
      width: 200,
      ellipsis: true,
      search: false,
      render: (_, r) => {
        const uid = r.user.uid != null ? String(r.user.uid) : "—";
        const email = r.user.email || "匿名";
        return (
          <Link to={`/users/detail?user=${encodeURIComponent(r.user.id)}`}>
            {uid} · {email}
          </Link>
        );
      },
    },
    {
      title: "套餐",
      dataIndex: ["plan", "name"],
      width: 140,
      ellipsis: true,
      search: false,
      render: (_, r) => (
        <span title={r.plan.code}>
          {r.plan.name}
        </span>
      ),
    },
    {
      title: "实付",
      dataIndex: "amountCents",
      width: 110,
      search: false,
      render: (_, r) => (
        <span>
          {money(r.amountCents, r.currency)}
          {r.isTrialPeriod ? (
            <Tag style={{ marginLeft: 4 }} color="blue">
              试用
            </Tag>
          ) : null}
        </span>
      ),
    },
    {
      title: "优惠",
      dataIndex: "discountCents",
      width: 100,
      search: false,
      render: (_, r) =>
        r.discountCents && r.discountCents > 0
          ? `-${money(r.discountCents, r.currency)}${r.couponCode ? ` (${r.couponCode})` : ""}`
          : "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      valueType: "select",
      valueEnum: STATUS_ENUM,
      render: (_, r) => (
        <Tag color={statusColor(r.status)}>
          {STATUS_ENUM[r.status as keyof typeof STATUS_ENUM]?.text || r.status}
        </Tag>
      ),
    },
    {
      title: "渠道",
      dataIndex: "provider",
      width: 120,
      ellipsis: true,
      fieldProps: { placeholder: "provider 关键字" },
      render: (_, r) => r.paymentChannel?.name || r.provider || "—",
    },
    {
      title: "类型",
      dataIndex: "commissionKind",
      width: 72,
      search: false,
      render: (_, r) =>
        r.commissionKind === "renew" ? "续费" : r.commissionKind === "first" ? "首购" : "—",
    },
    {
      title: "支付时间",
      dataIndex: "paidAt",
      valueType: "dateTime",
      width: 168,
      search: false,
    },
    {
      title: "订单号",
      dataIndex: "id",
      width: 140,
      ellipsis: true,
      search: false,
      copyable: true,
      render: (_, r) => (
        <Typography.Text copyable={{ text: r.id }} style={{ fontSize: 12 }}>
          {r.id.slice(0, 12)}…
        </Typography.Text>
      ),
    },
    {
      title: "渠道单号",
      dataIndex: "providerRef",
      width: 140,
      ellipsis: true,
      search: false,
      render: (_, r) =>
        r.providerRef ? (
          <Typography.Text copyable={{ text: r.providerRef }} style={{ fontSize: 12 }}>
            {r.providerRef.length > 16 ? `${r.providerRef.slice(0, 14)}…` : r.providerRef}
          </Typography.Text>
        ) : (
          "—"
        ),
    },
    {
      title: "备注",
      dataIndex: "failureReason",
      width: 160,
      ellipsis: true,
      search: false,
      render: (_, r) => r.failureReason || r.provisionError || "—",
    },
    {
      title: "操作",
      valueType: "option",
      width: 100,
      fixed: "right",
      render: (_, row) => {
        if (row.status === "pending") {
          return [
            <Button
              key="cancel"
              type="link"
              size="small"
              danger
              onClick={(e) => {
                e.stopPropagation();
                void cancel(row);
              }}
            >
              取消
            </Button>,
          ];
        }
        const canRefund =
          row.status !== "refunded" &&
          row.status !== "cancelled" &&
          row.status !== "failed";
        return canRefund
          ? [
              <Button
                key="refund"
                type="link"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  void refund(row);
                }}
              >
                退款
              </Button>,
            ]
          : [];
      },
    },
  ];

  return (
    <PageContainer
      title="订单流水"
      subTitle="当前项目下的支付订单（含待支付 / 失败 / IAP）"
    >
      <ProTable<OrderRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        scroll={{ x: 1600 }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.status) qs.set("status", String(params.status));
          if (params.q) qs.set("q", String(params.q));
          if (params.provider) qs.set("provider", String(params.provider));
          if (params.paid_only) qs.set("paid_only", String(params.paid_only));
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          const data = await adminFetch<{ total: number; items: OrderRow[] }>(
            `/admin/v1/orders?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
    </PageContainer>
  );
}
