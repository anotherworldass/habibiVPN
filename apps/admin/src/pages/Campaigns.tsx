import { useEffect, useRef, useState } from "react";
import type { ActionType, ProColumns, ProFormInstance } from "@ant-design/pro-components";
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
import { Button, Drawer, Divider, Space, Tag } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import AppCopyI18nFields from "../components/AppCopyI18nFields";
import {
  formValuesToI18n,
  i18nToFormValues,
} from "../lib/app-copy-form";

function i18nFromValues(
  values: Record<string, unknown>,
  field: "title" | "subtitle" | "button",
): Record<string, string> {
  return formValuesToI18n(values, field, "sparse");
}

function uiFormFieldsFromCampaign(ui?: Record<string, unknown> | null) {
  const titleI18n =
    (ui?.title_i18n as Record<string, string> | undefined) || {};
  const subtitleI18n =
    (ui?.subtitle_i18n as Record<string, string> | undefined) || {};
  const buttonI18n =
    (ui?.button_text_i18n as Record<string, string> | undefined) || {};
  const legacyTitle =
    typeof ui?.title === "string" ? ui.title : "";
  const legacySubtitle =
    typeof ui?.subtitle === "string" ? ui.subtitle : "";
  const legacyButton =
    typeof ui?.button_text === "string" ? ui.button_text : "";
  return {
    ...i18nToFormValues("title", titleI18n, legacyTitle),
    ...i18nToFormValues("subtitle", subtitleI18n, legacySubtitle),
    ...i18nToFormValues("button", buttonI18n, legacyButton),
  };
}

/** e.g. camp_20260725_232845 */
function generateCampaignCode(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time =
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `camp_${day}_${time}`;
}

const CLIENTS = [
  { value: "ios_appstore", label: "iOS App Store" },
  { value: "ios_alt", label: "iOS 企业签/侧载" },
  { value: "android_play", label: "Android Google Play" },
  { value: "android_direct", label: "Android 非商店" },
  { value: "h5", label: "H5" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
] as const;

type CampaignRules = {
  limitPerUserPerDay?: number;
  limitPerUserTotal?: number | null;
  lottery?: {
    winRateBps?: number;
    maxWinsPerDayGlobal?: number | null;
  };
  audience?: {
    unpaidOnly?: boolean;
    newUserOnly?: boolean;
    minRegisterDays?: number;
    maxRegisterDays?: number;
    requireNoActiveSubscription?: boolean;
    requireExpiredOrNone?: boolean;
    requireActiveSubscription?: boolean;
    planIds?: string[];
  };
  invite?: {
    requiredCount?: number;
    grantMode?: "auto" | "claim";
    inviteeRequirements?: {
      paid?: boolean;
      hasSubscription?: boolean;
      hasTraffic?: boolean;
      minTrafficBytes?: number | null;
    };
  };
};

type Campaign = {
  id: string;
  code: string;
  name: string;
  type: "daily_claim" | "lottery" | "invite_milestone";
  status: "draft" | "active" | "paused" | "ended";
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  rules: CampaignRules;
  ui: Record<string, unknown>;
  sort_order: number;
  remark?: string | null;
  clients: Array<{ client: string; enabled: boolean }>;
  packages?: Array<{ package_id: string }>;
  rewards: Array<{
    id?: string;
    kind: string;
    plan_id?: string | null;
    plan?: { id: string; name: string; code: string } | null;
    validity_seconds: number | null;
    stack_mode: string;
  }>;
};

type ClaimRow = {
  id: string;
  uid: number;
  email: string | null;
  client: string;
  period_key: string;
  attempt_index?: number;
  result: string;
  granted_seconds: number | null;
  slot_id?: string | null;
  created_at: string;
};

type MetaPackage = {
  id: string;
  name: string;
  packageName: string;
  client: string;
};

type MetaPlan = { id: string; code: string; name: string };

const statusColor: Record<string, string> = {
  draft: "default",
  active: "success",
  paused: "warning",
  ended: "error",
};

function hoursFromSeconds(sec?: number | null) {
  if (sec == null) return 2;
  return Math.round((sec / 3600) * 100) / 100;
}

function toFormTime(iso?: string | null) {
  if (!iso) return undefined;
  return iso.slice(0, 19).replace("T", " ");
}

export default function CampaignsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [claimsFor, setClaimsFor] = useState<Campaign | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const reload = () => actionRef.current?.reload();

  const openClaims = async (row: Campaign) => {
    setClaimsFor(row);
    setClaimsLoading(true);
    try {
      const res = await adminFetch<{ claims: ClaimRow[] }>(
        `/admin/v1/campaigns/${row.id}/claims?page_size=50`,
      );
      setClaims(res.claims || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setClaimsLoading(false);
    }
  };

  const columns: ProColumns<Campaign>[] = [
    { title: "排序", dataIndex: "sort_order", width: 70, search: false },
    { title: "code", dataIndex: "code", copyable: true },
    {
      title: "名称",
      dataIndex: "name",
      render: (_, r) => {
        const ui = r.ui || {};
        const i18n = (ui.title_i18n || {}) as Record<string, string>;
        const clientTitle = i18n.zh || i18n.en || (ui.title as string) || "";
        return clientTitle && clientTitle !== r.name
          ? `${r.name} · ${clientTitle}`
          : r.name;
      },
    },
    {
      title: "类型",
      dataIndex: "type",
      valueEnum: {
        daily_claim: { text: "每日领取" },
        lottery: { text: "抽奖" },
        invite_milestone: { text: "邀请达标" },
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => <Tag color={statusColor[r.status]}>{r.status}</Tag>,
    },
    {
      title: "时间窗",
      search: false,
      ellipsis: true,
      render: (_, r) => {
        if (!r.start_at && !r.end_at) return "不限";
        return `${r.start_at?.slice(0, 10) || "…"} ~ ${r.end_at?.slice(0, 10) || "…"}`;
      },
    },
    {
      title: "奖励",
      search: false,
      render: (_, r) => {
        if (r.type === "invite_milestone") {
          const plan = r.rewards?.[0]?.plan;
          return plan ? `套餐 · ${plan.name}` : "指定套餐";
        }
        const sec = r.rewards?.[0]?.validity_seconds;
        return sec != null ? `${hoursFromSeconds(sec)} 小时` : "-";
      },
    },
    {
      title: "端",
      search: false,
      ellipsis: true,
      render: (_, r) =>
        (r.clients || [])
          .filter((c) => c.enabled)
          .map((c) => c.client)
          .join(", ") || "-",
    },
    {
      title: "操作",
      valueType: "option",
      width: 220,
      render: (_, row) => [
        <a key="edit" onClick={() => setEditing(row)}>
          编辑
        </a>,
        <a key="claims" onClick={() => void openClaims(row)}>
          参与记录
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      header={{
        title: "运营活动",
        subTitle: "每日领取 / 抽奖 / 邀请达标换套餐",
      }}
    >
      <ProTable<Campaign>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={false}
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建活动
          </Button>,
        ]}
        request={async () => {
          const res = await adminFetch<{ campaigns: Campaign[] }>(
            "/admin/v1/campaigns",
          );
          return { data: res.campaigns || [], success: true };
        }}
      />

      <CampaignForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onFinish={async (values) => {
          await adminFetch("/admin/v1/campaigns", {
            method: "POST",
            body: JSON.stringify(values),
          });
          message.success("已创建");
          reload();
          return true;
        }}
      />

      <CampaignForm
        open={!!editing}
        initial={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onFinish={async (values) => {
          if (!editing) return false;
          await adminFetch(`/admin/v1/campaigns/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(values),
          });
          message.success("已保存");
          setEditing(null);
          reload();
          return true;
        }}
      />

      <Drawer
        title={claimsFor ? `参与记录 · ${claimsFor.name}` : "参与记录"}
        width={780}
        open={!!claimsFor}
        onClose={() => setClaimsFor(null)}
        destroyOnClose
      >
        <ProTable<ClaimRow>
          rowKey="id"
          loading={claimsLoading}
          search={false}
          toolBarRender={false}
          pagination={false}
          dataSource={claims}
          columns={[
            { title: "UID", dataIndex: "uid", width: 90 },
            { title: "邮箱", dataIndex: "email", ellipsis: true },
            { title: "端", dataIndex: "client", width: 120 },
            { title: "日", dataIndex: "period_key", width: 110 },
            { title: "次", dataIndex: "attempt_index", width: 50 },
            { title: "结果", dataIndex: "result", width: 90 },
            {
              title: "发放秒",
              dataIndex: "granted_seconds",
              width: 90,
              render: (_, r) => r.granted_seconds ?? "-",
            },
            {
              title: "槽位",
              dataIndex: "slot_id",
              width: 140,
              ellipsis: true,
              render: (_, r) => r.slot_id ?? "-",
            },
            { title: "时间", dataIndex: "created_at", width: 180 },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
}

function CampaignForm(props: {
  open: boolean;
  initial?: Campaign | null;
  onOpenChange: (open: boolean) => void;
  onFinish: (values: Record<string, unknown>) => Promise<boolean>;
}) {
  const formRef = useRef<ProFormInstance>(undefined);
  const initial = props.initial;
  const [packages, setPackages] = useState<MetaPackage[]>([]);
  const [plans, setPlans] = useState<MetaPlan[]>([]);

  useEffect(() => {
    if (!props.open) return;
    void adminFetch<{ packages: MetaPackage[]; plans: MetaPlan[] }>(
      "/admin/v1/campaigns/meta",
    )
      .then((res) => {
        setPackages(res.packages || []);
        setPlans(res.plans || []);
      })
      .catch(() => {
        setPackages([]);
        setPlans([]);
      });
  }, [props.open]);

  const audience = initial?.rules?.audience || {};
  const invite = initial?.rules?.invite || {};
  const inviteReqs = invite.inviteeRequirements || {};
  const rewardHours = hoursFromSeconds(initial?.rewards?.[0]?.validity_seconds);
  const winRate =
    initial?.rules?.lottery?.winRateBps != null
      ? initial.rules.lottery.winRateBps / 100
      : 30;

  return (
    <ModalForm
      formRef={formRef}
      title={initial ? "编辑活动" : "新建活动"}
      open={props.open}
      onOpenChange={props.onOpenChange}
      modalProps={{ destroyOnClose: true, width: 720 }}
      initialValues={{
        code: initial?.code || (!initial ? generateCampaignCode() : undefined),
        name: initial?.name,
        type: initial?.type || "daily_claim",
        status: initial?.status || "draft",
        startAt: toFormTime(initial?.start_at),
        endAt: toFormTime(initial?.end_at),
        timezone: initial?.timezone || "Asia/Shanghai",
        sortOrder: initial?.sort_order ?? 0,
        rewardHours,
        winRatePercent: winRate,
        maxWinsPerDayGlobal: initial?.rules?.lottery?.maxWinsPerDayGlobal ?? undefined,
        limitPerUserPerDay: initial?.rules?.limitPerUserPerDay ?? 1,
        limitPerUserTotal: initial?.rules?.limitPerUserTotal ?? undefined,
        stackMode:
          initial?.rewards?.[0]?.stack_mode || "create_campaign_slot",
        clients: (initial?.clients || [])
          .filter((c) => c.enabled)
          .map((c) => c.client),
        packageIds: (initial?.packages || []).map((p) => p.package_id),
        unpaidOnly: Boolean(audience.unpaidOnly || audience.newUserOnly),
        minRegisterDays: audience.minRegisterDays,
        maxRegisterDays: audience.maxRegisterDays,
        requireNoActiveSubscription: Boolean(audience.requireNoActiveSubscription),
        requireExpiredOrNone: Boolean(audience.requireExpiredOrNone),
        requireActiveSubscription: Boolean(audience.requireActiveSubscription),
        audiencePlanIds: audience.planIds || [],
        inviteRequiredCount: invite.requiredCount ?? 3,
        inviteGrantMode: invite.grantMode || "auto",
        inviteReqPaid: Boolean(inviteReqs.paid),
        inviteReqSubscription: Boolean(inviteReqs.hasSubscription),
        inviteReqTraffic: Boolean(inviteReqs.hasTraffic),
        inviteMinTrafficBytes: inviteReqs.minTrafficBytes ?? undefined,
        rewardPlanId: initial?.rewards?.[0]?.plan_id || undefined,
        remark: initial?.remark ?? undefined,
        ...uiFormFieldsFromCampaign(initial?.ui),
      }}
      onFinish={async (raw) => {
        const clients = ((raw.clients as string[]) || []).map((client) => ({
          client,
          enabled: true,
        }));
        const type = raw.type as "daily_claim" | "lottery" | "invite_milestone";
        const hours = Number(raw.rewardHours) || 2;
        const toIso = (v: unknown) => {
          if (v == null || v === "") return null;
          if (typeof v === "object" && v && typeof (v as { toISOString?: () => string }).toISOString === "function") {
            return (v as { toISOString: () => string }).toISOString();
          }
          const d = new Date(String(v).replace(" ", "T"));
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        };
        const audienceOut: CampaignRules["audience"] = {};
        if (raw.unpaidOnly) audienceOut.unpaidOnly = true;
        if (raw.minRegisterDays != null && raw.minRegisterDays !== "") {
          audienceOut.minRegisterDays = Number(raw.minRegisterDays);
        }
        if (raw.maxRegisterDays != null && raw.maxRegisterDays !== "") {
          audienceOut.maxRegisterDays = Number(raw.maxRegisterDays);
        }
        if (raw.requireNoActiveSubscription) {
          audienceOut.requireNoActiveSubscription = true;
        }
        if (raw.requireExpiredOrNone) audienceOut.requireExpiredOrNone = true;
        if (raw.requireActiveSubscription) {
          audienceOut.requireActiveSubscription = true;
        }
        const planIds = (raw.audiencePlanIds as string[]) || [];
        if (planIds.length) audienceOut.planIds = planIds;

        const body = {
          code: raw.code,
          name: raw.name,
          type,
          status: raw.status,
          startAt: toIso(raw.startAt),
          endAt: toIso(raw.endAt),
          timezone: raw.timezone || "Asia/Shanghai",
          sortOrder: Number(raw.sortOrder) || 0,
          remark: raw.remark || null,
          ui: {
            title_i18n: i18nFromValues(raw, "title"),
            subtitle_i18n: i18nFromValues(raw, "subtitle"),
            button_text_i18n: i18nFromValues(raw, "button"),
          },
          rules: {
            audience: audienceOut,
            ...(type === "invite_milestone"
              ? {
                  invite: {
                    requiredCount: Math.max(
                      1,
                      Number(raw.inviteRequiredCount) || 1,
                    ),
                    grantMode:
                      raw.inviteGrantMode === "claim" ? "claim" : "auto",
                    inviteeRequirements: {
                      paid: Boolean(raw.inviteReqPaid),
                      hasSubscription: Boolean(raw.inviteReqSubscription),
                      hasTraffic: Boolean(raw.inviteReqTraffic),
                      minTrafficBytes:
                        raw.inviteMinTrafficBytes == null ||
                        raw.inviteMinTrafficBytes === ""
                          ? null
                          : Number(raw.inviteMinTrafficBytes),
                    },
                  },
                }
              : {
                  limitPerUserPerDay: Math.max(
                    1,
                    Number(raw.limitPerUserPerDay) || 1,
                  ),
                  limitPerUserTotal:
                    raw.limitPerUserTotal == null ||
                    raw.limitPerUserTotal === ""
                      ? null
                      : Number(raw.limitPerUserTotal),
                  ...(type === "lottery"
                    ? {
                        lottery: {
                          winRateBps: Math.round(
                            Number(raw.winRatePercent || 0) * 100,
                          ),
                          maxWinsPerDayGlobal:
                            raw.maxWinsPerDayGlobal == null ||
                            raw.maxWinsPerDayGlobal === ""
                              ? null
                              : Number(raw.maxWinsPerDayGlobal),
                        },
                      }
                    : {}),
                }),
          },
          clients:
            clients.length > 0
              ? clients
              : CLIENTS.map((c) => ({ client: c.value, enabled: true })),
          packageIds: (raw.packageIds as string[]) || [],
          rewards:
            type === "invite_milestone"
              ? [
                  {
                    kind: "vpn_plan",
                    planId: raw.rewardPlanId || null,
                  },
                ]
              : [
                  {
                    kind: "vpn_duration",
                    validitySeconds: Math.round(hours * 3600),
                    stackMode: raw.stackMode || "create_campaign_slot",
                  },
                ],
        };
        return props.onFinish(body);
      }}
    >
      <ProFormText
        name="code"
        label="活动 code"
        rules={[{ required: true }]}
        disabled={!!initial}
        placeholder="camp_20260725_232815"
        fieldProps={{
          addonAfter: initial ? undefined : (
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: "auto" }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formRef.current?.setFieldsValue({ code: generateCampaignCode() });
              }}
            >
              自动生成
            </Button>
          ),
        }}
      />
      <ProFormText
        name="name"
        label="名称（后台）"
        rules={[{ required: true }]}
        extra="仅后台识别；客户端展示用下方多语言标题"
      />
      <AppCopyI18nFields
        context="campaign"
        label="客户端文案（多语言）"
        fields={[
          {
            key: "title",
            label: "标题",
            requiredZh: true,
            placeholders: { zh: "每日免费加速", en: "Daily free boost" },
          },
          {
            key: "subtitle",
            label: "副标题",
            placeholders: {
              zh: "每天可领取 1 小时",
              en: "Claim 1 hour every day",
            },
          },
          {
            key: "button",
            label: "按钮文案",
            placeholders: { zh: "立即领取", en: "Claim" },
          },
        ]}
      />
      <Space style={{ display: "flex" }} size="middle" wrap>
        <ProFormSelect
          name="type"
          label="类型"
          width="sm"
          options={[
            { value: "daily_claim", label: "每日领取" },
            { value: "lottery", label: "抽奖" },
            { value: "invite_milestone", label: "邀请达标" },
          ]}
          rules={[{ required: true }]}
        />
        <ProFormSelect
          name="status"
          label="状态"
          width="sm"
          options={[
            { value: "draft", label: "草稿" },
            { value: "active", label: "上线" },
            { value: "paused", label: "暂停" },
            { value: "ended", label: "结束" },
          ]}
          rules={[{ required: true }]}
        />
      </Space>

      <Divider orientation="left" plain>
        时间窗
      </Divider>
      <Space style={{ display: "flex" }} size="middle" wrap>
        <ProFormDependency name={["type"]}>
          {({ type }) => (
            <ProFormDateTimePicker
              name="startAt"
              label="开始时间"
              extra={
                type === "invite_milestone"
                  ? "邀请达标必须填写：只统计此后新注册的直邀"
                  : undefined
              }
              rules={
                type === "invite_milestone"
                  ? [{ required: true, message: "邀请达标活动必须设置开始时间" }]
                  : undefined
              }
              fieldProps={{ format: "YYYY-MM-DD HH:mm:ss", style: { width: 220 } }}
            />
          )}
        </ProFormDependency>
        <ProFormDateTimePicker
          name="endAt"
          label="结束时间"
          fieldProps={{ format: "YYYY-MM-DD HH:mm:ss", style: { width: 220 } }}
        />
      </Space>
      <ProFormText
        name="timezone"
        label="日切时区"
        extra="用于每日次数重置，例如 Asia/Shanghai"
      />

      <ProFormDependency name={["type"]}>
        {({ type }) =>
          type === "invite_milestone" ? (
            <>
              <Divider orientation="left" plain>
                邀请达标
              </Divider>
              <ProFormDigit
                name="inviteRequiredCount"
                label="邀请人数 N"
                min={1}
                fieldProps={{ precision: 0 }}
                rules={[{ required: true, message: "请填写邀请人数" }]}
              />
              <ProFormSelect
                name="inviteGrantMode"
                label="发放方式"
                options={[
                  { value: "auto", label: "达标自动开通" },
                  { value: "claim", label: "用户手动领取" },
                ]}
                rules={[{ required: true }]}
              />
              <ProFormSelect
                name="rewardPlanId"
                label="奖励套餐"
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.code})`,
                }))}
                rules={[{ required: true, message: "请选择奖励套餐" }]}
              />
              <Divider orientation="left" plain>
                被邀请人须同时满足
              </Divider>
              <ProFormSwitch
                name="inviteReqPaid"
                label="已付费"
                extra="有实付订单（金额大于 0 且已支付/已开通）"
              />
              <ProFormSwitch
                name="inviteReqSubscription"
                label="已开通订阅"
                extra="任意订阅槽位，含免费领取 / 活动赠送"
              />
              <ProFormSwitch
                name="inviteReqTraffic"
                label="已产生流量"
                extra="用量来自订阅同步缓存，不是秒级实时"
              />
              <ProFormDigit
                name="inviteMinTrafficBytes"
                label="最低流量（字节，可选）"
                min={1}
                fieldProps={{ precision: 0 }}
                extra="填写后隐含「已产生流量」，合计 usedTrafficBytes ≥ 该值"
              />
            </>
          ) : (
            <>
              <Divider orientation="left" plain>
                奖励与频次
              </Divider>
              <ProFormDigit
                name="rewardHours"
                label="奖励时长（小时）"
                min={0.1}
                fieldProps={{ step: 0.5 }}
                rules={[{ required: true }]}
              />
              {type === "lottery" ? (
                <>
                  <ProFormDigit
                    name="winRatePercent"
                    label="中奖率 %"
                    min={0}
                    max={100}
                    fieldProps={{ step: 1 }}
                    rules={[{ required: true, message: "请填写中奖率" }]}
                  />
                  <ProFormDigit
                    name="maxWinsPerDayGlobal"
                    label="全站每日中奖上限（可选）"
                    min={1}
                    fieldProps={{ precision: 0 }}
                  />
                </>
              ) : null}
              <Space style={{ display: "flex" }} size="middle" wrap>
                <ProFormDigit
                  name="limitPerUserPerDay"
                  label="每人每日次数"
                  min={1}
                  max={50}
                  fieldProps={{ precision: 0 }}
                  rules={[{ required: true }]}
                />
                <ProFormDigit
                  name="limitPerUserTotal"
                  label="每人总次数（空=不限）"
                  min={1}
                  fieldProps={{ precision: 0 }}
                />
              </Space>
              <ProFormSelect
                name="stackMode"
                label="发放方式"
                options={[
                  {
                    value: "create_campaign_slot",
                    label: "新建活动槽（推荐：新用户/已过期）",
                  },
                  {
                    value: "extend_active",
                    label: "仅叠加到当前仍有效的槽（不会复活已过期套餐）",
                  },
                ]}
                extra="新用户每日福利请用「新建活动槽」，避免挂上旧套餐名"
              />
            </>
          )
        }
      </ProFormDependency>

      <Divider orientation="left" plain>
        端 / 包
      </Divider>
      <ProFormSelect
        name="clients"
        label="适用端（多选）"
        mode="multiple"
        options={[...CLIENTS]}
        rules={[{ required: true, message: "至少选一个端" }]}
      />
      <ProFormSelect
        name="packageIds"
        label="限定马甲包（可选）"
        mode="multiple"
        options={packages.map((p) => ({
          value: p.id,
          label: `${p.name} · ${p.packageName} (${p.client})`,
        }))}
        extra="不选表示所选端下全部包可用"
      />

      <Divider orientation="left" plain>
        人群
      </Divider>
      <ProFormSwitch
        name="unpaidOnly"
        label="仅未付费用户"
        extra="开启后自动排除：有付费订单，或仍有未过期有效订阅的用户"
      />
      <Space style={{ display: "flex" }} size="middle" wrap>
        <ProFormDigit
          name="minRegisterDays"
          label="注册满 N 天"
          min={0}
          fieldProps={{ precision: 0 }}
        />
        <ProFormDigit
          name="maxRegisterDays"
          label="注册不超过 N 天"
          min={0}
          fieldProps={{ precision: 0 }}
        />
      </Space>
      <ProFormSwitch
        name="requireNoActiveSubscription"
        label="排除当前有效订阅用户"
        extra="「仅未付费」已隐含此条件"
      />
      <ProFormSwitch
        name="requireExpiredOrNone"
        label="仅无订阅或已过期用户"
        extra="「仅未付费」已隐含此条件"
      />
      <ProFormSwitch
        name="requireActiveSubscription"
        label="必须有有效订阅"
      />
      <ProFormSelect
        name="audiencePlanIds"
        label="必须拥有过的套餐（可选）"
        mode="multiple"
        options={plans.map((p) => ({
          value: p.id,
          label: `${p.name} (${p.code})`,
        }))}
      />

      <Divider />
      <ProFormDigit name="sortOrder" label="排序" min={0} />
      <ProFormTextArea name="remark" label="备注" />
    </ModalForm>
  );
}
