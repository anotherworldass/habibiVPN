import { useRef } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { adminFetch, unwrapList } from "../lib/api";

type NodeRow = {
  name?: string;
  region?: string;
  status?: string;
  public_ip?: string;
  advertise_host?: string;
  active_customers?: number;
  current_mbps_up?: number;
  current_mbps_down?: number;
};

export default function NodesPage() {
  const actionRef = useRef<ActionType>();

  const columns: ProColumns<NodeRow>[] = [
    { title: "名称", dataIndex: "name" },
    { title: "地区", dataIndex: "region", width: 80 },
    { title: "状态", dataIndex: "status", width: 100 },
    { title: "公网 IP", dataIndex: "public_ip", copyable: true },
    { title: "主机", dataIndex: "advertise_host", ellipsis: true },
    { title: "在线顾客", dataIndex: "active_customers", valueType: "digit" },
    { title: "上行 Mbps", dataIndex: "current_mbps_up", valueType: "digit" },
    { title: "下行 Mbps", dataIndex: "current_mbps_down", valueType: "digit" },
  ];

  return (
    <PageContainer title="节点池">
      <ProTable<NodeRow>
        rowKey={(r) => r.name || Math.random().toString()}
        actionRef={actionRef}
        search={false}
        columns={columns}
        request={async () => {
          const data = await adminFetch("/admin/v1/wireraw/nodes");
          const list = unwrapList<NodeRow>(data, ["items", "nodes"]);
          return { data: list, success: true };
        }}
      />
    </PageContainer>
  );
}
