import { useEffect, useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProTable,
} from "@ant-design/pro-components";
import { App, Button, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";

type OrderRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  provider?: string | null;
  paidAt?: string | null;
  createdAt: string;
  user: { id: string; email?: string | null };
  plan: { id: string; code: string; name: string };
  _count: { commissions: number };
};

type PlanOpt = { id: string; code: string; name: string; priceCents: number };

function money(cents: number, currency = "USD") {
  return `${(cents / 100).toFixed(2)} ${currency}`;
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

export default function ReferralOrdersPage() {
  const { modal, message } = App.useApp();
  const actionRef = useRef<ActionType>(undefined);
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PlanOpt[]>([]);

  useEffect(() => {
    void adminFetch<{ plans: PlanOpt[] }>("/admin/v1/plans?enabled=true")
      .then((res) => setPlans(res.plans || []))
      .catch(() => undefined);
  }, []);

  const columns: ProColumns<OrderRow>[] = [
    { title: "用户", dataIndex: ["user", "email"], ellipsis: true, search: false },
    { title: "套餐", dataIndex: ["plan", "name"], search: false },
    {
      title: "金额",
      dataIndex: "amountCents",
      search: false,
      render: (_, r) => money(r.amountCents, r.currency),
    },
    {
      title: "状态",
      dataIndex: "status",
      search: false,
      render: (_, r) => <Tag>{r.status}</Tag>,
    },
    { title: "来源", dataIndex: "provider", search: false },
    {
      title: "佣金条数",
      dataIndex: ["_count", "commissions"],
      search: false,
      width: 90,
    },
    { title: "支付时间", dataIndex: "paidAt", valueType: "dateTime", search: false },
    {
      title: "操作",
      valueType: "option",
      width: 120,
      render: (_, row) =>
        row.status !== "refunded"
          ? [
              <a
                key="refund"
                onClick={(e) => {
                  e.preventDefault();
                  modal.confirm({
                    title: "退款并作废佣金？",
                    content:
                      "将同步从套餐到期时间末尾扣回本单时长；扣完则禁用订阅槽。",
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
                }}
              >
                退款作废
              </a>,
            ]
          : [],
    },
  ];

  return (
    <PageContainer
      title="补记订单"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          补记付费订单
        </Button>
      }
    >
      <ProTable<OrderRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        request={async (params) => {
          const qs = new URLSearchParams();
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          const data = await adminFetch<{ total: number; items: OrderRow[] }>(
            `/admin/v1/referral/orders?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />

      <ModalForm
        title="补记付费订单（触发分佣）"
        open={open}
        onOpenChange={setOpen}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          const res = await adminFetch<{ ok: boolean; commission_created: number }>(
            "/admin/v1/referral/orders/manual",
            {
              method: "POST",
              body: JSON.stringify({
                user_id: values.user_id,
                plan_id: values.plan_id,
                amount_cents: values.amount_cents,
                note: values.note,
              }),
            },
          );
          message.success(`已创建，生成佣金 ${res.commission_created} 条`);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText
          name="user_id"
          label="用户 ID"
          rules={[{ required: true, message: "必填" }]}
        />
        <ProFormSelect
          name="plan_id"
          label="套餐"
          rules={[{ required: true }]}
          options={plans.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.code}) · ${(p.priceCents / 100).toFixed(2)}`,
          }))}
          fieldProps={{
            onChange: (id) => {
              const p = plans.find((x) => x.id === id);
              if (p) {
                /* amount prefill handled by form watch if needed */
              }
            },
          }}
        />
        <ProFormDigit
          name="amount_cents"
          label="金额（分，可空则用套餐价）"
          min={1}
          fieldProps={{ precision: 0 }}
        />
        <ProFormText name="note" label="备注" />
      </ModalForm>
    </PageContainer>
  );
}
