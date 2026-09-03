import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  TranslationOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch, ApiError } from "../lib/api";
import { getProjectId } from "../lib/project";

const PLATFORMS = ["ios", "android", "windows", "macos", "linux"] as const;
type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: "iOS",
  android: "Android",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const IMPORT_LABELS: Record<string, string> = {
  shadowrocket: "Shadowrocket",
  clash_meta: "Clash",
  hiddify: "Hiddify",
  surge: "Surge",
  quantumult_x: "Quantumult X",
  v2ray: "V2Ray",
};

type ClientItem = {
  id: string;
  enabled: boolean;
  featured: boolean;
  paid: boolean;
  sort: number;
  import_key: string;
  name_i18n: Record<string, string>;
  summary_i18n: Record<string, string>;
  tip_i18n: Record<string, string>;
  urls: Partial<Record<Platform, string>>;
};

type Config = {
  enabled: boolean;
  remark: string | null;
  stored: boolean;
  clients: ClientItem[];
  clients_max: number;
  name_max: number;
  summary_max: number;
  tip_max: number;
  import_keys: string[];
};

type Row = {
  key: string;
  id: string;
  enabled: boolean;
  featured: boolean;
  paid: boolean;
  import_key: string;
  name_zh: string;
  name_en: string;
  summary_zh: string;
  summary_en: string;
  tip_zh: string;
  tip_en: string;
  url_ios: string;
  url_android: string;
  url_windows: string;
  url_macos: string;
  url_linux: string;
};

type TranslationResponse = {
  translations: Record<string, Record<string, string>>;
};

function newKey() {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function toRows(clients: ClientItem[]): Row[] {
  return clients.map((client) => ({
    key: newKey(),
    id: client.id,
    enabled: client.enabled,
    featured: client.featured,
    paid: client.paid,
    import_key: client.import_key || "",
    name_zh: client.name_i18n?.zh || "",
    name_en: client.name_i18n?.en || "",
    summary_zh: client.summary_i18n?.zh || "",
    summary_en: client.summary_i18n?.en || "",
    tip_zh: client.tip_i18n?.zh || "",
    tip_en: client.tip_i18n?.en || "",
    url_ios: client.urls?.ios || "",
    url_android: client.urls?.android || "",
    url_windows: client.urls?.windows || "",
    url_macos: client.urls?.macos || "",
    url_linux: client.urls?.linux || "",
  }));
}

function emptyRow(): Row {
  return {
    key: newKey(),
    id: "",
    enabled: true,
    featured: false,
    paid: false,
    import_key: "",
    name_zh: "",
    name_en: "",
    summary_zh: "",
    summary_en: "",
    tip_zh: "",
    tip_en: "",
    url_ios: "",
    url_android: "",
    url_windows: "",
    url_macos: "",
    url_linux: "",
  };
}

function isBlankRow(row: Row) {
  return (
    !row.id.trim() &&
    !row.name_zh.trim() &&
    !row.name_en.trim() &&
    !row.summary_zh.trim() &&
    !row.tip_zh.trim() &&
    !row.url_ios.trim() &&
    !row.url_android.trim() &&
    !row.url_windows.trim() &&
    !row.url_macos.trim() &&
    !row.url_linux.trim()
  );
}

function rowsToClients(rows: Row[]): ClientItem[] {
  return rows
    .filter((row) => !isBlankRow(row))
    .map((row, index) => ({
      id: row.id.trim().toLowerCase(),
      enabled: row.enabled,
      featured: row.featured,
      paid: row.paid,
      sort: (index + 1) * 10,
      import_key: row.import_key,
      name_i18n: {
        ...(row.name_zh.trim() ? { zh: row.name_zh.trim() } : {}),
        ...(row.name_en.trim() ? { en: row.name_en.trim() } : {}),
      },
      summary_i18n: {
        ...(row.summary_zh.trim() ? { zh: row.summary_zh.trim() } : {}),
        ...(row.summary_en.trim() ? { en: row.summary_en.trim() } : {}),
      },
      tip_i18n: {
        ...(row.tip_zh.trim() ? { zh: row.tip_zh.trim() } : {}),
        ...(row.tip_en.trim() ? { en: row.tip_en.trim() } : {}),
      },
      urls: {
        ...(row.url_ios.trim() ? { ios: row.url_ios.trim() } : {}),
        ...(row.url_android.trim() ? { android: row.url_android.trim() } : {}),
        ...(row.url_windows.trim() ? { windows: row.url_windows.trim() } : {}),
        ...(row.url_macos.trim() ? { macos: row.url_macos.trim() } : {}),
        ...(row.url_linux.trim() ? { linux: row.url_linux.trim() } : {}),
      },
    }));
}

function cellInput(
  row: Row,
  field: keyof Row,
  patch: (key: string, field: keyof Row, value: string) => void,
  opts?: { max?: number; textarea?: boolean; placeholder?: string },
) {
  const value = String(row[field] ?? "");
  if (opts?.textarea) {
    return (
      <Input.TextArea
        value={value}
        autoSize={{ minRows: 1, maxRows: 4 }}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        onChange={(event) => patch(row.key, field, event.target.value)}
      />
    );
  }
  return (
    <Input
      value={value}
      maxLength={opts?.max}
      placeholder={opts?.placeholder}
      onChange={(event) => patch(row.key, field, event.target.value)}
    />
  );
}

export default function ThirdPartyClientsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({
    clientsMax: 30,
    nameMax: 80,
    summaryMax: 160,
    tipMax: 2000,
    importKeys: Object.keys(IMPORT_LABELS),
  });

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await adminFetch<Config>(
        "/admin/v1/settings/download/third-party-clients",
      );
      setEnabled(cfg.enabled);
      setRows(toRows(cfg.clients || []));
      setMeta({
        clientsMax: cfg.clients_max || 30,
        nameMax: cfg.name_max || 80,
        summaryMax: cfg.summary_max || 160,
        tipMax: cfg.tip_max || 2000,
        importKeys: cfg.import_keys?.length
          ? cfg.import_keys
          : Object.keys(IMPORT_LABELS),
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(
    (key: string, field: keyof Row, value: string | boolean) => {
      setRows((prev) =>
        prev.map((row) =>
          row.key === key ? { ...row, [field]: value } : row,
        ),
      );
    },
    [],
  );

  const move = (index: number, delta: number) => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const onSave = async () => {
    const clients = rowsToClients(rows);
    const incomplete = clients.find((item) => !item.id || !item.name_i18n.zh);
    if (incomplete) {
      message.warning("每行需要填写 ID 和中文名称");
      return;
    }
    if (clients.length > meta.clientsMax) {
      message.warning(`最多 ${meta.clientsMax} 条`);
      return;
    }
    setSaving(true);
    try {
      await adminFetch("/admin/v1/settings/download/third-party-clients", {
        method: "PUT",
        body: JSON.stringify({ enabled, clients }),
      });
      message.success("已保存");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const fillEnglish = async () => {
    const fields: Record<string, string> = {};
    rows.forEach((row, index) => {
      if (row.name_zh.trim() && !row.name_en.trim()) {
        fields[`r${index}_name`] = row.name_zh.trim();
      }
      if (row.summary_zh.trim() && !row.summary_en.trim()) {
        fields[`r${index}_summary`] = row.summary_zh.trim();
      }
      if (row.tip_zh.trim() && !row.tip_en.trim()) {
        fields[`r${index}_tip`] = row.tip_zh.trim();
      }
    });
    const keys = Object.keys(fields);
    if (!keys.length) {
      message.info("没有需要填空的英文");
      return;
    }
    setTranslating(true);
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += 10) {
        chunks.push(keys.slice(i, i + 10));
      }
      const translations: Record<string, Record<string, string>> = {};
      for (const chunk of chunks) {
        const response = await adminFetch<TranslationResponse>(
          "/admin/v1/translate/copy",
          {
            method: "POST",
            body: JSON.stringify({
              source_locale: "zh",
              target_locales: ["en"],
              fields: Object.fromEntries(chunk.map((key) => [key, fields[key]])),
              context: "third_party_client",
            }),
          },
        );
        Object.assign(translations, response.translations);
      }
      setRows((prev) =>
        prev.map((row, index) => ({
          ...row,
          name_en:
            row.name_en.trim() ||
            translations[`r${index}_name`]?.en ||
            row.name_en,
          summary_en:
            row.summary_en.trim() ||
            translations[`r${index}_summary`]?.en ||
            row.summary_en,
          tip_en:
            row.tip_en.trim() ||
            translations[`r${index}_tip`]?.en ||
            row.tip_en,
        })),
      );
      message.success("已填入空缺英文，请核对后保存");
    } catch (error) {
      const text =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "翻译失败";
      message.error(text);
    } finally {
      setTranslating(false);
    }
  };

  const columns: ColumnsType<Row> = useMemo(
    () => [
      {
        title: "",
        width: 72,
        fixed: "left",
        render: (_, __, index) => (
          <Space size={0}>
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
            />
          </Space>
        ),
      },
      {
        title: "启用",
        width: 64,
        render: (_, row) => (
          <Switch
            size="small"
            checked={row.enabled}
            onChange={(checked) => patch(row.key, "enabled", checked)}
          />
        ),
      },
      {
        title: "推荐",
        width: 64,
        render: (_, row) => (
          <Switch
            size="small"
            checked={row.featured}
            onChange={(checked) => patch(row.key, "featured", checked)}
          />
        ),
      },
      {
        title: "付费",
        width: 64,
        render: (_, row) => (
          <Switch
            size="small"
            checked={row.paid}
            onChange={(checked) => patch(row.key, "paid", checked)}
          />
        ),
      },
      {
        title: "ID",
        width: 140,
        render: (_, row) =>
          cellInput(row, "id", patch, { max: 48, placeholder: "shadowrocket" }),
      },
      {
        title: "名称中",
        width: 140,
        render: (_, row) =>
          cellInput(row, "name_zh", patch, {
            max: meta.nameMax,
            placeholder: "必填",
          }),
      },
      {
        title: "名称英",
        width: 140,
        render: (_, row) =>
          cellInput(row, "name_en", patch, { max: meta.nameMax }),
      },
      {
        title: "简介中",
        width: 180,
        render: (_, row) =>
          cellInput(row, "summary_zh", patch, {
            max: meta.summaryMax,
            textarea: true,
          }),
      },
      {
        title: "简介英",
        width: 180,
        render: (_, row) =>
          cellInput(row, "summary_en", patch, {
            max: meta.summaryMax,
            textarea: true,
          }),
      },
      {
        title: "提示中",
        width: 220,
        render: (_, row) =>
          cellInput(row, "tip_zh", patch, {
            max: meta.tipMax,
            textarea: true,
          }),
      },
      {
        title: "提示英",
        width: 220,
        render: (_, row) =>
          cellInput(row, "tip_en", patch, {
            max: meta.tipMax,
            textarea: true,
          }),
      },
      ...PLATFORMS.map((platform) => ({
        title: PLATFORM_LABEL[platform],
        width: 200,
        render: (_: unknown, row: Row) =>
          cellInput(row, `url_${platform}` as keyof Row, patch, {
            max: 500,
            placeholder: "https://",
          }),
      })),
      {
        title: "导入键",
        width: 150,
        render: (_, row) => (
          <Select
            allowClear
            value={row.import_key || undefined}
            placeholder="可选"
            style={{ width: "100%" }}
            options={meta.importKeys.map((key) => ({
              value: key,
              label: IMPORT_LABELS[key] || key,
            }))}
            onChange={(value) => patch(row.key, "import_key", value || "")}
          />
        ),
      },
      {
        title: "",
        width: 48,
        fixed: "right",
        render: (_, row) => (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              setRows((prev) => prev.filter((item) => item.key !== row.key))
            }
          />
        ),
      },
    ],
    [meta.importKeys, meta.nameMax, meta.summaryMax, meta.tipMax, patch, rows.length],
  );

  return (
    <PageContainer
      title="第三方客户端"
      subTitle="整表直接改，保存后前台 /clients 按启用项展示。空链接表示该平台不提供。"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="只填官方商店或 GitHub 链接，本站不托管第三方安装包。渠道会按 URL 自动判断。"
      />
      <Space wrap style={{ marginBottom: 12 }}>
        <Space>
          <Typography.Text>展示到前台</Typography.Text>
          <Switch checked={enabled} onChange={setEnabled} />
        </Space>
        <Button
          icon={<PlusOutlined />}
          disabled={rows.length >= meta.clientsMax}
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          加一行
        </Button>
        <Button
          icon={<TranslationOutlined />}
          loading={translating}
          onClick={() => void fillEnglish()}
        >
          填空英文
        </Button>
        <Button type="primary" loading={saving} onClick={() => void onSave()}>
          保存
        </Button>
      </Space>
      <Table<Row>
        rowKey="key"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 2600 }}
        locale={{ emptyText: "还没有软件，点「加一行」" }}
      />
    </PageContainer>
  );
}
