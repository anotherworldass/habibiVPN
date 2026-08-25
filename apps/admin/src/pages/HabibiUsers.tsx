import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormDigit,
  ProFormSelect,
  ProTable,
} from "@ant-design/pro-components";
import { Button, Drawer, Space, Tag, Typography } from "antd";
import { CopyableUrlWithQr } from "../components/CopyableUrlWithQr";
import { message } from "../lib/antd-message";
import { adminFetch, unwrapList } from "../lib/api";

type ClientUrls = {
  clash_meta?: string;
  hiddify?: string;
  v2ray?: string;
  shadowrocket?: string;
  surge?: string;
  quantumult_x?: string;
};

type UpstreamSlot = {
  id: string;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  upstream_id?: string | null;
  upstream_username?: string;
  subscription_url?: string | null;
  client_urls?: ClientUrls | null;
  expires_at?: string | null;
  status?: string;
};

const CLIENT_URL_LABELS: { key: keyof ClientUrls; label: string }[] = [
  { key: "clash_meta", label: "Mihomo / Clash Meta (YAML)" },
  { key: "hiddify", label: "Hiddify" },
  { key: "v2ray", label: "Xray / V2Ray (Base64)" },
  { key: "shadowrocket", label: "Shadowrocket" },
  { key: "surge", label: "Surge Profile" },
  { key: "quantumult_x", label: "Quantumult X" },
];

type PromoGroupBrief = {
  id: string;
  name: string;
  code: string;
  enabled?: boolean;
};

type HabibiUser = {
  id: string;
  uid?: number;
  email?: string | null;
  phone?: string | null;
  status: string;
  is_anonymous?: boolean;
  created_at: string;
  subscription_count?: number;
  total_recharge_cents?: number;
  invite_count?: number;
  invite_code?: string;
  promo_group_id?: string;
  promo_group?: PromoGroupBrief | null;
  source_client?: string | null;
  source_site?: { id: string; name: string; host: string } | null;
  source_package?: {
    id: string;
    name: string;
    packageName: string;
    client: string;
  } | null;
  preferences?: {
    connect_mode?: "unset" | "official_app" | "subscription_client";
    connect_clients?: string[];
    connect_pref_source?: string | null;
    connect_pref_at?: string | null;
  } | null;
  upstreams?: UpstreamSlot[];
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function connectModeLabel(mode?: string | null) {
  if (mode === "official_app") return "本站 App";
  if (mode === "subscription_client") return "订阅客户端";
  if (mode === "unset") return "未设置";
  return "—";
}

export default function HabibiUsersPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [renewSlot, setRenewSlot] = useState<{
    user: HabibiUser;
    slot: UpstreamSlot;
  } | null>(null);
  const [detailUser, setDetailUser] = useState<HabibiUser | null>(null);
  const [groupOptions, setGroupOptions] = useState<PromoGroupBrief[]>([]);

  useEffect(() => {
    void adminFetch<
      Array<{ id: string; name: string; code: string; enabled: boolean }>
    >("/admin/v1/referral/groups")
      .then((list) =>
        setGroupOptions(
          (list || []).map((g) => ({
            id: g.id,
            name: g.name,
            code: g.code,
            enabled: g.enabled,
          })),
        ),
      )
      .catch(() => setGroupOptions([]));
  }, []);

  const columns: ProColumns<HabibiUser>[] = [
    {
      title: "UID",
      dataIndex: "uid",
      copyable: true,
      width: 110,
      search: false,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      copyable: true,
      width: 260,
      ellipsis: true,
      render: (_, r) =>
        r.email ? (
          r.email
        ) : (
          <Tag>匿名</Tag>
        ),
    },
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
      title: "充值",
      dataIndex: "total_recharge_cents",
      search: false,
      width: 110,
      render: (_, r) => money(r.total_recharge_cents ?? 0),
    },
    {
      title: "邀请",
      dataIndex: "invite_count",
      search: false,
      width: 90,
      render: (_, r) => r.invite_count ?? 0,
    },
   
    {
      title: "来源",
      search: false,
      width: 160,
      render: (_, r) => {
        if (r.source_package) {
          return (
            <span title={r.source_package.packageName}>
              包:{r.source_package.name}
            </span>
          );
        }
        if (r.source_site) {
          return (
            <span title={r.source_site.host}>站:{r.source_site.name}</span>
          );
        }
        return r.source_client || "—";
      },
    },
    {
      title: "使用偏好",
      dataIndex: "connect_mode",
      width: 130,
      valueType: "select",
      fieldProps: {
        options: [
          { label: "未设置", value: "unset" },
          { label: "本站 App", value: "official_app" },
          { label: "订阅客户端", value: "subscription_client" },
        ],
        allowClear: true,
      },
      render: (_, r) => {
        const mode = r.preferences?.connect_mode;
        if (!mode || mode === "unset") return <Tag>未设置</Tag>;
        const clients = r.preferences?.connect_clients || [];
        return (
          <span title={clients.length ? clients.join(", ") : undefined}>
            <Tag color={mode === "official_app" ? "blue" : "orange"}>
              {connectModeLabel(mode)}
            </Tag>
          </span>
        );
      },
    },
    {
      title: "分佣组",
      dataIndex: "promo_group_id",
      width: 120,
      valueType: "select",
      fieldProps: {
        options: groupOptions.map((g) => ({
          label: g.name,
          value: g.id,
        })),
        allowClear: true,
      },
      render: (_, r) => {
        const name = r.promo_group?.name;
        if (!name) return <Tag>—</Tag>;
        const color =
          r.promo_group?.code === "gold"
            ? "gold"
            : r.promo_group?.code === "silver"
              ? "default"
              : "blue";
        return <Tag color={color}>{name}</Tag>;
      },
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
      width: 240,
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
      width: 240,
      render: (_, row) => [
        <Link key="promo" to={`/users/detail?user=${encodeURIComponent(row.id)}`}>
          用户详情
        </Link>,
        <a key="detail" onClick={() => setDetailUser(row)}>
          订阅详情
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
      title="用户列表"
      subTitle="一用户可对应多个上游顾客（每个顾客=一个套餐）；续费/改套餐走 upsert 保订阅链接"
    >
      <ProTable<HabibiUser>
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        scroll={{ x: 1600 }}
        request={async (params) => {
          const qs = new URLSearchParams();
          qs.set("limit", String(params.pageSize || 20));
          qs.set("offset", String(((params.current || 1) - 1) * (params.pageSize || 20)));
          if (params.email) qs.set("q", String(params.email));
          if (params.promo_group_id) qs.set("promo_group_id", String(params.promo_group_id));
          if (params.connect_mode) qs.set("connect_mode", String(params.connect_mode));
          const data = await adminFetch<{ users: HabibiUser[]; total: number }>(
            `/admin/v1/users?${qs}`,
          );
          return { data: data.users || [], success: true, total: data.total || 0 };
        }}
        search={{ labelWidth: "auto" }}
      />

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
        width={640}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          {detailUser && (
            <div
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <Typography.Text strong>使用偏好</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Tag
                  color={
                    detailUser.preferences?.connect_mode === "official_app"
                      ? "blue"
                      : detailUser.preferences?.connect_mode ===
                          "subscription_client"
                        ? "orange"
                        : "default"
                  }
                >
                  {connectModeLabel(detailUser.preferences?.connect_mode)}
                </Tag>
                {(detailUser.preferences?.connect_clients || []).length > 0 && (
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    {(detailUser.preferences?.connect_clients || []).join(" · ")}
                  </Typography.Text>
                )}
              </div>
              {detailUser.preferences?.connect_pref_source && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  来源 {detailUser.preferences.connect_pref_source}
                  {detailUser.preferences.connect_pref_at
                    ? ` · ${String(detailUser.preferences.connect_pref_at)
                        .slice(0, 19)
                        .replace("T", " ")}`
                    : ""}
                </Typography.Text>
              )}
            </div>
          )}
          {(detailUser?.upstreams || []).length === 0 && (
            <Typography.Text type="secondary">
              暂无套餐槽，请到{" "}
              {detailUser ? (
                <Link to={`/users/detail?user=${encodeURIComponent(detailUser.id)}`}>
                  用户详情
                </Link>
              ) : (
                "用户详情"
              )}{" "}
              新增套餐
            </Typography.Text>
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
                槽位 ID（探针用这个，不是用户 ID / 套餐 ID）：
                <Typography.Text copyable={{ text: s.id }} style={{ fontSize: 12 }}>
                  {s.id}
                </Typography.Text>
                {!s.subscription_url && (
                  <Tag color="warning" style={{ marginLeft: 8 }}>
                    无订阅链接
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                上游：{s.upstream_username}
                {s.upstream_id ? ` (${s.upstream_id})` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                到期：{s.expires_at?.slice(0, 19).replace("T", " ") || "-"}
              </div>
              {s.subscription_url && (
                <>
                  <Typography.Text
                    type="secondary"
                    style={{ display: "block", marginTop: 8, fontSize: 12 }}
                  >
                    上游原始订阅
                  </Typography.Text>
                  <div style={{ marginBottom: 8 }}>
                    <CopyableUrlWithQr
                      url={s.subscription_url}
                      label="上游原始订阅"
                      ellipsis={{ rows: 2 }}
                    />
                  </div>
                </>
              )}
              {s.client_urls && (
                <div style={{ marginBottom: 8 }}>
                  <Typography.Text strong style={{ fontSize: 12 }}>
                    客户端转换订阅（/api/v1/sub）
                  </Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    {CLIENT_URL_LABELS.map(({ key, label }) => {
                      const url = s.client_urls?.[key];
                      if (!url) return null;
                      return (
                        <div key={key} style={{ marginBottom: 6 }}>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 11 }}
                          >
                            {label}
                          </Typography.Text>
                          <CopyableUrlWithQr
                            url={url}
                            label={label}
                            ellipsis={{ rows: 2 }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
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
