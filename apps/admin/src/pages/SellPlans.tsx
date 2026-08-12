import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import {
  ModalForm,
  PageContainer,
  ProFormCheckbox,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormSwitch,
  ProFormText,
  ProTable,
} from "@ant-design/pro-components";
import { Alert, Button, Collapse, Form, Input, Modal, Space, Tabs, Tag } from "antd";
import { message } from "../lib/antd-message";
import {
  CopyOutlined,
  EyeOutlined,
  FolderOutlined,
  HolderOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { APP_COPY_LOCALES } from "@habibi/shared";
import { adminFetch, unwrapList } from "../lib/api";

const CLIENTS = [
  { value: "ios_appstore", label: "iOS App Store" },
  { value: "ios_alt", label: "iOS 企业签/侧载" },
  { value: "android_play", label: "Android Google Play" },
  { value: "android_direct", label: "Android 非商店" },
  { value: "h5", label: "H5" },
  { value: "windows", label: "Windows 桌面" },
  { value: "macos", label: "macOS 桌面" },
] as const;

const FILTER_ALL = "__all__";
const SELL_PLANS_FILTER_KEY = "habibi_admin_sell_plans_filters";

type DragHandleContextValue = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  listeners: ReturnType<typeof useSortable>["listeners"];
};

const DragHandleContext = createContext<DragHandleContextValue | null>(null);

function PlanDragHandle() {
  const ctx = useContext(DragHandleContext);
  if (!ctx) return <HolderOutlined style={{ color: "#bbb" }} />;
  return (
    <span
      ref={ctx.setActivatorNodeRef}
      {...ctx.listeners}
      style={{ cursor: "grab", touchAction: "none", display: "inline-flex" }}
      onClick={(e) => e.stopPropagation()}
    >
      <HolderOutlined style={{ color: "#999", fontSize: 14 }} />
    </span>
  );
}

function SortablePlanRow(
  props: HTMLAttributes<HTMLTableRowElement> & { "data-row-key": string },
) {
  const id = props["data-row-key"];
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging
      ? { position: "relative", zIndex: 99, background: "#fafafa" }
      : {}),
  };
  return (
    <DragHandleContext.Provider
      value={{ setActivatorNodeRef, listeners }}
    >
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </DragHandleContext.Provider>
  );
}

type SellPlansFilters = {
  groupId: string;
  client: string;
  enabled: string;
};

function loadSellPlansFilters(): SellPlansFilters {
  try {
    const raw = localStorage.getItem(SELL_PLANS_FILTER_KEY);
    if (!raw) {
      return { groupId: FILTER_ALL, client: FILTER_ALL, enabled: FILTER_ALL };
    }
    const parsed = JSON.parse(raw) as Partial<SellPlansFilters>;
    return {
      groupId: typeof parsed.groupId === "string" ? parsed.groupId : FILTER_ALL,
      client: typeof parsed.client === "string" ? parsed.client : FILTER_ALL,
      enabled: typeof parsed.enabled === "string" ? parsed.enabled : FILTER_ALL,
    };
  } catch {
    return { groupId: FILTER_ALL, client: FILTER_ALL, enabled: FILTER_ALL };
  }
}

function saveSellPlansFilters(next: SellPlansFilters) {
  localStorage.setItem(SELL_PLANS_FILTER_KEY, JSON.stringify(next));
}

function FilterChipGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Space size={[8, 8]} wrap>
      {options.map((opt) => (
        <Tag.CheckableTag
          key={opt.value}
          checked={value === opt.value}
          onChange={(checked) => {
            if (checked) onChange(opt.value);
          }}
        >
          {opt.label}
        </Tag.CheckableTag>
      ))}
    </Space>
  );
}

/** Fixed-day packs (relative seconds). Labels keep “约 N 天” to contrast calendar months. */
const DURATION_DAY_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: "1 天" },
  { days: 2, label: "2 天" },
  { days: 3, label: "3 天" },
  { days: 7, label: "7 天" },
  { days: 15, label: "15 天" },
  { days: 30, label: "30 天（固定）" },
  { days: 90, label: "90 天（固定）" },
  { days: 180, label: "180 天（固定）" },
  { days: 365, label: "365 天（固定）" },
  { days: 730, label: "730 天（固定）" },
];

/** Sub-day fixed durations → validity_seconds */
const SHORT_DURATION_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 30 * 60, label: "30 分钟" },
  { seconds: 1 * 3600, label: "1 小时" },
  { seconds: 2 * 3600, label: "2 小时" },
  { seconds: 3 * 3600, label: "3 小时" },
  { seconds: 5 * 3600, label: "5 小时" },
  { seconds: 12 * 3600, label: "12 小时" },
];

/** Calendar month/year packs → validity_calendar_months (expire_at by calendar) */
const DURATION_CALENDAR_PRESETS: { months: number; label: string }[] = [
  { months: 1, label: "1 个自然月" },
  { months: 3, label: "3 个自然月" },
  { months: 6, label: "6 个自然月" },
  { months: 12, label: "1 个自然年（12 月）" },
  { months: 24, label: "2 个自然年（24 月）" },
];

function buildDurationDayOptions(
  extraDays: number[],
  upstreamDays: number[],
): { value: number; label: string }[] {
  const map = new Map<number, string>();
  for (const p of DURATION_DAY_PRESETS) map.set(p.days, p.label);
  for (const d of upstreamDays) {
    if (d > 0 && !map.has(d)) map.set(d, `${d} 天（上游）`);
  }
  for (const d of extraDays) {
    if (d > 0 && !map.has(d)) map.set(d, `${d} 天（自定义）`);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, label]) => ({ value, label }));
}

function formatShortSecondsLabel(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时（自定义）`;
  if (sec % 60 === 0) return `${sec / 60} 分钟（自定义）`;
  return `${sec} 秒（自定义）`;
}

/** Select value: `d:30` = fixed days, `s:3600` = fixed seconds, `m:12` = calendar months */
function secondsToValidityPreset(sec: number): string | undefined {
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  if (sec % 86400 === 0) return `d:${sec / 86400}`;
  return `s:${sec}`;
}

function buildValidityPresetOptions(
  dayOptions: { value: number; label: string }[],
  extraMonths: number[],
  extraSeconds: number[] = [],
): { label: string; options: { value: string; label: string }[] }[] {
  const monthMap = new Map<number, string>();
  for (const p of DURATION_CALENDAR_PRESETS) {
    monthMap.set(p.months, p.label);
  }
  for (const m of extraMonths) {
    if (m > 0 && !monthMap.has(m)) {
      monthMap.set(
        m,
        m % 12 === 0 ? `${m / 12} 个自然年（${m} 月）` : `${m} 个自然月`,
      );
    }
  }
  const monthOpts = [...monthMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([months, label]) => ({ value: `m:${months}`, label }));

  const shortMap = new Map<number, string>();
  for (const p of SHORT_DURATION_PRESETS) shortMap.set(p.seconds, p.label);
  for (const s of extraSeconds) {
    if (s > 0 && s % 86400 !== 0 && !shortMap.has(s)) {
      shortMap.set(s, formatShortSecondsLabel(s));
    }
  }
  const shortOpts = [...shortMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seconds, label]) => ({ value: `s:${seconds}`, label }));

  return [
    {
      label: "自然月 / 年（开通按日历同日到期，推荐年卡）",
      options: monthOpts,
    },
    {
      label: "固定时长（秒数，与日历无关）",
      options: [
        ...shortOpts,
        ...dayOptions.map((o) => ({
          value: `d:${o.value}`,
          label: o.label,
        })),
      ],
    },
  ];
}

/** Go-duration presets for WireRaw custom_reset_interval */
const RESET_INTERVAL_PRESETS: { value: string; label: string }[] = [
  { value: "24h", label: "1 天（24h）" },
  { value: "168h", label: "7 天（168h）" },
  { value: "360h", label: "15 天（360h）" },
  { value: "720h", label: "30 天（720h）" },
  { value: "2160h", label: "90 天（2160h）" },
  { value: "4320h", label: "180 天（4320h）" },
  { value: "8760h", label: "365 天（8760h）" },
];

const GO_DURATION_RE = /^\d+(\.\d+)?(ns|us|µs|ms|s|m|h)$/;

function buildResetIntervalOptions(
  extras: string[],
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const p of RESET_INTERVAL_PRESETS) map.set(p.value, p.label);
  for (const raw of extras) {
    const v = raw.trim();
    if (!v || map.has(v)) continue;
    map.set(v, `${v}（自定义）`);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label }));
}

type CatalogOffer = {
  client: string;
  enabled: boolean;
  sortOrder: number;
  paymentMode: string;
};

type StoreProduct = {
  store: string;
  productId: string;
  productKind: string;
  trialDays?: number | null;
  enabled: boolean;
};

type PlanGroupOption = {
  id: string;
  code: string;
  name: string;
  nameI18n?: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
};

type SellPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  nameI18n?: Record<string, string>;
  descriptionI18n?: Record<string, string>;
  priceCents: number;
  currency: string;
  upstreamPlanRef?: string | null;
  validitySeconds?: number | null;
  validityCalendarMonths?: number | null;
  billingPeriodSeconds?: number | null;
  dataLimitBytes?: number | null;
  deviceSlots?: number;
  billingType?: string;
  resetPolicy?: string;
  customResetInterval?: string | null;
  enabled: boolean;
  isFreeClaimable?: boolean;
  sortOrder: number;
  groupId?: string | null;
  group?: {
    id: string;
    code: string;
    name: string;
    enabled: boolean;
    sortOrder: number;
  } | null;
  catalogOffers?: CatalogOffer[];
  storeProducts?: StoreProduct[];
};

function i18nFromValues(
  values: Record<string, unknown>,
  field: "name" | "description",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    const v = values[`${field}_${loc.code}`];
    // 始终带上各语言键（空串表示清除），避免漏键被后端当成「未改」或整表覆盖丢文案
    out[loc.code] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

/** Portable plan config for cross-env copy (no DB ids). */
const PLAN_TRANSFER_VERSION = 1;

type PlanTransferJson = {
  version: number;
  code?: string;
  nameI18n?: Record<string, string>;
  descriptionI18n?: Record<string, string>;
  priceCents?: number;
  currency?: string;
  upstreamPlanRef?: string | null;
  /** `d:30` | `s:3600` | `m:12` */
  validityPreset?: string | null;
  validityCalendarMonths?: number | null;
  validitySeconds?: number | null;
  billingPeriodDays?: number | null;
  dataLimitGb?: number | null;
  deviceSlots?: number;
  billingType?: string;
  resetPolicy?: string;
  customResetInterval?: string | null;
  /** Prefer code over id for cross-env */
  groupCode?: string | null;
  enabled?: boolean;
  isFreeClaimable?: boolean;
  sortOrder?: number;
  clients?: string[];
  appStoreProductId?: string;
  appStoreProductKind?: string;
  appStoreTrialDays?: number | null;
  playProductId?: string;
  playProductKind?: string;
  playTrialDays?: number | null;
};

function formValuesToTransferJson(
  values: Record<string, unknown>,
  groups: PlanGroupOption[],
): PlanTransferJson {
  const groupId = values.groupId ? String(values.groupId) : "";
  const group = groups.find((g) => g.id === groupId);
  const out: PlanTransferJson = {
    version: PLAN_TRANSFER_VERSION,
    code: values.code ? String(values.code) : undefined,
    nameI18n: i18nFromValues(values, "name"),
    descriptionI18n: i18nFromValues(values, "description"),
    priceCents: Number(values.priceCents ?? 0),
    currency: String(values.currency || "USD"),
    upstreamPlanRef: (values.upstreamPlanRef as string) || null,
    validityPreset: values.validityPreset
      ? String(values.validityPreset)
      : null,
    billingPeriodDays:
      values.billingPeriodDays != null && values.billingPeriodDays !== ""
        ? Number(values.billingPeriodDays)
        : null,
    dataLimitGb:
      values.dataLimitGb != null && values.dataLimitGb !== ""
        ? Number(values.dataLimitGb)
        : null,
    deviceSlots: Number(values.deviceSlots ?? 1),
    billingType: String(values.billingType || "one_time"),
    resetPolicy: String(values.resetPolicy || "no_reset"),
    customResetInterval:
      values.resetPolicy === "custom"
        ? String(values.customResetInterval || "").trim() || null
        : null,
    groupCode: group?.code ?? null,
    enabled: !!values.enabled,
    isFreeClaimable: !!values.isFreeClaimable,
    sortOrder: Number(values.sortOrder ?? 0),
    clients: Array.isArray(values.clients)
      ? (values.clients as string[])
      : [],
  };
  if (values.appStoreProductId) {
    out.appStoreProductId = String(values.appStoreProductId).trim();
    out.appStoreProductKind = String(
      values.appStoreProductKind || "auto_renewing",
    );
    if (values.appStoreTrialDays != null && values.appStoreTrialDays !== "") {
      out.appStoreTrialDays = Number(values.appStoreTrialDays);
    }
  }
  if (values.playProductId) {
    out.playProductId = String(values.playProductId).trim();
    out.playProductKind = String(values.playProductKind || "auto_renewing");
    if (values.playTrialDays != null && values.playTrialDays !== "") {
      out.playTrialDays = Number(values.playTrialDays);
    }
  }
  return out;
}

function transferJsonToFormValues(
  raw: unknown,
  groups: PlanGroupOption[],
): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("JSON 必须是对象");
  }
  const data = raw as PlanTransferJson & Record<string, unknown>;
  let validityPreset =
    typeof data.validityPreset === "string" ? data.validityPreset : undefined;
  if (!validityPreset && data.validityCalendarMonths) {
    validityPreset = `m:${Number(data.validityCalendarMonths)}`;
  } else if (!validityPreset && data.validitySeconds) {
    validityPreset = secondsToValidityPreset(Number(data.validitySeconds));
  }

  let groupId = "";
  if (data.groupCode) {
    const g = groups.find((x) => x.code === String(data.groupCode));
    if (!g) {
      message.warning(
        `目标环境没有分组 code=${data.groupCode}，已留空「所属分组」`,
      );
    } else {
      groupId = g.id;
    }
  }

  const nameI18n =
    (data.nameI18n as Record<string, string>) ||
    (data.name_i18n as Record<string, string>) ||
    {};
  const descriptionI18n =
    (data.descriptionI18n as Record<string, string>) ||
    (data.description_i18n as Record<string, string>) ||
    {};
  const fields: Record<string, unknown> = {
    code: data.code,
    currency: data.currency || "USD",
    priceCents: data.priceCents,
    upstreamPlanRef: data.upstreamPlanRef ?? undefined,
    validityPreset,
    billingPeriodDays: data.billingPeriodDays ?? undefined,
    dataLimitGb: data.dataLimitGb ?? undefined,
    deviceSlots: data.deviceSlots ?? 1,
    billingType: data.billingType || "one_time",
    resetPolicy: data.resetPolicy || "no_reset",
    customResetInterval: data.customResetInterval ?? undefined,
    groupId,
    enabled: data.enabled !== false,
    isFreeClaimable: !!data.isFreeClaimable,
    sortOrder: data.sortOrder ?? 0,
    clients: Array.isArray(data.clients)
      ? data.clients
      : ["h5", "android_direct", "ios_alt"],
    appStoreProductId: data.appStoreProductId,
    appStoreProductKind: data.appStoreProductKind || "auto_renewing",
    appStoreTrialDays: data.appStoreTrialDays ?? undefined,
    playProductId: data.playProductId,
    playProductKind: data.playProductKind || "auto_renewing",
    playTrialDays: data.playTrialDays ?? undefined,
  };
  for (const loc of APP_COPY_LOCALES) {
    fields[`name_${loc.code}`] = nameI18n[loc.code] || "";
    fields[`description_${loc.code}`] = descriptionI18n[loc.code] || "";
  }
  return fields;
}

function PlanJsonTransferPanel({ groups }: { groups: PlanGroupOption[] }) {
  const form = Form.useFormInstance();
  const [text, setText] = useState("");

  const pullFromForm = () => {
    const values = form.getFieldsValue(true);
    setText(
      JSON.stringify(formValuesToTransferJson(values, groups), null, 2),
    );
    message.success("已从表单生成 JSON");
  };

  const applyToForm = () => {
    try {
      const parsed = JSON.parse(text) as unknown;
      const values = transferJsonToFormValues(parsed, groups);
      form.setFieldsValue(values);
      message.success("已应用到表单，请核对后保存");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "JSON 无效");
    }
  };

  const copyText = async () => {
    const payload =
      text.trim() ||
      JSON.stringify(
        formValuesToTransferJson(form.getFieldsValue(true), groups),
        null,
        2,
      );
    if (!text.trim()) setText(payload);
    try {
      await navigator.clipboard.writeText(payload);
      message.success("已复制到剪贴板");
    } catch {
      message.error("复制失败，请手动全选复制");
    }
  };

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: "json",
          label: "JSON 导入 / 导出（跨环境复制配置）",
          children: (
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <Alert
                type="info"
                showIcon
                message="粘贴 JSON →「应用到表单」→ 核对 → 提交；或填完表单后「从表单生成」再复制到另一环境。"
                description="分组用 groupCode（不是 id）。商店商品 ID 跨环境可能冲突，导入后建议核对或清空。不含数据库 plan id。"
              />
              <Input.TextArea
                rows={14}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='粘贴套餐 JSON，例如 { "version": 1, "code": "year_30g", ... }'
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                }}
              />
              <Space wrap>
                <Button onClick={pullFromForm}>从表单生成</Button>
                <Button type="primary" onClick={applyToForm}>
                  应用到表单
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => void copyText()}>
                  复制
                </Button>
              </Space>
            </Space>
          ),
        },
      ]}
    />
  );
}

function valuesFromI18n(plan: SellPlan | null) {
  const fields: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    fields[`name_${loc.code}`] =
      plan?.nameI18n?.[loc.code] || (loc.code === "zh" ? plan?.name || "" : "");
    fields[`description_${loc.code}`] =
      plan?.descriptionI18n?.[loc.code] ||
      (loc.code === "zh" ? plan?.description || "" : "");
  }
  return fields;
}

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

function defaultPaymentMode(client: string) {
  if (client === "ios_appstore" || client === "android_play") return "iap_only";
  return "web_only";
}

export default function SellPlansPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [editing, setEditing] = useState<SellPlan | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [groups, setGroups] = useState<PlanGroupOption[]>([]);
  const [upstreamDurationDays, setUpstreamDurationDays] = useState<number[]>([]);
  const [customDurationDays, setCustomDurationDays] = useState<number[]>([]);
  const [customResetIntervals, setCustomResetIntervals] = useState<string[]>([]);
  const [filterGroupId, setFilterGroupId] = useState(
    () => loadSellPlansFilters().groupId,
  );
  const [filterClient, setFilterClient] = useState(
    () => loadSellPlansFilters().client,
  );
  const [filterEnabled, setFilterEnabled] = useState(
    () => loadSellPlansFilters().enabled,
  );
  const [dataSource, setDataSource] = useState<SellPlan[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  const reload = () => actionRef.current?.reload();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDataSource((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex).map((p, i) => ({
        ...p,
        sortOrder: i,
      }));
      return next;
    });
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    if (!dataSource.length) return;
    setSavingOrder(true);
    try {
      await adminFetch("/admin/v1/plans/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: dataSource.map((p) => p.id) }),
      });
      message.success("排序已保存");
      setOrderDirty(false);
      reload();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存排序失败");
    } finally {
      setSavingOrder(false);
    }
  };

  useEffect(() => {
    saveSellPlansFilters({
      groupId: filterGroupId,
      client: filterClient,
      enabled: filterEnabled,
    });
  }, [filterGroupId, filterClient, filterEnabled]);

  // Drop stale group filter if that group was deleted
  useEffect(() => {
    if (
      filterGroupId !== FILTER_ALL &&
      filterGroupId !== "__none__" &&
      groups.length > 0 &&
      !groups.some((g) => g.id === filterGroupId)
    ) {
      setFilterGroupId(FILTER_ALL);
    }
  }, [groups, filterGroupId]);

  useEffect(() => {
    void adminFetch<{ groups: PlanGroupOption[] }>("/admin/v1/plan-groups")
      .then((r) => setGroups(r.groups || []))
      .catch(() => setGroups([]));
  }, [createOpen, editing]);

  useEffect(() => {
    void adminFetch("/admin/v1/wireraw/customer-plans")
      .then((data) => {
        const plans = unwrapList<{ validity_seconds?: number }>(data, [
          "items",
          "plans",
        ]);
        const days = new Set<number>();
        for (const p of plans) {
          const sec = p.validity_seconds;
          if (sec != null && sec > 0 && sec % 86400 === 0) {
            days.add(sec / 86400);
          }
        }
        setUpstreamDurationDays([...days].sort((a, b) => a - b));
      })
      .catch(() => setUpstreamDurationDays([]));
  }, []);

  const durationDayOptions = useMemo(() => {
    const fromEditing: number[] = [];
    if (editing?.validitySeconds && editing.validitySeconds % 86400 === 0) {
      fromEditing.push(editing.validitySeconds / 86400);
    }
    if (
      editing?.billingPeriodSeconds &&
      editing.billingPeriodSeconds % 86400 === 0
    ) {
      fromEditing.push(editing.billingPeriodSeconds / 86400);
    }
    return buildDurationDayOptions(
      [...customDurationDays, ...fromEditing],
      upstreamDurationDays,
    );
  }, [customDurationDays, upstreamDurationDays, editing]);

  const validityPresetOptions = useMemo(() => {
    const extraMonths: number[] = [];
    if (editing?.validityCalendarMonths) {
      extraMonths.push(editing.validityCalendarMonths);
    }
    const extraSeconds: number[] = [];
    if (editing?.validitySeconds && editing.validitySeconds % 86400 !== 0) {
      extraSeconds.push(editing.validitySeconds);
    }
    return buildValidityPresetOptions(
      durationDayOptions,
      extraMonths,
      extraSeconds,
    );
  }, [durationDayOptions, editing]);

  const rememberCustomDays = (input: string) => {
    const n = Number(String(input).trim());
    if (!Number.isInteger(n) || n < 1) return;
    setCustomDurationDays((prev) =>
      prev.includes(n) ? prev : [...prev, n].sort((a, b) => a - b),
    );
  };

  const rememberCustomResetInterval = (input: string) => {
    const v = String(input).trim().toLowerCase();
    if (!GO_DURATION_RE.test(v)) return;
    setCustomResetIntervals((prev) =>
      prev.includes(v) ? prev : [...prev, v],
    );
  };

  const resetIntervalOptions = useMemo(() => {
    const extras = [...customResetIntervals];
    if (editing?.customResetInterval) {
      extras.push(editing.customResetInterval);
    }
    return buildResetIntervalOptions(extras);
  }, [customResetIntervals, editing]);

  const groupOptions = [
    { value: "", label: "无分组" },
    ...groups.map((g) => ({
      value: g.id,
      label: `${g.nameI18n?.zh || g.nameI18n?.en || g.name}${g.enabled ? "" : "（已禁用）"}`,
    })),
  ];

  const columns: ProColumns<SellPlan>[] = [
    {
      title: "",
      dataIndex: "drag",
      width: 40,
      search: false,
      render: () => <PlanDragHandle />,
    },
    {
      title: "排序",
      dataIndex: "sortOrder",
      width: 64,
      search: false,
      render: (_, r, index) => (orderDirty ? index : r.sortOrder),
    },
    { title: "code", dataIndex: "code", copyable: true },
    {
      title: "名称",
      dataIndex: "name",
      render: (_, r) => r.nameI18n?.zh || r.nameI18n?.en || r.name,
    },
    {
      title: "分组",
      dataIndex: "groupId",
      width: 120,
      search: false,
      render: (_, r) =>
        r.group ? (
          <Tag color={r.group.enabled ? "blue" : "default"}>{r.group.name}</Tag>
        ) : (
          <Tag>—</Tag>
        ),
    },
    {
      title: "售价",
      dataIndex: "priceCents",
      search: false,
      render: (_, r) => formatPrice(r.priceCents, r.currency),
    },
    {
      title: "终端数",
      dataIndex: "deviceSlots",
      width: 80,
      search: false,
      render: (_, r) => r.deviceSlots ?? 1,
    },
    {
      title: "计费",
      dataIndex: "billingType",
      width: 90,
      search: false,
      render: (_, r) =>
        r.billingType === "renewable" ? (
          <Tag color="purple">可续订</Tag>
        ) : (
          <Tag>买断</Tag>
        ),
    },
    {
      title: "流量重置",
      dataIndex: "resetPolicy",
      width: 100,
      search: false,
      render: (_, r) => {
        const map: Record<string, string> = {
          no_reset: "不重置",
          day: "每日",
          week: "每周",
          month: "每月",
          year: "每年",
          custom: r.customResetInterval || "自定义",
        };
        const key = r.resetPolicy || "no_reset";
        return <Tag>{map[key] || key}</Tag>;
      },
    },
    {
      title: "计费周期",
      dataIndex: "billingPeriodSeconds",
      width: 100,
      search: false,
      render: (_, r) =>
        formatDuration(
          r.billingPeriodSeconds ?? r.validitySeconds ?? null,
        ),
    },
    {
      title: "上架端",
      dataIndex: "client",
      width: 220,
      search: false,
      render: (_, r) => {
        const on = (r.catalogOffers || []).filter((o) => o.enabled);
        if (!on.length) return <Tag>无</Tag>;
        return (
          <Space size={[4, 4]} wrap>
            {on.map((o) => (
              <Tag key={o.client}>
                {CLIENTS.find((c) => c.value === o.client)?.label || o.client}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "商店商品",
      search: false,
      ellipsis: true,
      render: (_, r) => {
        const ps = (r.storeProducts || []).filter((p) => p.enabled);
        if (!ps.length) return "—";
        return ps
          .map((p) => {
            const trial =
              p.trialDays != null && p.trialDays > 0 ? ` (试用${p.trialDays}天)` : "";
            return `${p.store}:${p.productId}${trial}`;
          })
          .join(" · ");
      },
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
      search: false,
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
      <Form.Item label="多语言名称 / 说明" style={{ marginBottom: 8 }} required>
        <Tabs
          size="small"
          items={APP_COPY_LOCALES.map((loc) => ({
            key: loc.code,
            label: loc.label,
            // 未打开过的语言 Tab 默认不挂载，onFinish 会丢字段导致其它语言被覆盖
            forceRender: true,
            children: (
              <>
                <Form.Item
                  name={`name_${loc.code}`}
                  label="展示名称"
                  rules={
                    loc.code === "zh"
                      ? [{ required: true, message: "请填写中文名称" }]
                      : undefined
                  }
                  style={{ marginBottom: 12 }}
                >
                  <Input
                    placeholder={
                      loc.code === "zh" ? "月度 Pro" : "Monthly Pro"
                    }
                  />
                </Form.Item>
                <Form.Item
                  name={`description_${loc.code}`}
                  label="说明"
                  style={{ marginBottom: 0 }}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder={
                      loc.code === "zh"
                        ? "适合日常使用…"
                        : "Best for everyday use…"
                    }
                  />
                </Form.Item>
              </>
            ),
          }))}
        />
      </Form.Item>
      <ProFormDigit
        name="priceCents"
        label="价格（分）"
        rules={[{ required: true }]}
        min={0}
        tooltip="非商店端全球一口价。App Store / Play 价格在商店后台配置。"
      />
      <ProFormSelect
        name="currency"
        label="币种"
        options={[
          { value: "USD", label: "USD" },
          { value: "CNY", label: "CNY" },
          { value: "EUR", label: "EUR" },
        ]}
      />
      <ProFormSelect
        name="billingType"
        label="计费形态"
        options={[
          { value: "one_time", label: "买断 / 时长包" },
          { value: "renewable", label: "可续订（可映射商店自动续订）" },
        ]}
      />
      <ProFormSelect
        name="groupId"
        label="所属分组"
        options={groupOptions}
        allowClear
        tooltip="目录展示用；可在「套餐分组」中维护。留空=无分组"
        fieldProps={{
          placeholder: "无分组",
        }}
      />
      <ProFormDigit
        name="deviceSlots"
        label="支持终端数"
        min={1}
        max={100}
        tooltip="同一账号可同时在线的设备数；多端共享权益"
      />
      <ProFormCheckbox.Group
        name="clients"
        label="上架端"
        options={CLIENTS.map((c) => ({ label: c.label, value: c.value }))}
        tooltip="勾选后用户在该端 GET /plans?client=… 可见"
      />
      <ProFormText
        name="appStoreProductId"
        label="App Store 商品 ID"
        tooltip="如 com.habibi.vpn.monthly；空表示暂未映射"
      />
      <ProFormSelect
        name="appStoreProductKind"
        label="App Store 商品类型"
        options={[
          { value: "auto_renewing", label: "自动续订订阅" },
          { value: "non_renewing", label: "非续订订阅" },
          { value: "consumable", label: "消耗型" },
          { value: "non_consumable", label: "非消耗型" },
        ]}
      />
      <ProFormDigit
        name="appStoreTrialDays"
        label="App Store 试用天数（展示）"
        min={0}
        max={3650}
        tooltip="仅用于端上文案/运营对照；真正试用长度以 App Store Connect 为准，履约看交易 expiresDate"
      />
      <ProFormText
        name="playProductId"
        label="Google Play 商品 ID"
        tooltip="预留；未来 Play 内购使用"
      />
      <ProFormSelect
        name="playProductKind"
        label="Play 商品类型"
        options={[
          { value: "auto_renewing", label: "自动续订订阅" },
          { value: "non_renewing", label: "非续订" },
          { value: "consumable", label: "消耗型" },
          { value: "non_consumable", label: "非消耗型" },
        ]}
      />
      <ProFormDigit
        name="playTrialDays"
        label="Play 试用天数（展示）"
        min={0}
        max={3650}
        tooltip="预留；展示用，不以本地字段计费"
      />
      <ProFormSelect
        name="upstreamPlanRef"
        label="映射上游套餐"
        tooltip="支付成功后开户用的 WireRaw next_plan_ref"
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
      <ProFormSelect
        name="validityPreset"
        label="开通时长（可选）"
        options={validityPresetOptions}
        placeholder="自然月/年 或 固定时长"
        allowClear
        showSearch
        tooltip="自然月/年：开通按日历同日算到期（3/15 买 12 自然月 → 次年 3/15）。固定时长：分钟/小时/天按秒数累加。本地开通时长优先于「映射上游套餐」的时长。年卡+每月清空请选自然年 + 流量重置「每月」。"
        extra="未填开通时长且未映射上游时，开户会默认只给 1 天。年卡月流量：自然年 + 每月清空（勿用自定义 720h）。"
        fieldProps={{
          optionFilterProp: "label",
          onSearch: rememberCustomDays,
          onBlur: (e) =>
            rememberCustomDays((e.target as HTMLInputElement).value || ""),
        }}
      />
      <ProFormSelect
        name="billingPeriodDays"
        label="计费周期（天）"
        options={durationDayOptions}
        placeholder="选预设，或输入数字自定义"
        allowClear
        showSearch
        tooltip="仅目录展示/日均比价用，不参与开通。自然年套餐可填 365 方便日均展示；留空则日均按开通时长估算"
        fieldProps={{
          optionFilterProp: "label",
          onSearch: rememberCustomDays,
          onBlur: (e) =>
            rememberCustomDays((e.target as HTMLInputElement).value || ""),
        }}
      />
      <ProFormDigit
        name="dataLimitGb"
        label="流量上限 GB（可选）"
        min={0}
        tooltip="0 表示不限；留空不设。配合「流量重置」：不重置=整期累计；每月=每周期重新计额度"
      />
      <ProFormSelect
        name="resetPolicy"
        label="流量重置"
        options={[
          { value: "no_reset", label: "不重置（整期累计，到期才清）" },
          { value: "day", label: "每日清空已用" },
          { value: "week", label: "每周清空已用" },
          {
            value: "month",
            label: "每月清空已用（自然月，同一天清 — 年卡月流量推荐）",
          },
          { value: "year", label: "每年清空已用" },
          { value: "custom", label: "自定义周期（需填下方间隔）" },
        ]}
        tooltip="决定「流量上限」多久清零一次已用量。不重置=整段有效期内共用额度；选每日/每周/每月等=到周期边界把已用流量清零，额度重新算满。开通时传给 WireRaw。"
      />
      <ProFormDependency name={["resetPolicy"]}>
        {({ resetPolicy }) =>
          resetPolicy === "custom" ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="自定义重置间隔"
                description={
                  <div style={{ fontSize: 13, lineHeight: 1.65 }}>
                    <p style={{ margin: "0 0 8px" }}>
                      每隔多久把「已用流量」清零一次。优先从下拉勾选；也可搜索框输入如{" "}
                      <code>480h</code>（20 天）后选用。
                    </p>
                    <p style={{ margin: 0 }}>
                      格式：数字 + 单位（常用 <code>h</code>）。例：开通 365 天 + 30GB +{" "}
                      <code>720h</code> ≈ 每 30 天清一次已用。
                    </p>
                  </div>
                }
              />
              <ProFormSelect
                name="customResetInterval"
                label="自定义重置间隔"
                options={resetIntervalOptions}
                placeholder="选预设，或输入如 720h"
                showSearch
                allowClear
                rules={[
                  { required: true, message: "请选择或输入间隔，如 720h" },
                  {
                    pattern: GO_DURATION_RE,
                    message: "格式如 720h、24h、168h（数字+单位）",
                  },
                ]}
                extra="常用勾选：30 天 = 720h。保存后传给上游 custom_reset_interval。"
                fieldProps={{
                  optionFilterProp: "label",
                  onSearch: rememberCustomResetInterval,
                  onBlur: (e) =>
                    rememberCustomResetInterval(
                      (e.target as HTMLInputElement).value || "",
                    ),
                }}
              />
            </>
          ) : (
            <ProFormText name="customResetInterval" hidden />
          )
        }
      </ProFormDependency>
      <ProFormDigit name="sortOrder" label="排序" />
      <ProFormSwitch name="enabled" label="全局上架" />
      <ProFormSwitch
        name="isFreeClaimable"
        label="注册后可免费领取"
        tooltip="免费领取每位用户仅一次；付费套餐可复购续期"
      />
    </>
  );

  const toPayload = (values: Record<string, unknown>) => {
    const clients = (values.clients as string[]) || [];
    const catalogOffers = CLIENTS.map((c) => ({
      client: c.value,
      enabled: clients.includes(c.value),
      sortOrder: Number(values.sortOrder ?? 0),
      paymentMode: defaultPaymentMode(c.value),
    }));

    const storeProducts: StoreProduct[] = [];
    if (values.appStoreProductId && String(values.appStoreProductId).trim()) {
      const trial =
        values.appStoreTrialDays != null && values.appStoreTrialDays !== ""
          ? Number(values.appStoreTrialDays)
          : null;
      storeProducts.push({
        store: "app_store",
        productId: String(values.appStoreProductId).trim(),
        productKind: String(values.appStoreProductKind || "auto_renewing"),
        trialDays: Number.isFinite(trial as number) ? (trial as number) : null,
        enabled: true,
      });
    }
    if (values.playProductId && String(values.playProductId).trim()) {
      const trial =
        values.playTrialDays != null && values.playTrialDays !== ""
          ? Number(values.playTrialDays)
          : null;
      storeProducts.push({
        store: "google_play",
        productId: String(values.playProductId).trim(),
        productKind: String(values.playProductKind || "auto_renewing"),
        trialDays: Number.isFinite(trial as number) ? (trial as number) : null,
        enabled: true,
      });
    }

    const nameI18n = i18nFromValues(values, "name");
    const descriptionI18n = i18nFromValues(values, "description");
    const rawGroup = values.groupId;
    const groupId =
      rawGroup == null || rawGroup === "" ? null : String(rawGroup);
    const body: Record<string, unknown> = {
      code: values.code,
      nameI18n,
      descriptionI18n,
      priceCents: Number(values.priceCents),
      currency: values.currency || "USD",
      upstreamPlanRef: values.upstreamPlanRef || null,
      enabled: !!values.enabled,
      isFreeClaimable: !!values.isFreeClaimable,
      sortOrder: Number(values.sortOrder ?? 0),
      deviceSlots: Number(values.deviceSlots ?? 1),
      billingType: values.billingType || "one_time",
      resetPolicy: values.resetPolicy || "no_reset",
      customResetInterval:
        values.resetPolicy === "custom"
          ? String(values.customResetInterval || "").trim().toLowerCase() ||
            null
          : null,
      groupId,
      catalogOffers,
      storeProducts,
    };
    const preset = String(values.validityPreset || "").trim();
    if (preset.startsWith("m:")) {
      const months = Number(preset.slice(2));
      body.validityCalendarMonths =
        Number.isInteger(months) && months > 0 ? months : null;
      body.validitySeconds = null;
    } else if (preset.startsWith("d:")) {
      const days = Number(preset.slice(2));
      body.validitySeconds =
        Number.isInteger(days) && days > 0 ? days * 86400 : null;
      body.validityCalendarMonths = null;
    } else if (preset.startsWith("s:")) {
      const seconds = Number(preset.slice(2));
      body.validitySeconds =
        Number.isInteger(seconds) && seconds > 0 ? seconds : null;
      body.validityCalendarMonths = null;
    } else if (editing) {
      body.validitySeconds = null;
      body.validityCalendarMonths = null;
    }
    if (values.billingPeriodDays != null && values.billingPeriodDays !== "") {
      body.billingPeriodSeconds = Number(values.billingPeriodDays) * 86400;
    } else if (editing) {
      body.billingPeriodSeconds = null;
    }
    if (values.dataLimitGb != null && values.dataLimitGb !== "") {
      body.dataLimitGb = Number(values.dataLimitGb);
    } else if (editing) {
      body.dataLimitBytes = null;
    }
    return body;
  };

  const initialFromPlan = (p: SellPlan) => {
    const app = (p.storeProducts || []).find((x) => x.store === "app_store");
    const play = (p.storeProducts || []).find((x) => x.store === "google_play");
    return {
      ...p,
      ...valuesFromI18n(p),
      validityPreset: p.validityCalendarMonths
        ? `m:${p.validityCalendarMonths}`
        : p.validitySeconds
          ? secondsToValidityPreset(p.validitySeconds)
          : undefined,
      billingPeriodDays: p.billingPeriodSeconds
        ? p.billingPeriodSeconds / 86400
        : undefined,
      dataLimitGb:
        p.dataLimitBytes != null && p.dataLimitBytes > 0
          ? Number((p.dataLimitBytes / 1024 ** 3).toFixed(3))
          : p.dataLimitBytes === 0
            ? 0
            : undefined,
      deviceSlots: p.deviceSlots ?? 1,
      billingType: p.billingType || "one_time",
      resetPolicy: p.resetPolicy || "no_reset",
      customResetInterval: p.customResetInterval || undefined,
      groupId: p.groupId || "",
      clients: (p.catalogOffers || []).filter((o) => o.enabled).map((o) => o.client),
      appStoreProductId: app?.productId,
      appStoreProductKind: app?.productKind || "auto_renewing",
      appStoreTrialDays: app?.trialDays ?? undefined,
      playProductId: play?.productId,
      playProductKind: play?.productKind || "auto_renewing",
      playTrialDays: play?.trialDays ?? undefined,
    };
  };

  return (
    <PageContainer
      title="售卖套餐"
      subTitle="本地 SKU + 多端目录 + 商店商品映射（App Store / Play 核销已接入）"
    >
      <div
        style={{
          marginBottom: 16,
          padding: "12px 16px",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #f0f0f0",
        }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {(
            [
              {
                title: "分组",
                value: filterGroupId,
                onChange: setFilterGroupId,
                options: [
                  { label: "全部", value: FILTER_ALL },
                  { label: "无分组", value: "__none__" },
                  ...groups.map((g) => ({
                    label: `${g.nameI18n?.zh || g.nameI18n?.en || g.name}${g.enabled ? "" : "（禁）"}`,
                    value: g.id,
                  })),
                ],
              },
              {
                title: "上架端",
                value: filterClient,
                onChange: setFilterClient,
                options: [
                  { label: "全部", value: FILTER_ALL },
                  ...CLIENTS.map((c) => ({ label: c.label, value: c.value })),
                ],
              },
              {
                title: "状态",
                value: filterEnabled,
                onChange: setFilterEnabled,
                options: [
                  { label: "全部", value: FILTER_ALL },
                  { label: "上架", value: "true" },
                  { label: "下架", value: "false" },
                ],
              },
            ] as const
          ).map((row) => (
            <div
              key={row.title}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
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
                {row.title}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FilterChipGroup
                  value={row.value}
                  onChange={row.onChange}
                  options={[...row.options]}
                />
              </div>
            </div>
          ))}
        </Space>
      </div>

      {orderDirty ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="列表顺序已改动，请点击「保存排序」写入后台；筛选变更或刷新会丢失未保存调整"
        />
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={dataSource.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ProTable<SellPlan>
            rowKey="id"
            actionRef={actionRef}
            columns={columns}
            dataSource={dataSource}
            pagination={false}
            components={{
              body: { row: SortablePlanRow },
            }}
            toolBarRender={() => [
              <Button
                key="save-order"
                type={orderDirty ? "primary" : "default"}
                icon={<SaveOutlined />}
                disabled={!orderDirty}
                loading={savingOrder}
                onClick={() => void saveOrder()}
              >
                保存排序
              </Button>,
              <Link key="groups" to="/sell-plans/groups">
                <Button icon={<FolderOutlined />}>套餐分组</Button>
              </Link>,
              <Link key="preview" to="/sell-plans/preview">
                <Button icon={<EyeOutlined />}>端侧预览</Button>
              </Link>,
              <Button
                key="add"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
              >
                新建套餐
              </Button>,
            ]}
            params={{
              filterGroupId,
              filterClient,
              filterEnabled,
            }}
            request={async (params) => {
              const qs = new URLSearchParams();
              if (filterEnabled === "true" || filterEnabled === "false") {
                qs.set("enabled", filterEnabled);
              }
              if (filterClient !== FILTER_ALL) {
                qs.set("client", filterClient);
              }
              const qstr = qs.toString() ? `?${qs.toString()}` : "";
              const data = await adminFetch<{ plans: SellPlan[] }>(
                `/admin/v1/plans${qstr}`,
              );
              let list = data.plans || [];
              if (params.code) {
                list = list.filter((p) => p.code.includes(String(params.code)));
              }
              if (params.name) {
                list = list.filter((p) => p.name.includes(String(params.name)));
              }
              if (filterGroupId === "__none__") {
                list = list.filter((p) => !p.groupId);
              } else if (filterGroupId !== FILTER_ALL) {
                list = list.filter((p) => p.groupId === filterGroupId);
              }
              setDataSource(list);
              setOrderDirty(false);
              return { data: list, success: true, total: list.length };
            }}
            search={{
              labelWidth: "auto",
              defaultCollapsed: true,
            }}
          />
        </SortableContext>
      </DndContext>

      <ModalForm
        title="新建售卖套餐"
        open={createOpen}
        onOpenChange={setCreateOpen}
        modalProps={{ destroyOnClose: true, width: 800 }}
        initialValues={{
          currency: "USD",
          enabled: true,
          sortOrder: 0,
          deviceSlots: 1,
          billingType: "one_time",
          resetPolicy: "no_reset",
          clients: ["h5", "android_direct", "ios_alt"],
          appStoreProductKind: "auto_renewing",
          playProductKind: "auto_renewing",
        }}
        onFinish={async (values) => {
          try {
            await adminFetch("/admin/v1/plans", {
              method: "POST",
              body: JSON.stringify(toPayload(values)),
            });
            message.success("已创建");
            reload();
            return true;
          } catch (e) {
            message.error(e instanceof Error ? e.message : "创建失败");
            return false;
          }
        }}
      >
        <PlanJsonTransferPanel groups={groups} />
        {formFields}
      </ModalForm>

      <ModalForm
        title={`编辑 — ${editing?.name || ""}`}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        modalProps={{ destroyOnClose: true, width: 800 }}
        initialValues={editing ? initialFromPlan(editing) : undefined}
        onFinish={async (values) => {
          if (!editing) return false;
          try {
            const body = toPayload({ ...values, code: editing.code });
            delete body.code;
            await adminFetch(`/admin/v1/plans/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            message.success("已保存");
            reload();
            return true;
          } catch (e) {
            message.error(e instanceof Error ? e.message : "保存失败");
            return false;
          }
        }}
      >
        <PlanJsonTransferPanel groups={groups} />
        {formFields}
        <Space style={{ color: "#888", fontSize: 12 }}>
          iOS/Play 真实售价在商店后台；此处商品 ID 供客户端拉起内购。非商店端用上面的价格（分）。
        </Space>
      </ModalForm>
    </PageContainer>
  );
}
