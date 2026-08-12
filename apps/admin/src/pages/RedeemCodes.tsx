import { useEffect, useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDateTimePicker,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Drawer, InputNumber, Space, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import { getToken } from "../lib/auth";
import { getProjectId } from "../lib/project";

const CLIENTS = [
  { value: "ios_appstore", label: "iOS App Store" },
  { value: "ios_alt", label: "iOS 企业签" },
  { value: "android_play", label: "Play" },
  { value: "android_direct", label: "Android 非商店" },
  { value: "h5", label: "H5" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
];

type Batch = {
  id: string;
  name: string;
  plan_id: string | null;
  plan?: { id: string; code: string; name: string } | null;
  validity_seconds: number | null;
  enabled: boolean;
  codes_count?: number;
  max_redemptions_per_user: number;
  clients: Array<{ client: string; enabled: boolean }>;
  start_at: string | null;
  end_at: string | null;
};

type PlanOpt = { id: string; code: string; name: string; validitySeconds?: number | null };

type CodeRow = {
  id: string;
  code: string;
  status: string;
  redeemed_at: string | null;
  created_at: string;
};

export default function RedeemCodesPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [plans, setPlans] = useState<PlanOpt[]>([]);
  const [codesBatch, setCodesBatch] = useState<Batch | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [genCount, setGenCount] = useState(10);

  useEffect(() => {
    void adminFetch<{ plans: PlanOpt[] }>("/admin/v1/redeem/meta")
      .then((r) => setPlans(r.plans || []))
      .catch(() => setPlans([]));
  }, []);

  const loadCodes = async (batch: Batch) => {
    setCodesBatch(batch);
    const res = await adminFetch<{ codes: CodeRow[] }>(
      `/admin/v1/redeem/batches/${batch.id}/codes?page_size=100`,
    );
    setCodes(res.codes || []);
  };

  const columns: ProColumns<Batch>[] = [
    { title: "名称", dataIndex: "name" },
    {
      title: "奖励",
      search: false,
      render: (_, r) =>
        r.plan
          ? `套餐 ${r.plan.name}`
          : r.validity_seconds
            ? `${Math.round(r.validity_seconds / 3600)} 小时`
            : "-",
    },
    {
      title: "码数量",
      dataIndex: "codes_count",
      search: false,
      width: 90,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 80,
      render: (_, r) => (
        <Tag color={r.enabled ? "success" : "default"}>
          {r.enabled ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      valueType: "option",
      width: 260,
      render: (_, row) => [
        <a key="codes" onClick={() => void loadCodes(row)}>
          查看码
        </a>,
        <a
          key="csv"
          href={`/admin/v1/redeem/batches/${row.id}/codes?export=csv`}
          onClick={async (e) => {
            e.preventDefault();
            const res = await fetch(
              `/admin/v1/redeem/batches/${row.id}/codes?export=csv`,
              {
                headers: {
                  Authorization: `Bearer ${getToken() || ""}`,
                  "X-Admin-Project-Id": getProjectId() || "",
                },
              },
            );
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `redeem_${row.id}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          导出 CSV
        </a>,
      ],
    },
  ];

  return (
    <PageContainer header={{ title: "兑换码", subTitle: "可关联套餐或自定义时长" }}>
      <ProTable<Batch>
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
            新建批次
          </Button>,
        ]}
        request={async () => {
          const res = await adminFetch<{ batches: Batch[] }>("/admin/v1/redeem/batches");
          return { data: res.batches || [], success: true };
        }}
      />

      <ModalForm
        title="新建兑换码批次"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true, width: 640 }}
        initialValues={{
          rewardMode: "plan",
          enabled: true,
          maxRedemptionsPerUser: 1,
          clients: CLIENTS.map((c) => c.value),
          generateCount: 20,
          stackMode: "extend_active",
        }}
        onFinish={async (raw) => {
          const clients = ((raw.clients as string[]) || []).map((client) => ({
            client,
            enabled: true,
          }));
          const body: Record<string, unknown> = {
            name: raw.name,
            enabled: raw.enabled !== false,
            maxRedemptionsPerUser: Number(raw.maxRedemptionsPerUser) || 1,
            stackMode: raw.stackMode || "extend_active",
            clients,
            remark: raw.remark || null,
          };
          if (raw.rewardMode === "plan") {
            body.planId = raw.planId;
          } else {
            body.validitySeconds = Math.round(Number(raw.rewardHours || 2) * 3600);
          }
          const created = await adminFetch<{ batch: Batch }>("/admin/v1/redeem/batches", {
            method: "POST",
            body: JSON.stringify(body),
          });
          const count = Number(raw.generateCount) || 0;
          if (count > 0 && created.batch?.id) {
            await adminFetch(`/admin/v1/redeem/batches/${created.batch.id}/generate`, {
              method: "POST",
              body: JSON.stringify({ count }),
            });
          }
          message.success("已创建");
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="name" label="批次名称" rules={[{ required: true }]} />
        <ProFormSelect
          name="rewardMode"
          label="奖励类型"
          options={[
            { value: "plan", label: "关联已有套餐" },
            { value: "duration", label: "自定义时长" },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormDependency name={["rewardMode"]}>
          {({ rewardMode }) =>
            rewardMode === "plan" ? (
              <ProFormSelect
                name="planId"
                label="套餐"
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.code})`,
                }))}
                rules={[{ required: true }]}
              />
            ) : (
              <ProFormDigit
                name="rewardHours"
                label="时长（小时）"
                min={0.1}
                initialValue={2}
                rules={[{ required: true }]}
              />
            )
          }
        </ProFormDependency>
        <ProFormSelect
          name="clients"
          label="适用端"
          mode="multiple"
          options={CLIENTS}
          rules={[{ required: true }]}
        />
        <ProFormDigit name="maxRedemptionsPerUser" label="每人可兑次数" min={1} />
        <ProFormDigit name="generateCount" label="立即生成码数量" min={0} max={5000} />
        <ProFormSwitch name="enabled" label="启用" />
        <ProFormTextArea name="remark" label="备注" />
      </ModalForm>

      <Drawer
        title={codesBatch ? `兑换码 · ${codesBatch.name}` : "兑换码"}
        width={720}
        open={!!codesBatch}
        onClose={() => setCodesBatch(null)}
      >
        <Space style={{ marginBottom: 16 }}>
          <InputNumber min={1} max={5000} value={genCount} onChange={(v) => setGenCount(Number(v) || 1)} />
          <Button
            type="primary"
            onClick={async () => {
              if (!codesBatch) return;
              await adminFetch(`/admin/v1/redeem/batches/${codesBatch.id}/generate`, {
                method: "POST",
                body: JSON.stringify({ count: genCount }),
              });
              message.success("已生成");
              await loadCodes(codesBatch);
              actionRef.current?.reload();
            }}
          >
            再生成
          </Button>
        </Space>
        <ProTable<CodeRow>
          rowKey="id"
          search={false}
          toolBarRender={false}
          dataSource={codes}
          pagination={false}
          columns={[
            { title: "码", dataIndex: "code", copyable: true },
            { title: "状态", dataIndex: "status", width: 100 },
            { title: "兑换时间", dataIndex: "redeemed_at", width: 180 },
            {
              title: "操作",
              width: 90,
              render: (_, r) =>
                r.status === "unused" ? (
                  <a
                    onClick={async () => {
                      await adminFetch(`/admin/v1/redeem/codes/${r.id}/disable`, {
                        method: "POST",
                      });
                      message.success("已禁用");
                      if (codesBatch) await loadCodes(codesBatch);
                    }}
                  >
                    禁用
                  </a>
                ) : (
                  "-"
                ),
            },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
}
