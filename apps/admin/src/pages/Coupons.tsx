import { useEffect, useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDateTimePicker,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";

const CLIENTS = [
  { value: "h5", label: "H5" },
  { value: "android_direct", label: "Android 非商店" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "ios_alt", label: "iOS 企业签" },
  { value: "ios_appstore", label: "iOS App Store（通常关闭）" },
  { value: "android_play", label: "Play（通常关闭）" },
];

type Coupon = {
  id: string;
  code: string;
  name: string;
  discount_type: "percent" | "fixed_amount";
  discount_value: number;
  discount_value_display?: number;
  status: string;
  min_order_cents: number;
  max_discount_cents: number | null;
  plan_ids: string[];
  per_user_limit: number;
  total_limit: number | null;
  clients: Array<{ client: string; enabled: boolean }>;
};

type PlanOpt = { id: string; code: string; name: string };

const statusColor: Record<string, string> = {
  draft: "default",
  active: "success",
  paused: "warning",
  ended: "error",
};

export default function CouponsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [plans, setPlans] = useState<PlanOpt[]>([]);

  useEffect(() => {
    void adminFetch<{ plans: PlanOpt[] }>("/admin/v1/coupons/meta")
      .then((r) => setPlans(r.plans || []))
      .catch(() => setPlans([]));
  }, []);

  const columns: ProColumns<Coupon>[] = [
    { title: "code", dataIndex: "code", copyable: true },
    { title: "名称", dataIndex: "name" },
    {
      title: "优惠",
      search: false,
      render: (_, r) =>
        r.discount_type === "percent"
          ? `${r.discount_value_display ?? r.discount_value / 100}%`
          : `${(r.discount_value / 100).toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => <Tag color={statusColor[r.status]}>{r.status}</Tag>,
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, row) => [
        <a key="e" onClick={() => setEditing(row)}>
          编辑
        </a>,
      ],
    },
  ];

  const form = (initial?: Coupon | null) => (
    <ModalForm
      title={initial ? "编辑优惠券" : "新建优惠券"}
      open={initial ? !!editing : createOpen}
      onOpenChange={(v) => {
        if (!v) {
          setCreateOpen(false);
          setEditing(null);
        }
      }}
      modalProps={{ destroyOnClose: true, width: 640 }}
      initialValues={{
        code: initial?.code,
        name: initial?.name,
        discountType: initial?.discount_type || "percent",
        discountValue:
          initial?.discount_value_display ??
          (initial?.discount_type === "fixed_amount"
            ? initial.discount_value
            : 10),
        minOrderCents: initial?.min_order_cents ?? 0,
        maxDiscountCents: initial?.max_discount_cents ?? undefined,
        planIds: initial?.plan_ids || [],
        status: initial?.status || "draft",
        perUserLimit: initial?.per_user_limit ?? 1,
        totalLimit: initial?.total_limit ?? undefined,
        clients: (() => {
          const from = (initial?.clients || []).filter((c) => c.enabled).map((c) => c.client);
          return from.length
            ? from
            : ["h5", "android_direct", "windows", "macos", "ios_alt"];
        })(),
      }}
      onFinish={async (raw) => {
        const body = {
          code: String(raw.code).toUpperCase(),
          name: raw.name,
          discountType: raw.discountType,
          discountValue: Number(raw.discountValue),
          minOrderCents: Number(raw.minOrderCents) || 0,
          maxDiscountCents:
            raw.maxDiscountCents == null || raw.maxDiscountCents === ""
              ? null
              : Number(raw.maxDiscountCents),
          planIds: raw.planIds || [],
          status: raw.status,
          perUserLimit: Number(raw.perUserLimit) || 1,
          totalLimit:
            raw.totalLimit == null || raw.totalLimit === ""
              ? null
              : Number(raw.totalLimit),
          clients: ((raw.clients as string[]) || []).map((client) => ({
            client,
            enabled: true,
          })),
          remark: raw.remark || null,
        };
        if (initial) {
          await adminFetch(`/admin/v1/coupons/${initial.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          message.success("已保存");
          setEditing(null);
        } else {
          await adminFetch("/admin/v1/coupons", {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("已创建");
          setCreateOpen(false);
        }
        actionRef.current?.reload();
        return true;
      }}
    >
      <ProFormText name="code" label="券码" rules={[{ required: true }]} disabled={!!initial} />
      <ProFormText name="name" label="名称" rules={[{ required: true }]} />
      <ProFormSelect
        name="discountType"
        label="优惠类型"
        options={[
          { value: "percent", label: "百分比折扣" },
          { value: "fixed_amount", label: "固定减免（分）" },
        ]}
      />
      <ProFormDependency name={["discountType"]}>
        {({ discountType }) => (
          <ProFormDigit
            name="discountValue"
            label={discountType === "percent" ? "折扣 %" : "减免金额（分）"}
            min={1}
            max={discountType === "percent" ? 100 : undefined}
            rules={[{ required: true }]}
            extra="分销佣金按券后实付 amount_cents 计算"
          />
        )}
      </ProFormDependency>
      <ProFormDigit name="minOrderCents" label="最低订单金额（分）" min={0} />
      <ProFormDigit name="maxDiscountCents" label="最高减免（分，可选）" min={1} />
      <ProFormSelect
        name="planIds"
        label="适用套餐（空=全部）"
        mode="multiple"
        options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
      />
      <ProFormSelect
        name="clients"
        label="适用端"
        mode="multiple"
        options={CLIENTS}
        rules={[{ required: true }]}
      />
      <ProFormSelect
        name="status"
        label="状态"
        options={[
          { value: "draft", label: "草稿" },
          { value: "active", label: "上线" },
          { value: "paused", label: "暂停" },
          { value: "ended", label: "结束" },
        ]}
      />
      <ProFormDigit name="perUserLimit" label="每人可用次数" min={1} />
      <ProFormDigit name="totalLimit" label="全站总次数（空=不限）" min={1} />
      <ProFormTextArea name="remark" label="备注" />
    </ModalForm>
  );

  return (
    <PageContainer
      header={{
        title: "优惠券",
        subTitle: "仅影响三方支付下单价；佣金按券后实付",
      }}
    >
      <ProTable<Coupon>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        toolBarRender={() => [
          <Button
            key="c"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建优惠券
          </Button>,
        ]}
        request={async () => {
          const res = await adminFetch<{ coupons: Coupon[] }>("/admin/v1/coupons");
          return { data: res.coupons || [], success: true };
        }}
      />
      {form(null)}
      {editing ? form(editing) : null}
    </PageContainer>
  );
}
