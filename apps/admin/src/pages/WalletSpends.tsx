import { useRef } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { Input, Modal, Space, Tag } from "antd";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";

type Row = {
  id: string;
  itemName: string;
  kind: "phone_credit" | "gift_card";
  faceValueCents: number;
  priceCents: number;
  fulfillmentPayload: Record<string, unknown>;
  status: string;
  adminNote?: string | null;
  fulfillmentNote?: string | null;
  createdAt: string;
  user: {
    id: string;
    uid?: number;
    email?: string | null;
    inviteCode?: string;
  };
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

const kindLabel: Record<string, string> = {
  phone_credit: "话费",
  gift_card: "购物卡",
};

export default function WalletSpendsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const noteRef = useRef("");

  async function review(id: string, action: "fulfill" | "reject", kind: string) {
    noteRef.current = "";
    Modal.confirm({
      title: action === "fulfill" ? "确认已履约？" : "拒绝并退回余额？",
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
            {action === "fulfill"
              ? kind === "gift_card"
                ? "可填写卡密（用户可见）或充值回执"
                : "可填写充值回执（仅后台）"
              : "可选填写拒绝原因"}
          </div>
          <Input.TextArea
            rows={3}
            placeholder={action === "fulfill" ? "履约备注 / 卡密" : "拒绝原因"}
            onChange={(e) => {
              noteRef.current = e.target.value;
            }}
          />
        </div>
      ),
      onOk: async () => {
        const note = noteRef.current.trim();
        await adminFetch(`/admin/v1/referral/spends/${id}/review`, {
          method: "POST",
          body: JSON.stringify({
            action,
            ...(action === "fulfill"
              ? { fulfillment_note: note || undefined }
              : { admin_note: note || undefined }),
          }),
        });
        message.success("已更新");
        actionRef.current?.reload();
      },
    });
  }

  const columns: ProColumns<Row>[] = [
    {
      title: "用户",
      search: false,
      ellipsis: true,
      render: (_, r) => r.user.email || r.user.uid || r.user.id,
    },
    {
      title: "邀请码",
      dataIndex: ["user", "inviteCode"],
      width: 110,
      search: false,
    },
    {
      title: "商品",
      dataIndex: "itemName",
      search: false,
      ellipsis: true,
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 90,
      search: false,
      render: (_, r) => kindLabel[r.kind] || r.kind,
    },
    {
      title: "面值",
      dataIndex: "faceValueCents",
      width: 90,
      search: false,
      render: (_, r) => money(r.faceValueCents),
    },
    {
      title: "扣费",
      dataIndex: "priceCents",
      width: 90,
      search: false,
      render: (_, r) => money(r.priceCents),
    },
    {
      title: "履约信息",
      dataIndex: "fulfillmentPayload",
      search: false,
      ellipsis: true,
      render: (_, r) => JSON.stringify(r.fulfillmentPayload),
    },
    {
      title: "状态",
      dataIndex: "status",
      valueType: "select",
      valueEnum: {
        pending: { text: "待履约", status: "Processing" },
        fulfilled: { text: "已履约", status: "Success" },
        rejected: { text: "已拒绝", status: "Error" },
      },
      render: (_, r) => {
        const map: Record<string, string> = {
          pending: "processing",
          fulfilled: "success",
          rejected: "error",
        };
        return <Tag color={map[r.status] || "default"}>{r.status}</Tag>;
      },
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      valueType: "dateTime",
      search: false,
      width: 170,
    },
    {
      title: "操作",
      valueType: "option",
      width: 140,
      render: (_, row) => {
        if (row.status !== "pending") return null;
        return (
          <Space>
            <a onClick={() => void review(row.id, "fulfill", row.kind)}>履约</a>
            <a onClick={() => void review(row.id, "reject", row.kind)}>拒绝</a>
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer title="兑换审核" subTitle="人工充值/发卡后点履约；拒绝将退回佣金余额">
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
            `/admin/v1/referral/spends?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
    </PageContainer>
  );
}
