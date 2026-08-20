import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Empty, Space, Table, Tabs, Tag, Typography } from "antd";
import { message } from "../lib/antd-message";
import { ReloadOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";

const FILTER_ALL = "__all__";
const FILTER_NONE = "__none__";

const CLIENTS: { key: string; label: string; hint: string }[] = [
  { key: "h5", label: "H5", hint: "Web 站 · 非内购" },
  { key: "android_direct", label: "Android 非商店", hint: "APK / 侧载 · 非内购" },
  { key: "android_play", label: "Android Play", hint: "Google Play · 内购（预留）" },
  { key: "ios_appstore", label: "iOS App Store", hint: "商店版 · 默认 IAP" },
  { key: "ios_alt", label: "iOS 企业签/侧载", hint: "非商店 · 可走外链" },
  { key: "windows", label: "Windows 桌面", hint: "桌面客户端 · 非内购网关" },
  { key: "macos", label: "macOS 桌面", hint: "桌面客户端 · 非内购网关" },
];

type PreviewGroup = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
};

type PreviewPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  validity_seconds?: number | null;
  validity_calendar_months?: number | null;
  billing_period_seconds?: number | null;
  daily_price_cents?: number | null;
  data_limit_bytes?: number | null;
  reset_policy?: string;
  custom_reset_interval?: string | null;
  device_slots?: number;
  billing_type?: string;
  is_free_claimable?: boolean;
  can_repurchase?: boolean;
  payment_mode?: string;
  group_id?: string | null;
  store_product?: {
    store: string;
    product_id: string;
    product_kind: string;
    trial_days?: number | null;
  } | null;
};

function money(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatDays(sec?: number | null) {
  if (sec == null) return "—";
  if (sec === 0) return "永久";
  if (sec % 86400 === 0) return `${sec / 86400} 天`;
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  return `${sec} 秒`;
}

function paymentModeLabel(mode?: string) {
  const map: Record<string, string> = {
    inherit: "继承",
    iap_only: "仅内购",
    web_only: "仅网关",
    iap_or_web: "内购或网关",
  };
  return mode ? map[mode] || mode : "—";
}

export default function CatalogPreviewPage() {
  const [client, setClient] = useState("h5");
  const [filterGroupId, setFilterGroupId] = useState(FILTER_ALL);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PreviewPlan[]>([]);
  const [groups, setGroups] = useState<PreviewGroup[]>([]);

  const groupName = (id?: string | null) => {
    if (!id) return null;
    return groups.find((g) => g.id === id)?.name || id;
  };

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try {
      const res = await adminFetch<{
        client: string;
        project_id?: string;
        groups?: PreviewGroup[];
        plans: PreviewPlan[];
        count: number;
      }>(`/admin/v1/plans/catalog-preview?client=${encodeURIComponent(c)}`);
      setGroups(res.groups || []);
      setPlans(res.plans || []);
      setFilterGroupId(FILTER_ALL);
    } catch (e) {
      setGroups([]);
      setPlans([]);
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(client);
  }, [client, load]);

  const meta = CLIENTS.find((c) => c.key === client);

  const groupFilterOptions = useMemo(() => {
    const usedIds = new Set(
      plans.map((p) => p.group_id).filter((id): id is string => !!id),
    );
    const hasUngrouped = plans.some((p) => !p.group_id);
    const sorted = [...groups]
      .filter((g) => usedIds.has(g.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const opts: { label: string; value: string }[] = [
      { label: `全部 (${plans.length})`, value: FILTER_ALL },
    ];
    if (hasUngrouped) {
      const n = plans.filter((p) => !p.group_id).length;
      opts.push({ label: `无分组 (${n})`, value: FILTER_NONE });
    }
    for (const g of sorted) {
      const n = plans.filter((p) => p.group_id === g.id).length;
      opts.push({ label: `${g.name} (${n})`, value: g.id });
    }
    return opts;
  }, [groups, plans]);

  const displayPlans = useMemo(() => {
    if (filterGroupId === FILTER_ALL) return plans;
    if (filterGroupId === FILTER_NONE) return plans.filter((p) => !p.group_id);
    return plans.filter((p) => p.group_id === filterGroupId);
  }, [plans, filterGroupId]);

  return (
    <PageContainer
      title="各端在售套餐"
      subTitle="按顶部「当前项目」过滤；与用户端 GET /api/v1/plans?client=… 所见一致"
      extra={[
        <Button key="reload" icon={<ReloadOutlined />} onClick={() => void load(client)}>
          刷新
        </Button>,
        <Link key="edit" to="/sell-plans">
          <Button type="primary">去编辑套餐</Button>
        </Link>,
      ]}
    >
      <Card>
        <Tabs
          activeKey={client}
          onChange={setClient}
          items={CLIENTS.map((c) => ({
            key: c.key,
            label: c.label,
          }))}
        />

        {groupFilterOptions.length > 1 ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
              padding: "4px 0 12px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span
              style={{
                flex: "0 0 48px",
                lineHeight: "24px",
                color: "#666",
                fontSize: 13,
              }}
            >
              分组
            </span>
            <Space size={[8, 8]} wrap style={{ flex: 1 }}>
              {groupFilterOptions.map((opt) => (
                <Tag.CheckableTag
                  key={opt.value}
                  checked={filterGroupId === opt.value}
                  onChange={(checked) => {
                    if (checked) setFilterGroupId(opt.value);
                  }}
                >
                  {opt.label}
                </Tag.CheckableTag>
              ))}
            </Space>
          </div>
        ) : null}

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              当前端：<Typography.Text code>{client}</Typography.Text>
              {meta ? ` · ${meta.hint}` : ""}
              {" · "}
              在售 <Typography.Text strong>{plans.length}</Typography.Text> 个
              {filterGroupId !== FILTER_ALL ? (
                <>
                  {" · "}
                  筛选后{" "}
                  <Typography.Text strong>{displayPlans.length}</Typography.Text>{" "}
                  个
                </>
              ) : null}
              {" · "}
              分组 <Typography.Text strong>{groups.length}</Typography.Text> 个
              {" · "}
              接口示例：
              <Typography.Text code copyable>
                /api/v1/plans?client={client}
              </Typography.Text>
            </span>
          }
        />

        <Table<PreviewPlan>
          rowKey="id"
          loading={loading}
          dataSource={displayPlans}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                description={
                  <span>
                    该端暂无上架套餐。请到{" "}
                    <Link to="/sell-plans">售卖套餐</Link> 勾选对应上架端。
                  </span>
                }
              />
            ),
          }}
          columns={[
            {
              title: "排序",
              width: 60,
              render: (_: unknown, __: PreviewPlan, index: number) => index + 1,
            },
            { title: "名称", dataIndex: "name", width: 160 },
            {
              title: "分组",
              width: 120,
              render: (_, r) => {
                const name = groupName(r.group_id);
                return name ? <Tag color="blue">{name}</Tag> : <Tag>—</Tag>;
              },
            },
            {
              title: "code",
              dataIndex: "code",
              width: 160,
              render: (v: string) => (
                <Typography.Text code copyable>
                  {v}
                </Typography.Text>
              ),
            },
            {
              title: "标价",
              width: 120,
              render: (_, r) => money(r.price_cents, r.currency),
            },
            {
              title: "开通时长",
              width: 110,
              render: (_, r) => {
                if (r.validity_calendar_months) {
                  const m = r.validity_calendar_months;
                  return m % 12 === 0
                    ? `${m / 12} 自然年`
                    : `${m} 自然月`;
                }
                return formatDays(r.validity_seconds);
              },
            },
            {
              title: "流量重置",
              width: 90,
              render: (_, r) => {
                const map: Record<string, string> = {
                  no_reset: "不重置",
                  day: "每日",
                  week: "每周",
                  month: "每月",
                  year: "每年",
                  custom: r.custom_reset_interval || "自定义",
                };
                const key = r.reset_policy || "no_reset";
                return <Tag>{map[key] || key}</Tag>;
              },
            },
            {
              title: "计费周期",
              width: 90,
              render: (_, r) =>
                formatDays(r.billing_period_seconds ?? r.validity_seconds),
            },
            {
              title: "日均",
              width: 100,
              render: (_, r) =>
                r.daily_price_cents != null
                  ? money(r.daily_price_cents, r.currency)
                  : "—",
            },
            {
              title: "终端数",
              width: 80,
              dataIndex: "device_slots",
              render: (v) => v ?? 1,
            },
            {
              title: "计费",
              width: 90,
              render: (_, r) =>
                r.billing_type === "renewable" ? (
                  <Tag color="purple">可续订</Tag>
                ) : (
                  <Tag>买断</Tag>
                ),
            },
            {
              title: "支付方式",
              width: 110,
              render: (_, r) => <Tag>{paymentModeLabel(r.payment_mode)}</Tag>,
            },
            {
              title: "商店商品",
              ellipsis: true,
              render: (_, r) =>
                r.store_product ? (
                  <Space direction="vertical" size={0}>
                    <Typography.Text code>{r.store_product.product_id}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {r.store_product.store} · {r.store_product.product_kind}
                      {r.store_product.trial_days != null && r.store_product.trial_days > 0
                        ? ` · 试用 ${r.store_product.trial_days} 天`
                        : ""}
                    </Typography.Text>
                  </Space>
                ) : (
                  <Typography.Text type="secondary">未映射</Typography.Text>
                ),
            },
            {
              title: "标记",
              width: 180,
              render: (_, r) => (
                <Space size={4} wrap>
                  {r.is_free_claimable ? <Tag color="processing">可免费领</Tag> : null}
                  {r.store_product?.trial_days != null && r.store_product.trial_days > 0 ? (
                    <Tag color="purple">试用 {r.store_product.trial_days} 天</Tag>
                  ) : null}
                  {r.can_repurchase ? <Tag color="success">可复购</Tag> : null}
                  {!r.is_free_claimable &&
                  !r.can_repurchase &&
                  !(r.store_product?.trial_days != null && r.store_product.trial_days > 0) ? (
                    <Tag>—</Tag>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
