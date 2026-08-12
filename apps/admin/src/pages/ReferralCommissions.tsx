import { useRef } from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { App, Button, Tag } from "antd";
import { adminFetch } from "../lib/api";

type Row = {
  id: string;
  level: number;
  amountCents: number;
  orderAmountCents: number;
  rateBps: number;
  status: string;
  settleAt: string;
  settledAt?: string | null;
  createdAt: string;
  orderId: string;
  promoGroupId?: string | null;
  beneficiary: { id: string; uid?: number; email?: string | null; inviteCode?: string };
  payer: { id: string; email?: string | null };
  promoGroup?: { id: string; name: string; code: string } | null;
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function ReferralCommissionsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const { modal, message } = App.useApp();

  async function invalidateCommission(row: Row) {
    modal.confirm({
      title: "作废该笔佣金？",
      content: "将回滚对应钱包余额，此操作不可撤销。",
      okText: "确认作废",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await adminFetch(`/admin/v1/referral/commissions/${row.id}/invalidate`, {
            method: "POST",
            body: JSON.stringify({ reason: "admin_invalidate" }),
          });
          message.success("已作废");
          actionRef.current?.reload();
        } catch (e) {
          message.error(e instanceof Error ? e.message : "作废失败");
          throw e;
        }
      },
    });
  }

  const columns: ProColumns<Row>[] = [
    {
      title: "受益人",
      dataIndex: ["beneficiary", "email"],
      width: 240,
      ellipsis: true,
      search: false,
      render: (_, r) => {
        const b = r.beneficiary;
        const uid = b.uid != null ? String(b.uid) : "—";
        const email = b.email || "匿名";
        return (
          <Link to={`/users/detail?user=${encodeURIComponent(b.id)}`} title={email}>
            {uid} · {email}
          </Link>
        );
      },
    },
    { title: "邀请码", dataIndex: ["beneficiary", "inviteCode"], width: 110, search: false },
    { title: "付费人", dataIndex: ["payer", "email"], ellipsis: true, search: false },
    {
      title: "用户组",
      dataIndex: ["promoGroup", "name"],
      width: 90,
      search: false,
      render: (_, r) => r.promoGroup?.name || "—",
    },
    { title: "层级", dataIndex: "level", width: 60, search: false },
    {
      title: "佣金",
      dataIndex: "amountCents",
      search: false,
      render: (_, r) => money(r.amountCents),
    },
    {
      title: "订单金额",
      dataIndex: "orderAmountCents",
      search: false,
      render: (_, r) => money(r.orderAmountCents),
    },
    {
      title: "比例",
      dataIndex: "rateBps",
      search: false,
      render: (_, r) => `${(r.rateBps / 100).toFixed(2)}%`,
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: {
        pending: { text: "待结算", status: "Processing" },
        settled: { text: "已结算", status: "Success" },
        invalid: { text: "已失效", status: "Error" },
      },
      render: (_, r) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: "processing", text: "待结算" },
          settled: { color: "success", text: "已结算" },
          invalid: { color: "error", text: "已失效" },
        };
        const m = map[r.status] || { color: "default", text: r.status };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: "预计结算",
      dataIndex: "settleAt",
      valueType: "dateTime",
      search: false,
    },
    {
      title: "操作",
      valueType: "option",
      width: 100,
      render: (_, row) =>
        row.status !== "invalid"
          ? [
              <Button
                key="inv"
                type="link"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  void invalidateCommission(row);
                }}
              >
                作废
              </Button>,
            ]
          : [],
    },
  ];

  return (
    <PageContainer title="佣金流水">
      <ProTable<Row>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        scroll={{ x: 1200 }}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.status) qs.set("status", String(params.status));
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          const data = await adminFetch<{ total: number; items: Row[] }>(
            `/admin/v1/referral/commissions?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
    </PageContainer>
  );
}
