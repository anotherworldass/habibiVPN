import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Modal, Space, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch, unwrapList } from "../lib/api";

type SellPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  upstreamPlanRef?: string | null;
  validitySeconds?: number | null;
  dataLimitBytes?: number | null;
  enabled: boolean;
  isFreeClaimable?: boolean;
  sortOrder: number;
};

function formatPrice(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatBytes(n?: number | null) {
  if (n == null) return "-";
  if (n === 0) return "不限";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

function formatDuration(sec?: number | null) {
  if (sec == null) return "-";
  if (sec % 86400 === 0) return `${sec / 86400} 天`;
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  return `${sec} 秒`;
}

export default function SellPlansPage() {
  const actionRef = useRef<ActionType>();
  const [editing, setEditing] = useState<SellPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = () => actionRef.current?.reload();

  const columns: ProColumns<SellPlan>[] = [
    { title: "排序", dataIndex: "sortOrder", width: 70, search: false },
    { title: "code", dataIndex: "code", copyable: true },
    { title: "名称", dataIndex: "name" },
    {
      title: "售价",
      dataIndex: "priceCents",
      search: false,
      render: (_, r) => formatPrice(r.priceCents, r.currency),
    },
    {
      title: "映射上游",
      dataIndex: "upstreamPlanRef",
      copyable: true,
      ellipsis: true,
      search: false,
    },
    {
      title: "时长",
      dataIndex: "validitySeconds",
      search: false,
      render: (_, r) => formatDuration(r.validitySeconds),
    },
    {
      title: "流量",
      dataIndex: "dataLimitBytes",
      search: false,
      render: (_, r) => formatBytes(r.dataLimitBytes),
    },
    {
      title: "免费领取",
      dataIndex: "isFreeClaimable",
      width: 90,
      search: false,
      render: (_, r) =>
        r.isFreeClaimable ? <Tag color="processing">可领</Tag> : <Tag>-</Tag>,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      valueType: "select",
      valueEnum: {
        true: { text: "上架", status: "Success" },
        false: { text: "下架", status: "Default" },
      },
      render: (_, r) =>
        r.enabled ? <Tag color="success">上架</Tag> : <Tag>下架</Tag>,
    },
    {
      title: "操作",
      valueType: "option",
      width: 160,
      render: (_, row) => [
        <a key="edit" onClick={() => setEditing(row)}>
          编辑
        </a>,
        <a
          key="toggle"
          onClick={async () => {
            await adminFetch(`/admin/v1/plans/${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ enabled: !row.enabled }),
            });
            message.success(row.enabled ? "已下架" : "已上架");
            reload();
          }}
        >
          {row.enabled ? "下架" : "上架"}
        </a>,
        <a
          key="del"
          style={{ color: "#cf1322" }}
          onClick={() => {
            Modal.confirm({
              title: "删除套餐？",
              content: "若已有订单会改为下架而非物理删除",
              okType: "danger",
              onOk: async () => {
                const res = await adminFetch<{ soft_disabled?: boolean; message?: string }>(
                  `/admin/v1/plans/${row.id}`,
                  { method: "DELETE" },
                );
                message.success(res.message || "已删除");
                reload();
              },
            });
          }}
        >
          删除
        </a>,
      ],
    },
  ];

  const formFields = (
    <>
      <ProFormText
        name="code"
        label="本地 code"
        rules={[{ required: true }]}
        tooltip="Habibi 内部 SKU 编码，如 monthly_pro"
        disabled={!!editing}
      />
      <ProFormText name="name" label="展示名称" rules={[{ required: true }]} />
      <ProFormDigit
        name="priceCents"
        label="价格（分）"
        rules={[{ required: true }]}
        min={0}
        tooltip="例如 990 = $9.90"
      />
      <ProFormSelect
        name="currency"
        label="币种"
        initialValue="USD"
        options={[
          { value: "USD", label: "USD" },
          { value: "CNY", label: "CNY" },
          { value: "EUR", label: "EUR" },
        ]}
      />
      <ProFormSelect
        name="upstreamPlanRef"
        label="映射上游套餐"
        tooltip="支付成功后开户用的 WireRaw next_plan_ref；也可不选，改用下方天数/流量"
        request={async () => {
          const data = await adminFetch("/admin/v1/wireraw/customer-plans");
          const plans = unwrapList<{ code: string; name: string }>(data, ["items", "plans"]);
          return plans.map((p) => ({
            label: `${p.name} (${p.code})`,
            value: p.code,
          }));
        }}
        showSearch
        allowClear
      />
      <ProFormDigit
        name="validityDays"
        label="有效天数（可选）"
        min={1}
        tooltip="未映射上游套餐时，开户可用 validity_seconds"
      />
      <ProFormDigit
        name="dataLimitGb"
        label="流量上限 GB（可选）"
        min={0}
        tooltip="0 表示不限；留空不设"
      />
      <ProFormDigit name="sortOrder" label="排序" initialValue={0} />
      <ProFormSwitch name="enabled" label="上架" initialValue />
      <ProFormSwitch
        name="isFreeClaimable"
        label="注册后可免费领取"
        tooltip="用户端「免费领取」会新建一个上游顾客槽；同一套餐每位用户仅一次"
      />
      <ProFormTextArea name="description" label="说明" />
    </>
  );

  const toPayload = (values: Record<string, unknown>) => {
    const body: Record<string, unknown> = {
      code: values.code,
      name: values.name,
      description: values.description || null,
      priceCents: Number(values.priceCents),
      currency: values.currency || "USD",
      upstreamPlanRef: values.upstreamPlanRef || null,
      enabled: !!values.enabled,
      isFreeClaimable: !!values.isFreeClaimable,
      sortOrder: Number(values.sortOrder ?? 0),
    };
    if (values.validityDays != null && values.validityDays !== "") {
      body.validitySeconds = Number(values.validityDays) * 86400;
    } else if (editing) {
      body.validitySeconds = null;
    }
    if (values.dataLimitGb != null && values.dataLimitGb !== "") {
      body.dataLimitGb = Number(values.dataLimitGb);
    } else if (editing) {
      body.dataLimitBytes = null;
    }
    return body;
  };

  return (
    <PageContainer
      title="售卖套餐"
      subTitle="Habibi 本地 SKU：定价与上下架；可映射 WireRaw 上游套餐 code"
    >
      <ProTable<SellPlan>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建套餐
          </Button>,
        ]}
        request={async (params) => {
          const qs =
            params.enabled === "true" || params.enabled === "false"
              ? `?enabled=${params.enabled}`
              : "";
          const data = await adminFetch<{ plans: SellPlan[] }>(`/admin/v1/plans${qs}`);
          let list = data.plans || [];
          if (params.code) {
            list = list.filter((p) => p.code.includes(String(params.code)));
          }
          if (params.name) {
            list = list.filter((p) => p.name.includes(String(params.name)));
          }
          return { data: list, success: true, total: list.length };
        }}
        search={{ labelWidth: "auto" }}
      />

      <ModalForm
        title="新建售卖套餐"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          await adminFetch("/admin/v1/plans", {
            method: "POST",
            body: JSON.stringify(toPayload(values)),
          });
          message.success("已创建");
          reload();
          return true;
        }}
      >
        {formFields}
      </ModalForm>

      <ModalForm
        title={`编辑 — ${editing?.name || ""}`}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        modalProps={{ destroyOnClose: true }}
        initialValues={
          editing
            ? {
                ...editing,
                validityDays: editing.validitySeconds
                  ? editing.validitySeconds / 86400
                  : undefined,
                dataLimitGb:
                  editing.dataLimitBytes != null && editing.dataLimitBytes > 0
                    ? Number((editing.dataLimitBytes / 1024 ** 3).toFixed(3))
                    : editing.dataLimitBytes === 0
                      ? 0
                      : undefined,
              }
            : undefined
        }
        onFinish={async (values) => {
          if (!editing) return false;
          const body = toPayload({ ...values, code: editing.code });
          delete body.code;
          await adminFetch(`/admin/v1/plans/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          message.success("已保存");
          reload();
          return true;
        }}
      >
        {formFields}
        <Space style={{ color: "#888", fontSize: 12 }}>
          说明：WireRaw 侧「顾客销售套餐」由平台绑定，商户无法自建；这里管的是你对外售卖的本地套餐。
        </Space>
      </ModalForm>
    </PageContainer>
  );
}
