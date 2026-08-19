import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Modal } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch, sortBandwidthPlansBySpeed, unwrapList } from "../lib/api";

type BwPlan = {
  id?: string;
  name?: string;
  max_up_mbps?: number;
  max_down_mbps?: number;
  data_limit_bytes?: number;
  validity_seconds?: number;
  online_ip_limit?: number;
  status?: string;
  note?: string;
};

function toBody(values: Record<string, unknown>, id?: string) {
  const validityDays = Number(values.validity_days);
  const dataGb = Number(values.data_limit_gb);
  return {
    ...(id ? { id } : {}),
    name: values.name,
    max_up_mbps: values.max_up_mbps ?? 0,
    max_down_mbps: values.max_down_mbps ?? 0,
    online_ip_limit: values.online_ip_limit || undefined,
    validity_seconds:
      Number.isFinite(validityDays) && validityDays > 0
        ? Math.round(validityDays * 86400)
        : undefined,
    data_limit_bytes:
      Number.isFinite(dataGb) && dataGb > 0
        ? Math.round(dataGb * 1024 ** 3)
        : undefined,
    status: values.status || "active",
    note: values.note || undefined,
  };
}

function toFormValues(row: BwPlan) {
  return {
    name: row.name,
    max_up_mbps: row.max_up_mbps ?? 0,
    max_down_mbps: row.max_down_mbps ?? 0,
    online_ip_limit: row.online_ip_limit,
    validity_days:
      row.validity_seconds && row.validity_seconds > 0
        ? Math.round(row.validity_seconds / 86400)
        : undefined,
    data_limit_gb:
      row.data_limit_bytes && row.data_limit_bytes > 0
        ? Number((row.data_limit_bytes / 1024 ** 3).toFixed(6))
        : undefined,
    status: row.status || "active",
    note: row.note,
  };
}

export default function BandwidthPlansPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BwPlan | null>(null);

  const columns: ProColumns<BwPlan>[] = [
    { title: "ID", dataIndex: "id", copyable: true, ellipsis: true },
    { title: "名称", dataIndex: "name" },
    { title: "上行 Mbps", dataIndex: "max_up_mbps", search: false },
    { title: "下行 Mbps", dataIndex: "max_down_mbps", search: false },
    { title: "在线设备", dataIndex: "online_ip_limit", search: false },
    { title: "状态", dataIndex: "status", width: 100 },
    {
      title: "操作",
      valueType: "option",
      width: 120,
      render: (_, row) => [
        <a key="edit" onClick={() => row.id && setEditing(row)}>
          编辑
        </a>,
        <a
          key="del"
          style={{ color: "#cf1322" }}
          onClick={() => {
            if (!row.id) return;
            Modal.confirm({
              title: "删除带宽套餐？",
              content: "若仍有顾客绑定会失败，需先解绑",
              okType: "danger",
              onOk: async () => {
                await adminFetch(`/admin/v1/wireraw/bandwidth-plans/${row.id}`, {
                  method: "DELETE",
                });
                message.success("已删除");
                actionRef.current?.reload();
              },
            });
          }}
        >
          删除
        </a>,
      ],
    },
  ];

  const fields = (
    <>
      <ProFormText name="name" label="名称" rules={[{ required: true }]} />
      <ProFormDigit
        name="max_up_mbps"
        label="上行 Mbps"
        min={0}
        tooltip="0 = 未设，继承商户 cap。改 Mbps 会立刻作用到所有绑了此档的顾客。"
      />
      <ProFormDigit name="max_down_mbps" label="下行 Mbps" min={0} />
      <ProFormDigit name="online_ip_limit" label="同时在线设备" min={1} />
      <ProFormDigit name="validity_days" label="有效天数（可选）" min={1} />
      <ProFormDigit
        name="data_limit_gb"
        label="流量 GB（可选）"
        min={0}
        tooltip="公平使用阶梯用的档不要填流量额度，否则绑档可能把无限流量改成硬顶。"
      />
      <ProFormSelect
        name="status"
        label="状态"
        initialValue="active"
        options={[
          { value: "active", label: "active" },
          { value: "disabled", label: "disabled" },
        ]}
      />
      <ProFormTextArea name="note" label="备注" />
    </>
  );

  return (
    <PageContainer
      title="上游限速套餐"
      subTitle="WireRaw MerchantBandwidthPlan：可新建/修改 Mbps。改档后已绑定顾客立即按新速率生效；售卖套餐阶梯仍引用同一 id。"
    >
      <ProTable<BwPlan>
        rowKey={(r) => r.id || Math.random().toString()}
        actionRef={actionRef}
        search={false}
        columns={columns}
        toolBarRender={() => [
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建限速档
          </Button>,
        ]}
        request={async () => {
          const data = await adminFetch("/admin/v1/wireraw/bandwidth-plans");
          const list = sortBandwidthPlansBySpeed(
            unwrapList<BwPlan>(data, ["plans", "items"]),
          );
          return { data: list, success: true };
        }}
      />

      <ModalForm
        title="新建上游限速套餐"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          await adminFetch("/admin/v1/wireraw/bandwidth-plans", {
            method: "POST",
            body: JSON.stringify(toBody(values)),
          });
          message.success("已创建");
          actionRef.current?.reload();
          return true;
        }}
      >
        {fields}
      </ModalForm>

      <ModalForm
        key={editing?.id || "edit-bw"}
        title={`编辑限速档${editing?.id ? ` · ${editing.id}` : ""}`}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        modalProps={{ destroyOnClose: true }}
        initialValues={editing ? toFormValues(editing) : undefined}
        onFinish={async (values) => {
          if (!editing?.id) return false;
          await adminFetch("/admin/v1/wireraw/bandwidth-plans", {
            method: "POST",
            body: JSON.stringify(toBody(values, editing.id)),
          });
          message.success("已保存");
          actionRef.current?.reload();
          return true;
        }}
      >
        {fields}
      </ModalForm>
    </PageContainer>
  );
}
