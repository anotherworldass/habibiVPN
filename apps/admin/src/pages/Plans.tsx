import { useRef } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { adminFetch, unwrapList } from "../lib/api";

type PlanRow = {
  code?: string;
  name?: string;
  type?: string;
  enabled?: boolean;
  data_limit_bytes?: number;
  validity_seconds?: number;
  traffic_label?: string;
  duration_label?: string;
};

export default function PlansPage() {
  const actionRef = useRef<ActionType>(undefined);

  const columns: ProColumns<PlanRow>[] = [
    { title: "code", dataIndex: "code", copyable: true },
    { title: "名称", dataIndex: "name" },
    { title: "类型", dataIndex: "type", width: 120 },
    { title: "流量", dataIndex: "traffic_label", width: 120 },
    { title: "时长", dataIndex: "duration_label", width: 120 },
    {
      title: "流量(bytes)",
      dataIndex: "data_limit_bytes",
      valueType: "digit",
      hideInSearch: true,
    },
    {
      title: "有效期(秒)",
      dataIndex: "validity_seconds",
      valueType: "digit",
      hideInSearch: true,
    },
  ];

  return (
    <PageContainer
      title="上游顾客套餐（只读）"
      subTitle="由 WireRaw 平台绑定给商户，商户侧无法新建；售卖请用「售卖套餐」映射这些 code"
    >
      <ProTable<PlanRow>
        rowKey={(r) => r.code || Math.random().toString()}
        actionRef={actionRef}
        search={false}
        columns={columns}
        request={async () => {
          const data = await adminFetch("/admin/v1/wireraw/customer-plans");
          const list = unwrapList<PlanRow>(data, ["items", "plans"]);
          return { data: list, success: true };
        }}
      />
    </PageContainer>
  );
}
