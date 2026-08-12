import { useRef } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { Modal, Space, Tag } from "antd";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";

type Row = {
  id: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  method: string;
  accountPayload: Record<string, unknown>;
  status: string;
  adminNote?: string | null;
  createdAt: string;
  user: { id: string; email?: string | null; inviteCode?: string };
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function ReferralWithdrawalsPage() {
  const actionRef = useRef<ActionType>(undefined);

  async function review(id: string, action: "approve" | "reject" | "paid") {
    Modal.confirm({
      title:
        action === "approve"
          ? "通过提现申请？"
          : action === "reject"
            ? "拒绝并退回余额？"
            : "确认已打款？",
      onOk: async () => {
        await adminFetch(`/admin/v1/referral/withdrawals/${id}/review`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        message.success("已更新");
        actionRef.current?.reload();
      },
    });
  }

  const columns: ProColumns<Row>[] = [
    { title: "用户", dataIndex: ["user", "email"], ellipsis: true, search: false },
    { title: "邀请码", dataIndex: ["user", "inviteCode"], width: 110, search: false },
    {
      title: "申请金额",
      dataIndex: "amountCents",
      search: false,
      render: (_, r) => money(r.amountCents),
    },
    {
      title: "手续费",
      dataIndex: "feeCents",
      search: false,
      render: (_, r) => money(r.feeCents),
    },
    {
      title: "实付",
      dataIndex: "netCents",
      search: false,
      render: (_, r) => money(r.netCents),
    },
    { title: "方式", dataIndex: "method", width: 80, search: false },
    {
      title: "收款信息",
      dataIndex: "accountPayload",
      search: false,
      ellipsis: true,
      render: (_, r) => JSON.stringify(r.accountPayload),
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: {
        pending: { text: "待审核", status: "Processing" },
        approved: { text: "已通过", status: "Warning" },
        paid: { text: "已打款", status: "Success" },
        rejected: { text: "已拒绝", status: "Error" },
      },
      render: (_, r) => {
        const map: Record<string, string> = {
          pending: "processing",
          approved: "gold",
          paid: "success",
          rejected: "error",
        };
        return <Tag color={map[r.status] || "default"}>{r.status}</Tag>;
      },
    },
    { title: "申请时间", dataIndex: "createdAt", valueType: "dateTime", search: false },
    {
      title: "操作",
      valueType: "option",
      width: 180,
      render: (_, row) => {
        const actions = [];
        if (row.status === "pending") {
          actions.push(
            <a key="ok" onClick={() => void review(row.id, "approve")}>
              通过
            </a>,
            <a key="no" onClick={() => void review(row.id, "reject")}>
              拒绝
            </a>,
          );
        }
        if (row.status === "pending" || row.status === "approved") {
          actions.push(
            <a key="paid" onClick={() => void review(row.id, "paid")}>
              已打款
            </a>,
          );
        }
        if (row.status === "approved") {
          actions.push(
            <a key="rej" onClick={() => void review(row.id, "reject")}>
              拒绝
            </a>,
          );
        }
        return <Space>{actions}</Space>;
      },
    },
  ];

  return (
    <PageContainer title="提现审核">
      <ProTable<Row>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.status) qs.set("status", String(params.status));
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          const data = await adminFetch<{ total: number; items: Row[] }>(
            `/admin/v1/referral/withdrawals?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
    </PageContainer>
  );
}
