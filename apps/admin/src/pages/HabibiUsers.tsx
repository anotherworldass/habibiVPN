import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Drawer, Space, Tag, Typography, message } from "antd";
import { adminFetch, unwrapList } from "../lib/api";

type UpstreamSlot = {
  id: string;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  upstream_id?: string | null;
  upstream_username?: string;
  subscription_url?: string | null;
  expires_at?: string | null;
  status?: string;
};

type HabibiUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  created_at: string;
  subscription_count?: number;
  total_recharge_cents?: number;
  invite_count?: number;
  upstreams?: UpstreamSlot[];
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function HabibiUsersPage() {
  const actionRef = useRef<ActionType>();
  const [provisionUser, setProvisionUser] = useState<HabibiUser | null>(null);
  const [renewSlot, setRenewSlot] = useState<{
    user: HabibiUser;
    slot: UpstreamSlot;
  } | null>(null);
  const [detailUser, setDetailUser] = useState<HabibiUser | null>(null);

  const columns: ProColumns<HabibiUser>[] = [
    {
      title: "ID",
      dataIndex: "id",
      copyable: true,
      ellipsis: true,
      width: 200,
      search: false,
    },
    { title: "邮箱", dataIndex: "email", copyable: true },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (_, r) =>
        r.status === "active" ? (
          <Tag color="success">active</Tag>
        ) : (
          <Tag color="error">{r.status}</Tag>
        ),
    },
    {
      title: "充值金额",
      dataIndex: "total_recharge_cents",
      search: false,
      width: 110,
      render: (_, r) => money(r.total_recharge_cents ?? 0),
    },
    {
      title: "邀请数量",
      dataIndex: "invite_count",
      search: false,
      width: 90,
      render: (_, r) => r.invite_count ?? 0,
    },
    {
      title: "套餐数",
      search: false,
      width: 80,
      render: (_, r) => r.subscription_count ?? r.upstreams?.length ?? 0,
    },
    {
      title: "上游顾客",
      search: false,
      ellipsis: true,
      render: (_, r) => {
        const slots = r.upstreams || [];
        if (!slots.length) return <Tag>未开通</Tag>;
        return slots
          .slice(0, 2)
          .map((s) => s.plan_code || s.upstream_username)
          .join(" · ");
      },
    },
    {
      title: "注册时间",
      dataIndex: "created_at",
      valueType: "dateTime",
      search: false,
      width: 170,
    },
    {
      title: "操作",
      valueType: "option",
      width: 260,
      render: (_, row) => [
        <a key="detail" onClick={() => setDetailUser(row)}>
          订阅详情
        </a>,
        <a key="provision" onClick={() => setProvisionUser(row)}>
          新增套餐
        </a>,
        <a
          key="sync"
          onClick={async () => {
            try {
              await adminFetch(`/admin/v1/users/${row.id}/sync`, {
                method: "POST",
                body: "{}",
              });
              message.success("已同步全部订阅");
              actionRef.current?.reload();
            } catch (e) {
              message.error(e instanceof Error ? e.message : "同步失败");
            }
          }}
        >
          同步
        </a>,
        <a
          key="toggle"
          onClick={async () => {
            const next = row.status === "active" ? "disabled" : "active";
            await adminFetch(`/admin/v1/users/${row.id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: next }),
            });
            message.success(next === "active" ? "已启用" : "已停用");
            actionRef.current?.reload();
          }}
        >
          {row.status === "active" ? "停用" : "启用"}
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      title="Habibi 用户"
      subTitle="一用户可对应多个上游顾客（每个顾客=一个套餐）；续费/改套餐走 upsert 保订阅链接"
    >
      <ProTable<HabibiUser>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const qs = new URLSearchParams();
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          if (params.email) qs.set("q", String(params.email));
          const data = await adminFetch<{ users: HabibiUser[]; total: number }>(
            `/admin/v1/users?${qs}`,
          );
          return { data: data.users || [], success: true, total: data.total || 0 };
        }}
        search={{ labelWidth: "auto" }}
      />

      <ModalForm
        title={`新增套餐（新上游顾客）— ${provisionUser?.email || ""}`}
        open={!!provisionUser}
        onOpenChange={(open) => !open && setProvisionUser(null)}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!provisionUser) return false;
          const body: Record<string, unknown> = {};
          if (values.plan_id) body.plan_id = values.plan_id;
          if (values.upstream_plan_ref) body.upstream_plan_ref = values.upstream_plan_ref;
          if (values.validity_days) {
            body.validity_seconds = Number(values.validity_days) * 86400;
          }
          if (values.note) body.note = values.note;
          await adminFetch(`/admin/v1/users/${provisionUser.id}/provision`, {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success("已创建新上游顾客 / 套餐槽");
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect
          name="plan_id"
          label="本地售卖套餐"
          request={async () => {
            const data = await adminFetch<{ plans: { id: string; name: string; code: string }[] }>(
              "/admin/v1/plans",
            );
            return (data.plans || []).map((p) => ({
              label: `${p.name} (${p.code})`,
              value: p.id,
            }));
          }}
          allowClear
          tooltip="同一本地套餐每位用户只能开一次槽；续费请用「续费/改套餐」"
        />
        <ProFormSelect
          name="upstream_plan_ref"
          label="或直接选上游套餐 code"
          request={async () => {
            const data = await adminFetch("/admin/v1/wireraw/customer-plans");
            const plans = unwrapList<{ code: string; name: string }>(data, ["items", "plans"]);
            return plans.map((p) => ({ label: `${p.name} (${p.code})`, value: p.code }));
          }}
          showSearch
          allowClear
        />
        <ProFormDigit
          name="validity_days"
          label="或：直传有效天数"
          min={1}
          tooltip="都不选时默认开通 1 天"
        />
        <ProFormText name="note" label="备注" />
      </ModalForm>

      <ModalForm
        title={`续费/改套餐（保链接）— ${renewSlot?.slot.upstream_username || ""}`}
        open={!!renewSlot}
        onOpenChange={(open) => !open && setRenewSlot(null)}
        modalProps={{ destroyOnClose: true }}
        onFinish={async (values) => {
          if (!renewSlot) return false;
          const body: Record<string, unknown> = { slot_id: renewSlot.slot.id };
          if (values.plan_id) body.plan_id = values.plan_id;
          if (values.upstream_plan_ref) body.upstream_plan_ref = values.upstream_plan_ref;
          if (values.validity_days) {
            body.validity_seconds = Number(values.validity_days) * 86400;
          }
          const res = await adminFetch<{
            subscription_url_unchanged?: boolean;
          }>(`/admin/v1/users/${renewSlot.user.id}/provision`, {
            method: "POST",
            body: JSON.stringify(body),
          });
          message.success(
            res.subscription_url_unchanged
              ? "已更新，订阅链接未变"
              : "已更新（请核对订阅链接）",
          );
          actionRef.current?.reload();
          setDetailUser(null);
          return true;
        }}
      >
        <ProFormSelect
          name="plan_id"
          label="改为本地套餐"
          request={async () => {
            const data = await adminFetch<{ plans: { id: string; name: string; code: string }[] }>(
              "/admin/v1/plans",
            );
            return (data.plans || []).map((p) => ({
              label: `${p.name} (${p.code})`,
              value: p.id,
            }));
          }}
          allowClear
        />
        <ProFormSelect
          name="upstream_plan_ref"
          label="或上游套餐 code"
          request={async () => {
            const data = await adminFetch("/admin/v1/wireraw/customer-plans");
            const plans = unwrapList<{ code: string; name: string }>(data, ["items", "plans"]);
            return plans.map((p) => ({ label: `${p.name} (${p.code})`, value: p.code }));
          }}
          showSearch
          allowClear
        />
        <ProFormDigit name="validity_days" label="延长天数" min={1} />
      </ModalForm>

      <Drawer
        title={`订阅 — ${detailUser?.email || ""}`}
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        width={520}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          {(detailUser?.upstreams || []).length === 0 && (
            <Typography.Text type="secondary">暂无套餐槽，可点「新增套餐」</Typography.Text>
          )}
          {(detailUser?.upstreams || []).map((s) => (
            <div
              key={s.id}
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <Space wrap>
                <Tag color="blue">{s.plan_name || s.plan_code || "未绑定本地套餐"}</Tag>
                <Tag>{s.status || "active"}</Tag>
              </Space>
              <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                上游：{s.upstream_username}
                {s.upstream_id ? ` (${s.upstream_id})` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                到期：{s.expires_at?.slice(0, 19).replace("T", " ") || "-"}
              </div>
              {s.subscription_url && (
                <Typography.Paragraph
                  copyable
                  ellipsis={{ rows: 2 }}
                  style={{ marginTop: 8, marginBottom: 8, fontSize: 12 }}
                >
                  {s.subscription_url}
                </Typography.Paragraph>
              )}
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  if (!detailUser) return;
                  setRenewSlot({ user: detailUser, slot: s });
                }}
              >
                续费/改套餐
              </Button>
            </div>
          ))}
        </Space>
      </Drawer>
    </PageContainer>
  );
}
