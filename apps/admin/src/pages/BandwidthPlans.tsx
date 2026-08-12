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
import { adminFetch, unwrapList } from "../lib/api";

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

export default function BandwidthPlansPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);

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
      width: 80,
      render: (_, row) => [
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

  return (
    <PageContainer
      title="上游限速套餐"
      subTitle="WireRaw MerchantBandwidthPlan：控制顾客速率档位，可绑到顾客 current_bandwidth_plan_ref"
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
          const list = unwrapList<BwPlan>(data, ["plans", "items"]);
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
            body: JSON.stringify({
              name: values.name,
              max_up_mbps: values.max_up_mbps ?? 0,
              max_down_mbps: values.max_down_mbps ?? 0,
              online_ip_limit: values.online_ip_limit || undefined,
              validity_seconds: values.validity_days
                ? Number(values.validity_days) * 86400
                : undefined,
              data_limit_bytes: values.data_limit_gb
                ? Math.round(Number(values.data_limit_gb) * 1024 ** 3)
                : undefined,
              status: values.status || "active",
              note: values.note || undefined,
            }),
          });
          message.success("已创建");
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="name" label="名称" rules={[{ required: true }]} />
        <ProFormDigit name="max_up_mbps" label="上行 Mbps" min={0} />
        <ProFormDigit name="max_down_mbps" label="下行 Mbps" min={0} />
        <ProFormDigit name="online_ip_limit" label="同时在线设备" min={1} />
        <ProFormDigit name="validity_days" label="有效天数（可选）" min={1} />
        <ProFormDigit name="data_limit_gb" label="流量 GB（可选）" min={0} />
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
      </ModalForm>
    </PageContainer>
  );
}
