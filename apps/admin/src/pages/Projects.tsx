import { useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import {
  InboxOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { APP_COPY_LOCALES } from "@habibi/shared";
import { adminFetch } from "../lib/api";
import { getProjectId, setProjectId } from "../lib/project";

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type Project = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  remark: string | null;
  siteCount: number;
  packageCount: number;
  userCount: number;
  planCount: number;
};

type Site = {
  id: string;
  name: string;
  host: string;
  enabled: boolean;
  remark?: string | null;
};

type AppClientConfig = {
  api_bases?: string[];
  h5_bases?: string[];
  support?: { telegram?: string | null; email?: string | null };
  feature_flags?: { iap_enabled?: boolean; promo_enabled?: boolean };
  extras?: Record<string, unknown>;
};

type AppPkg = {
  id: string;
  name: string;
  packageName: string;
  platform: string;
  client: string;
  isPrimary: boolean;
  enabled: boolean;
  minSupportVersionCode?: number | null;
  storeUrl?: string | null;
  remark?: string | null;
  clientConfig?: AppClientConfig | null;
};

function basesToText(list?: string[] | null) {
  return (list || []).join("\n");
}

function textToBases(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type ExtrasKind = "scalar" | "object" | "list";

type ExtrasNode = {
  key: string;
  /** scalar = leaf; object = {k:v}; list = [v, v, …] 纯值列表 */
  kind: ExtrasKind;
  value?: string;
  children?: ExtrasNode[];
};

function getPathValue(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function parseExtrasScalar(text: string): unknown {
  const trimmed = text.trim();
  if (
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    /^-?\d+(\.\d+)?$/.test(trimmed) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // keep string
    }
  }
  return text;
}

function normalizeExtrasKind(raw: unknown): ExtrasKind {
  if (raw === "object" || raw === "list") return raw;
  return "scalar";
}

function valueToExtrasNode(key: string, value: unknown): ExtrasNode {
  if (Array.isArray(value)) {
    return {
      key,
      kind: "list",
      children: value.map((item, i) => valueToExtrasNode(String(i), item)),
    };
  }
  if (value !== null && typeof value === "object") {
    return {
      key,
      kind: "object",
      children: Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        valueToExtrasNode(k, v),
      ),
    };
  }
  return {
    key,
    kind: "scalar",
    value:
      typeof value === "string"
        ? value
        : value === undefined
          ? ""
          : JSON.stringify(value),
    children: [],
  };
}

function extrasToNodes(extras?: Record<string, unknown> | null): ExtrasNode[] {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return [];
  return Object.entries(extras).map(([key, value]) => valueToExtrasNode(key, value));
}

function nodeToExtrasValue(row: unknown, pathLabel: string): unknown {
  if (!row || typeof row !== "object") return null;
  const kind = normalizeExtrasKind((row as { kind?: unknown }).kind);
  if (kind === "object") {
    return nodesToObject(
      (row as { children?: unknown }).children,
      pathLabel,
    );
  }
  if (kind === "list") {
    return nodesToList((row as { children?: unknown }).children, pathLabel);
  }
  const raw = (row as { value?: unknown }).value;
  return parseExtrasScalar(raw == null ? "" : String(raw));
}

function nodesToObject(
  nodes: unknown,
  pathLabel: string,
): Record<string, unknown> {
  if (!Array.isArray(nodes)) return {};
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const row of nodes) {
    if (!row || typeof row !== "object") continue;
    const key = String((row as { key?: unknown }).key ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      throw new Error(`${pathLabel} 键重复: ${key}`);
    }
    seen.add(key);
    out[key] = nodeToExtrasValue(row, `${pathLabel}.${key}`);
  }
  return out;
}

function nodesToList(nodes: unknown, pathLabel: string): unknown[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((row, i) => nodeToExtrasValue(row, `${pathLabel}[${i}]`));
}

/** Nested editor rows → extras object (root always a map). */
function nodesToExtras(
  nodes: unknown,
  pathLabel = "extras",
): Record<string, unknown> {
  return nodesToObject(nodes, pathLabel);
}

/** Recursive editor: map = 键值对；list = 纯值列表（无需 key）. */
function ExtrasKvEditor({
  name,
  absolutePath,
  mode = "map",
}: {
  name: string | (string | number)[];
  absolutePath: (string | number)[];
  mode?: "map" | "list";
}) {
  const form = Form.useFormInstance();
  const isListMode = mode === "list";

  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div>
          {fields.map((field) => {
            const kindPath = [...absolutePath, field.name, "kind"] as (
              | string
              | number
            )[];
            const siblingsPath = absolutePath;

            return (
              <div key={field.key} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  {isListMode ? (
                    <span
                      style={{
                        lineHeight: "32px",
                        color: "#999",
                        fontSize: 12,
                        width: 28,
                        textAlign: "right",
                      }}
                    >
                      [{field.name}]
                    </span>
                  ) : (
                    <Form.Item
                      name={[field.name, "key"]}
                      rules={[
                        { required: true, message: "键必填" },
                        {
                          validator: async (_, value) => {
                            const key = String(value ?? "").trim();
                            if (!key) return;
                            const siblings =
                              (form.getFieldValue(siblingsPath) as
                                | ExtrasNode[]
                                | undefined) || [];
                            const dup = siblings.some(
                              (p, i) =>
                                i !== field.name &&
                                String(p?.key ?? "").trim() === key,
                            );
                            if (dup) throw new Error("键不能重复");
                          },
                        },
                      ]}
                      style={{ marginBottom: 0, width: 140 }}
                    >
                      <Input placeholder="key" />
                    </Form.Item>
                  )}
                  <Form.Item
                    name={[field.name, "kind"]}
                    initialValue="scalar"
                    style={{ marginBottom: 0, width: 100 }}
                  >
                    <Select
                      options={[
                        { value: "scalar", label: "值" },
                        { value: "object", label: "对象" },
                        { value: "list", label: "列表" },
                      ]}
                      onChange={(v) => {
                        if (v === "object" || v === "list") {
                          const childrenPath = [
                            ...absolutePath,
                            field.name,
                            "children",
                          ];
                          const children = form.getFieldValue(childrenPath);
                          if (!Array.isArray(children)) {
                            form.setFieldValue(childrenPath, []);
                          }
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, next) =>
                      getPathValue(prev, kindPath) !==
                      getPathValue(next, kindPath)
                    }
                  >
                    {() => {
                      const kind = normalizeExtrasKind(
                        form.getFieldValue(kindPath),
                      );
                      if (kind === "object") {
                        return (
                          <span
                            style={{
                              lineHeight: "32px",
                              color: "#999",
                              fontSize: 12,
                            }}
                          >
                            {"{ … }"}
                          </span>
                        );
                      }
                      if (kind === "list") {
                        return (
                          <span
                            style={{
                              lineHeight: "32px",
                              color: "#999",
                              fontSize: 12,
                            }}
                          >
                            {"[ … ]"}
                          </span>
                        );
                      }
                      return (
                        <Form.Item
                          name={[field.name, "value"]}
                          style={{
                            marginBottom: 0,
                            flex: 1,
                            minWidth: 180,
                          }}
                        >
                          <Input
                            placeholder={
                              isListMode ? "value" : "value（可填 JSON）"
                            }
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <MinusCircleOutlined
                    onClick={() => remove(field.name)}
                    style={{ marginTop: 8 }}
                  />
                </div>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, next) =>
                    getPathValue(prev, kindPath) !== getPathValue(next, kindPath)
                  }
                >
                  {() => {
                    const kind = normalizeExtrasKind(
                      form.getFieldValue(kindPath),
                    );
                    if (kind !== "object" && kind !== "list") return null;
                    return (
                      <div
                        style={{
                          marginLeft: 12,
                          marginTop: 8,
                          paddingLeft: 12,
                          borderLeft: "2px solid #e8e8e8",
                        }}
                      >
                        <ExtrasKvEditor
                          name={[field.name, "children"]}
                          absolutePath={[
                            ...absolutePath,
                            field.name,
                            "children",
                          ]}
                          mode={kind === "list" ? "list" : "map"}
                        />
                      </div>
                    );
                  }}
                </Form.Item>
              </div>
            );
          })}
          <Button
            type="dashed"
            onClick={() =>
              add({ key: "", kind: "scalar", value: "", children: [] })
            }
            block
            icon={<PlusOutlined />}
            size="small"
          >
            {isListMode ? "添加项" : "添加键值"}
          </Button>
        </div>
      )}
    </Form.List>
  );
}

/** Live JSON preview + copy / paste-import for extrasNodes (must be under Form). */
function ExtrasJsonPreview() {
  const form = Form.useFormInstance();
  const { message } = App.useApp();
  const nodes = Form.useWatch("extrasNodes");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  let text = "{}";
  let error: string | null = null;
  try {
    text = JSON.stringify(nodesToExtras(nodes ?? []), null, 2);
  } catch (e) {
    error = e instanceof Error ? e.message : "extras 无效";
    text = "{}";
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(text);
      message.success("已复制 extras JSON");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        message.success("已复制 extras JSON");
      } catch {
        message.error("复制失败，请手动选中下方 JSON");
      }
    }
  }

  function openPaste() {
    setPasteText(text);
    setPasteOpen(true);
  }

  function applyPaste() {
    const raw = pasteText.trim();
    if (!raw) {
      form.setFieldsValue({ extrasNodes: [] });
      message.success("已清空 extras");
      setPasteOpen(false);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      message.error("JSON 解析失败，请检查格式");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      message.error("extras 必须是 JSON 对象，例如 { \"key\": \"value\" }");
      return;
    }
    form.setFieldsValue({
      extrasNodes: extrasToNodes(parsed as Record<string, unknown>),
    });
    message.success("已导入到表单（请确认后点确定保存）");
    setPasteOpen(false);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: error ? "#cf1322" : "#666",
          }}
        >
          {error ? `JSON 结果预览（有误：${error}）` : "JSON 结果预览"}
        </span>
        <Space size={8} wrap>
          <Button size="small" onClick={() => void copyJson()} disabled={!!error}>
            复制 JSON
          </Button>
          <Button size="small" type={pasteOpen ? "primary" : "default"} onClick={openPaste}>
            {pasteOpen ? "重新载入当前" : "粘贴 / 编辑 JSON"}
          </Button>
        </Space>
      </div>
      {pasteOpen ? (
        <div>
          <Input.TextArea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
            placeholder='粘贴 extras JSON 对象，例如：\n{\n  "invite_links": ["https://h5.example.com/invite"]\n}'
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" size="small" onClick={applyPaste}>
              应用到表单
            </Button>
            <Button size="small" onClick={() => setPasteOpen(false)}>
              取消
            </Button>
          </Space>
        </div>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: "10px 12px",
            maxHeight: 240,
            overflow: "auto",
            background: error ? "#fff2f0" : "#fafafa",
            border: `1px solid ${error ? "#ffccc7" : "#f0f0f0"}`,
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

type AppRelease = {
  id: string;
  version_name: string;
  version_code: number;
  status: "draft" | "published" | "archived";
  force_update: boolean;
  title_i18n?: Record<string, string>;
  changelog_i18n?: Record<string, string>;
  download_url?: string | null;
  store_url?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  artifact_key?: string | null;
  has_managed_artifact?: boolean;
  published_at?: string | null;
  remark?: string | null;
};

function i18nFromForm(
  values: Record<string, unknown>,
  field: "title" | "changelog",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    const v = values[`${field}_${loc.code}`];
    if (typeof v === "string" && v.trim()) out[loc.code] = v.trim();
  }
  return out;
}

function formFromI18n(release: AppRelease | null) {
  const fields: Record<string, string> = {};
  for (const loc of APP_COPY_LOCALES) {
    fields[`title_${loc.code}`] = release?.title_i18n?.[loc.code] || "";
    fields[`changelog_${loc.code}`] = release?.changelog_i18n?.[loc.code] || "";
  }
  return fields;
}

const CLIENT_OPTS = [
  { value: "ios_appstore", label: "iOS App Store" },
  { value: "ios_alt", label: "iOS 企业签/侧载" },
  { value: "android_play", label: "Android Play" },
  { value: "android_direct", label: "Android 非商店" },
  { value: "h5", label: "H5" },
  { value: "windows", label: "Windows 桌面" },
  { value: "macos", label: "macOS 桌面" },
];

export default function ProjectsPage() {
  const { message } = App.useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState(getProjectId());
  const [createOpen, setCreateOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [form] = Form.useForm();
  const [editProjectForm] = Form.useForm();

  const [sites, setSites] = useState<Site[]>([]);
  const [packages, setPackages] = useState<AppPkg[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [editingPkg, setEditingPkg] = useState<AppPkg | null>(null);
  const [siteForm] = Form.useForm();
  const [pkgForm] = Form.useForm();
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releasePkg, setReleasePkg] = useState<AppPkg | null>(null);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseEditOpen, setReleaseEditOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<AppRelease | null>(null);
  const [releaseArtifactFile, setReleaseArtifactFile] = useState<UploadFile | null>(
    null,
  );
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [releaseForm] = Form.useForm();
  const [pkgPolicyForm] = Form.useForm();

  async function loadReleases(pkg: AppPkg) {
    if (!currentId) return;
    setReleaseLoading(true);
    try {
      const res = await adminFetch<{
        package: AppPkg & {
          minSupportVersionCode?: number | null;
          storeUrl?: string | null;
        };
        releases: AppRelease[];
      }>(`/admin/v1/projects/${currentId}/packages/${pkg.id}/releases`);
      setReleases(res.releases || []);
      pkgPolicyForm.setFieldsValue({
        minSupportVersionCode: res.package.minSupportVersionCode ?? null,
        storeUrl: res.package.storeUrl ?? null,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载版本失败");
    } finally {
      setReleaseLoading(false);
    }
  }

  async function openReleases(pkg: AppPkg) {
    setReleasePkg(pkg);
    setReleaseOpen(true);
    await loadReleases(pkg);
  }

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await adminFetch<{ projects: Project[] }>("/admin/v1/projects");
      setProjects(res.projects || []);
      if (!res.projects?.some((p) => p.id === currentId) && res.projects?.[0]) {
        setCurrentId(res.projects[0].id);
        setProjectId(res.projects[0].id);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(projectId: string) {
    setDetailLoading(true);
    try {
      const [s, p] = await Promise.all([
        adminFetch<{ sites: Site[] }>(`/admin/v1/projects/${projectId}/sites`),
        adminFetch<{ packages: AppPkg[] }>(`/admin/v1/projects/${projectId}/packages`),
      ]);
      setSites(s.sites || []);
      setPackages(p.packages || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载站点/包失败");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (currentId) void loadDetail(currentId);
  }, [currentId]);

  const current = projects.find((p) => p.id === currentId);

  return (
    <PageContainer
      title="项目管理"
      subTitle="多品牌 / 多站点 / 多马甲包。顶部切换「当前项目」后，套餐与用户均按项目隔离。"
      extra={[
        <Button
          key="add"
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建项目
        </Button>,
      ]}
    >
      <Card loading={loading} style={{ marginBottom: 16 }}>
        <Space wrap>
          <span>当前操作项目：</span>
          <Select
            style={{ width: 280 }}
            value={currentId}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.code})${p.enabled ? "" : " · 停用"}`,
            }))}
            onChange={(id) => {
              setCurrentId(id);
              setProjectId(id);
              message.success("已切换项目，后续列表将按此项目过滤");
            }}
          />
          {current ? (
            <>
              <Tag color={current.enabled ? "success" : "default"}>
                {current.enabled ? "启用" : "停用"} · 用户 {current.userCount} · 套餐{" "}
                {current.planCount} · 站点 {current.siteCount} · 包 {current.packageCount}
              </Tag>
              <Button
                size="small"
                onClick={() => {
                  editProjectForm.setFieldsValue({
                    name: current.name,
                    remark: current.remark,
                    enabled: current.enabled,
                  });
                  setEditProjectOpen(true);
                }}
              >
                编辑项目
              </Button>
            </>
          ) : null}
        </Space>
        {current?.remark ? (
          <div style={{ marginTop: 8, color: "rgba(0,0,0,0.45)" }}>备注：{current.remark}</div>
        ) : null}
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: "sites",
              label: "H5 站点",
              children: (
                <>
                  <Button
                    type="primary"
                    size="small"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      setEditingSite(null);
                      siteForm.resetFields();
                      siteForm.setFieldsValue({ enabled: true });
                      setSiteOpen(true);
                    }}
                  >
                    添加站点
                  </Button>
                  <Table
                    rowKey="id"
                    loading={detailLoading}
                    size="small"
                    dataSource={sites}
                    pagination={false}
                    columns={[
                      { title: "名称", dataIndex: "name" },
                      { title: "Host", dataIndex: "host", render: (v) => <code>{v}</code> },
                      {
                        title: "启用",
                        dataIndex: "enabled",
                        width: 80,
                        render: (v) => (v ? <Tag color="success">是</Tag> : <Tag>否</Tag>),
                      },
                      {
                        title: "操作",
                        width: 160,
                        render: (_, row) => (
                          <Space>
                            <a
                              onClick={() => {
                                setEditingSite(row);
                                siteForm.setFieldsValue({
                                  name: row.name,
                                  host: row.host,
                                  enabled: row.enabled,
                                  remark: row.remark,
                                });
                                setSiteOpen(true);
                              }}
                            >
                              编辑
                            </a>
                            <a
                              onClick={async () => {
                                await adminFetch(
                                  `/admin/v1/projects/${currentId}/sites/${row.id}`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ enabled: !row.enabled }),
                                  },
                                );
                                message.success("已更新");
                                void loadDetail(currentId);
                                void loadProjects();
                              }}
                            >
                              {row.enabled ? "停用" : "启用"}
                            </a>
                            <Popconfirm
                              title="删除站点？"
                              description="删除后不可恢复"
                              okText="删除"
                              cancelText="取消"
                              okButtonProps={{ danger: true }}
                              onConfirm={async () => {
                                try {
                                  await adminFetch(
                                    `/admin/v1/projects/${currentId}/sites/${row.id}`,
                                    { method: "DELETE" },
                                  );
                                  message.success("已删除");
                                  void loadDetail(currentId);
                                  void loadProjects();
                                } catch (e) {
                                  message.error(e instanceof Error ? e.message : "删除失败");
                                  throw e;
                                }
                              }}
                            >
                              <a style={{ color: "#cf1322" }}>删除</a>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "packages",
              label: "App 包名 / 马甲",
              children: (
                <>
                  <Button
                    type="primary"
                    size="small"
                    style={{ marginBottom: 12 }}
                    onClick={() => {
                      setEditingPkg(null);
                      pkgForm.resetFields();
                      pkgForm.setFieldsValue({
                        platform: "ios",
                        client: "ios_appstore",
                        enabled: true,
                        isPrimary: false,
                        apiBasesText: "",
                        h5BasesText: "",
                        supportTelegram: "",
                        supportEmail: "",
                        flagIap: true,
                        flagPromo: true,
                        extrasNodes: [],
                      });
                      setPkgOpen(true);
                    }}
                  >
                    添加包
                  </Button>
                  <Table
                    rowKey="id"
                    loading={detailLoading}
                    size="small"
                    dataSource={packages}
                    pagination={false}
                    columns={[
                      {
                        title: "名称",
                        dataIndex: "name",
                        render: (v, r) => (
                          <Space>
                            {v}
                            {r.isPrimary ? <Tag color="blue">主包</Tag> : null}
                          </Space>
                        ),
                      },
                      {
                        title: "包名",
                        dataIndex: "packageName",
                        render: (v) => <code>{v}</code>,
                      },
                      { title: "平台", dataIndex: "platform", width: 90 },
                      {
                        title: "所属端",
                        dataIndex: "client",
                        render: (v) =>
                          CLIENT_OPTS.find((c) => c.value === v)?.label || v,
                      },
                      {
                        title: "启用",
                        dataIndex: "enabled",
                        width: 80,
                        render: (v) => (v ? <Tag color="success">是</Tag> : <Tag>否</Tag>),
                      },
                      {
                        title: "最低版本",
                        dataIndex: "minSupportVersionCode",
                        width: 90,
                        render: (v) => v ?? "—",
                      },
                      {
                        title: "操作",
                        width: 220,
                        render: (_, row) => (
                          <Space wrap>
                            <a onClick={() => void openReleases(row)}>版本</a>
                            <a
                              onClick={() => {
                                setEditingPkg(row);
                                const cfg = row.clientConfig || {};
                                pkgForm.setFieldsValue({
                                  name: row.name,
                                  packageName: row.packageName,
                                  platform: row.platform,
                                  client: row.client,
                                  isPrimary: row.isPrimary,
                                  enabled: row.enabled,
                                  minSupportVersionCode: row.minSupportVersionCode,
                                  storeUrl: row.storeUrl,
                                  remark: row.remark,
                                  apiBasesText: basesToText(cfg.api_bases),
                                  h5BasesText: basesToText(cfg.h5_bases),
                                  supportTelegram: cfg.support?.telegram ?? "",
                                  supportEmail: cfg.support?.email ?? "",
                                  flagIap: cfg.feature_flags?.iap_enabled !== false,
                                  flagPromo: cfg.feature_flags?.promo_enabled !== false,
                                  extrasNodes: extrasToNodes(cfg.extras),
                                });
                                setPkgOpen(true);
                              }}
                            >
                              编辑
                            </a>
                            <a
                              onClick={async () => {
                                await adminFetch(
                                  `/admin/v1/projects/${currentId}/packages/${row.id}`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ enabled: !row.enabled }),
                                  },
                                );
                                message.success("已更新");
                                void loadDetail(currentId);
                                void loadProjects();
                              }}
                            >
                              {row.enabled ? "停用" : "启用"}
                            </a>
                            <Popconfirm
                              title="删除包？"
                              description="将同时删除其版本记录，且不可恢复"
                              okText="删除"
                              cancelText="取消"
                              okButtonProps={{ danger: true }}
                              onConfirm={async () => {
                                try {
                                  await adminFetch(
                                    `/admin/v1/projects/${currentId}/packages/${row.id}`,
                                    { method: "DELETE" },
                                  );
                                  message.success("已删除");
                                  void loadDetail(currentId);
                                  void loadProjects();
                                } catch (e) {
                                  message.error(e instanceof Error ? e.message : "删除失败");
                                  throw e;
                                }
                              }}
                            >
                              <a style={{ color: "#cf1322" }}>删除</a>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建项目"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          const { copy_from_habibi, ...rest } = values as {
            code: string;
            name: string;
            remark?: string;
            copy_from_habibi?: boolean;
          };
          const res = await adminFetch<{
            project: Project & { plans_copied?: number };
          }>("/admin/v1/projects", {
            method: "POST",
            body: JSON.stringify({
              ...rest,
              copyPlansFromProjectId: copy_from_habibi === false ? null : "habibi",
            }),
          });
          const n = res.project?.plans_copied ?? res.project?.planCount ?? 0;
          message.success(n > 0 ? `已创建，并复制 ${n} 个套餐` : "已创建");
          setCreateOpen(false);
          await loadProjects();
          if (res.project) {
            setCurrentId(res.project.id);
            setProjectId(res.project.id);
          }
        }}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ copy_from_habibi: true }}
        >
          <Form.Item
            name="code"
            label="项目 code"
            rules={[{ required: true, message: "如 brand_x" }]}
            extra="小写字母开头，仅字母数字下划线短横"
          >
            <Input placeholder="brand_x" />
          </Form.Item>
          <Form.Item name="name" label="显示名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="copy_from_habibi"
            valuePropName="checked"
            extra="复制套餐与多端目录；不含 App Store / Play 商品 ID。同时自动种子金/银/铜分销组。"
          >
            <Checkbox>从 habibi 复制套餐目录</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑项目"
        open={editProjectOpen}
        onCancel={() => setEditProjectOpen(false)}
        onOk={async () => {
          const values = await editProjectForm.validateFields();
          await adminFetch(`/admin/v1/projects/${currentId}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: values.name,
              remark: values.remark ?? null,
              enabled: values.enabled,
            }),
          });
          message.success("项目已更新");
          setEditProjectOpen(false);
          await loadProjects();
        }}
        destroyOnClose
      >
        <Form form={editProjectForm} layout="vertical">
          <Form.Item label="项目 code">
            <Input value={current?.code} disabled />
          </Form.Item>
          <Form.Item name="name" label="显示名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="enabled"
            label="启用"
            valuePropName="checked"
            extra={
              currentId === "habibi" ? "默认项目 habibi 不可停用" : undefined
            }
          >
            <Switch disabled={currentId === "habibi"} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingSite ? "编辑 H5 站点" : "添加 H5 站点"}
        open={siteOpen}
        onCancel={() => {
          setSiteOpen(false);
          setEditingSite(null);
        }}
        onOk={async () => {
          const values = await siteForm.validateFields();
          if (editingSite) {
            await adminFetch(
              `/admin/v1/projects/${currentId}/sites/${editingSite.id}`,
              {
                method: "PATCH",
                body: JSON.stringify(values),
              },
            );
            message.success("已更新");
          } else {
            await adminFetch(`/admin/v1/projects/${currentId}/sites`, {
              method: "POST",
              body: JSON.stringify(values),
            });
            message.success("已添加");
          }
          setSiteOpen(false);
          setEditingSite(null);
          void loadDetail(currentId);
          void loadProjects();
        }}
        destroyOnClose
      >
        <Form form={siteForm} layout="vertical" initialValues={{ enabled: true }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="host"
            label="Host"
            rules={[{ required: true }]}
            extra="不含协议与端口，如 www.example.com"
          >
            <Input placeholder="www.example.com" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingPkg ? "编辑 App 包" : "添加 App 包"}
        open={pkgOpen}
        onCancel={() => {
          setPkgOpen(false);
          setEditingPkg(null);
        }}
        onOk={async () => {
          const values = await pkgForm.validateFields();
          let extras: Record<string, unknown> = {};
          try {
            extras = nodesToExtras(values.extrasNodes);
          } catch (e) {
            message.error(e instanceof Error ? e.message : "extras 无效");
            return;
          }
          const body = {
            name: values.name,
            packageName: values.packageName,
            platform: values.platform,
            client: values.client,
            isPrimary: values.isPrimary,
            enabled: values.enabled,
            minSupportVersionCode:
              values.minSupportVersionCode === "" ||
              values.minSupportVersionCode == null
                ? null
                : Number(values.minSupportVersionCode),
            storeUrl: values.storeUrl?.trim() || null,
            remark: values.remark ?? null,
            clientConfig: {
              api_bases: textToBases(values.apiBasesText),
              h5_bases: textToBases(values.h5BasesText),
              support: {
                telegram: values.supportTelegram?.trim() || null,
                email: values.supportEmail?.trim() || null,
              },
              feature_flags: {
                iap_enabled: values.flagIap !== false,
                promo_enabled: values.flagPromo !== false,
              },
              extras,
            },
          };
          if (editingPkg) {
            await adminFetch(
              `/admin/v1/projects/${currentId}/packages/${editingPkg.id}`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
              },
            );
            message.success("已更新");
          } else {
            await adminFetch(`/admin/v1/projects/${currentId}/packages`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            message.success("已添加");
          }
          setPkgOpen(false);
          setEditingPkg(null);
          void loadDetail(currentId);
          void loadProjects();
        }}
        destroyOnClose
        width={720}
      >
        <Form
          form={pkgForm}
          layout="vertical"
          initialValues={{
            flagIap: true,
            flagPromo: true,
            extrasNodes: [],
          }}
        >
          <Form.Item name="name" label="显示名" rules={[{ required: true }]}>
            <Input placeholder="主包 / 马甲A" />
          </Form.Item>
          <Form.Item
            name="packageName"
            label="包名"
            rules={[{ required: true }]}
            extra="iOS/macOS bundleId、Android applicationId、Windows PE InternalName；各端可用同一包名（TiTiVPN 为 com.titivpn）"
          >
            <Input placeholder="com.titivpn" />
          </Form.Item>
          <Form.Item name="platform" label="平台" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "ios", label: "iOS" },
                { value: "android", label: "Android" },
                { value: "windows", label: "Windows" },
                { value: "macos", label: "macOS" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="client"
            label="所属端"
            rules={[{ required: true }]}
            extra="须与客户端 x-habibi-client 一致：Windows→windows，macOS→macos"
          >
            <Select options={CLIENT_OPTS} />
          </Form.Item>
          <Form.Item name="isPrimary" label="主包" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="minSupportVersionCode"
            label="最低支持 versionCode"
            extra="客户端低于此值强制更新；留空表示不设包级底线"
          >
            <InputNumber min={0} style={{ width: "100%" }} placeholder="如 100" />
          </Form.Item>
          <Form.Item
            name="storeUrl"
            label="默认商店链接"
            extra="App Store / Play 地址；版本未单独填 store 时用此值"
          >
            <Input placeholder="https://apps.apple.com/..." />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="apiBasesText"
            label="API 域名列表"
            extra="每行一个 https://…；客户端按序探测，用于防封切换"
          >
            <Input.TextArea rows={3} placeholder={"https://api1.example.com\nhttps://api2.example.com"} />
          </Form.Item>
          <Form.Item
            name="h5BasesText"
            label="H5 域名列表"
            extra="每行一个；可选"
          >
            <Input.TextArea rows={2} placeholder="https://h5.example.com" />
          </Form.Item>
          <Form.Item name="supportTelegram" label="客服 Telegram">
            <Input placeholder="https://t.me/..." />
          </Form.Item>
          <Form.Item name="supportEmail" label="客服邮箱">
            <Input placeholder="support@example.com" />
          </Form.Item>
          <Form.Item name="flagIap" label="启用 IAP" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="flagPromo" label="启用推广" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="扩展配置 (extras)"
            extra="类型：值 / 对象 / 列表。可复制 JSON，或在下方粘贴整段 JSON 导入（跨项目迁移不用逐项手填）。旧版 App 忽略未知键。"
          >
            <ExtrasKvEditor name="extrasNodes" absolutePath={["extrasNodes"]} />
            <ExtrasJsonPreview />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={releasePkg ? `版本管理 · ${releasePkg.name}` : "版本管理"}
        open={releaseOpen}
        onCancel={() => {
          setReleaseOpen(false);
          setReleasePkg(null);
          setReleases([]);
        }}
        footer={null}
        width={900}
        destroyOnClose
      >
        {releasePkg ? (
          <>
            <Form
              form={pkgPolicyForm}
              layout="inline"
              style={{ marginBottom: 16 }}
              onFinish={async (values) => {
                await adminFetch(
                  `/admin/v1/projects/${currentId}/packages/${releasePkg.id}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({
                      minSupportVersionCode:
                        values.minSupportVersionCode === "" ||
                        values.minSupportVersionCode == null
                          ? null
                          : Number(values.minSupportVersionCode),
                      storeUrl: values.storeUrl?.trim() || null,
                    }),
                  },
                );
                message.success("包策略已保存");
                void loadDetail(currentId);
                void loadReleases(releasePkg);
              }}
            >
              <Form.Item name="minSupportVersionCode" label="最低 versionCode">
                <InputNumber min={0} placeholder="可选" />
              </Form.Item>
              <Form.Item name="storeUrl" label="商店链接">
                <Input style={{ width: 280 }} placeholder="https://..." />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  保存策略
                </Button>
              </Form.Item>
            </Form>
            <div style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingRelease(null);
                          setReleaseArtifactFile(null);
                          releaseForm.resetFields();
                          releaseForm.setFieldsValue({
                            status: "draft",
                            forceUpdate: false,
                            replacePublished: false,
                            ...formFromI18n(null),
                          });
                          setReleaseEditOpen(true);
                        }}
              >
                新建版本
              </Button>
              <span style={{ marginLeft: 12, color: "rgba(0,0,0,0.45)", fontSize: 12 }}>
                允许多条 published；客户端 latest = 最大 versionCode
              </span>
            </div>
            <Table
              rowKey="id"
              loading={releaseLoading}
              size="small"
              dataSource={releases}
              pagination={false}
              columns={[
                {
                  title: "版本",
                  render: (_, r) => (
                    <Space>
                      <strong>{r.version_name}</strong>
                      <Tag>({r.version_code})</Tag>
                    </Space>
                  ),
                },
                {
                  title: "标题",
                  width: 160,
                  ellipsis: true,
                  render: (_, r) =>
                    r.title_i18n?.zh || r.title_i18n?.en || "—",
                },
                {
                  title: "状态",
                  dataIndex: "status",
                  width: 100,
                  render: (v: AppRelease["status"]) => {
                    const color =
                      v === "published" ? "success" : v === "archived" ? "default" : "processing";
                    return <Tag color={color}>{v}</Tag>;
                  },
                },
                {
                  title: "强制",
                  dataIndex: "force_update",
                  width: 70,
                  render: (v) => (v ? <Tag color="red">是</Tag> : "—"),
                },
                {
                  title: "安装包",
                  width: 120,
                  render: (_, r) =>
                    r.has_managed_artifact || r.file_size != null
                      ? formatBytes(r.file_size)
                      : r.download_url
                        ? "外链"
                        : "—",
                },
                {
                  title: "发布时间",
                  dataIndex: "published_at",
                  width: 170,
                  render: (v) => (v ? new Date(v).toLocaleString() : "—"),
                },
                {
                  title: "操作",
                  width: 280,
                  render: (_, row) => (
                    <Space wrap>
                      <a
                        onClick={() => {
                          setEditingRelease(row);
                          setReleaseArtifactFile(null);
                          releaseForm.setFieldsValue({
                            versionName: row.version_name,
                            versionCode: row.version_code,
                            status: row.status,
                            forceUpdate: row.force_update,
                            ...formFromI18n(row),
                            downloadUrl: row.download_url,
                            storeUrl: row.store_url,
                            remark: row.remark,
                            replacePublished: false,
                          });
                          setReleaseEditOpen(true);
                        }}
                      >
                        编辑
                      </a>
                      {row.has_managed_artifact ? (
                        <Popconfirm
                          title="删除桶内安装包？"
                          description={
                            row.status === "published"
                              ? "已发布版本：客户端可能仍在用此链接"
                              : "将清空 downloadUrl / 大小 / checksum"
                          }
                          okText="删除安装包"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={async () => {
                            try {
                              await adminFetch(
                                `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/${row.id}/artifact`,
                                { method: "DELETE" },
                              );
                              message.success("安装包已删除");
                              void loadReleases(releasePkg);
                            } catch (e) {
                              message.error(
                                e instanceof Error ? e.message : "删除失败",
                              );
                              throw e;
                            }
                          }}
                        >
                          <a style={{ color: "#d48806" }}>删包</a>
                        </Popconfirm>
                      ) : null}
                      {row.status !== "published" ? (
                        <a
                          onClick={async () => {
                            await adminFetch(
                              `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/${row.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ status: "published" }),
                              },
                            );
                            message.success("已发布");
                            void loadReleases(releasePkg);
                          }}
                        >
                          发布
                        </a>
                      ) : (
                        <a
                          onClick={async () => {
                            await adminFetch(
                              `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/${row.id}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ status: "archived" }),
                              },
                            );
                            message.success("已归档");
                            void loadReleases(releasePkg);
                          }}
                        >
                          归档
                        </a>
                      )}
                      <Popconfirm
                        title="删除该版本？"
                        description="若有系统上传的安装包会一并删桶"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        getPopupContainer={(node) =>
                          node.parentElement || document.body
                        }
                        onConfirm={async () => {
                          try {
                            await adminFetch(
                              `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/${row.id}`,
                              { method: "DELETE" },
                            );
                            message.success("已删除");
                            void loadReleases(releasePkg);
                          } catch (e) {
                            message.error(e instanceof Error ? e.message : "删除失败");
                            throw e;
                          }
                        }}
                      >
                        <a style={{ color: "#cf1322" }}>删除</a>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </>
        ) : null}
      </Modal>

      <Modal
        title={editingRelease ? "编辑版本" : "新建版本"}
        open={releaseEditOpen}
        confirmLoading={releaseSaving}
        onCancel={() => {
          setReleaseEditOpen(false);
          setEditingRelease(null);
          setReleaseArtifactFile(null);
        }}
        onOk={async () => {
          if (!releasePkg || !currentId) return;
          const values = await releaseForm.validateFields();
          setReleaseSaving(true);
          try {
            const rawFile = releaseArtifactFile?.originFileObj as
              | File
              | undefined;
            if (rawFile) {
              const fd = new FormData();
              fd.append("file", rawFile, rawFile.name);
              fd.append("versionName", String(values.versionName));
              fd.append("versionCode", String(Number(values.versionCode)));
              fd.append("status", String(values.status));
              fd.append("forceUpdate", values.forceUpdate ? "true" : "false");
              fd.append(
                "title_i18n",
                JSON.stringify(i18nFromForm(values, "title")),
              );
              fd.append(
                "changelog_i18n",
                JSON.stringify(i18nFromForm(values, "changelog")),
              );
              if (values.storeUrl?.trim()) {
                fd.append("storeUrl", values.storeUrl.trim());
              }
              if (values.remark) fd.append("remark", values.remark);
              if (values.replacePublished) fd.append("replace", "true");
              await adminFetch(
                `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/upload`,
                { method: "POST", body: fd },
              );
              message.success(
                editingRelease ? "已更新并上传安装包" : "已创建并上传安装包",
              );
            } else {
              const body = {
                versionName: values.versionName,
                versionCode: Number(values.versionCode),
                status: values.status,
                forceUpdate: !!values.forceUpdate,
                title_i18n: i18nFromForm(values, "title"),
                changelog_i18n: i18nFromForm(values, "changelog"),
                downloadUrl: values.downloadUrl?.trim() || null,
                storeUrl: values.storeUrl?.trim() || null,
                remark: values.remark || null,
              };
              if (editingRelease) {
                await adminFetch(
                  `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases/${editingRelease.id}`,
                  { method: "PATCH", body: JSON.stringify(body) },
                );
                message.success("已更新");
              } else {
                await adminFetch(
                  `/admin/v1/projects/${currentId}/packages/${releasePkg.id}/releases`,
                  { method: "POST", body: JSON.stringify(body) },
                );
                message.success("已创建");
              }
            }
            setReleaseEditOpen(false);
            setEditingRelease(null);
            setReleaseArtifactFile(null);
            void loadReleases(releasePkg);
          } catch (e) {
            message.error(e instanceof Error ? e.message : "保存失败");
          } finally {
            setReleaseSaving(false);
          }
        }}
        destroyOnClose
        width={640}
      >
        <Form form={releaseForm} layout="vertical">
          <Form.Item name="versionName" label="versionName" rules={[{ required: true }]}>
            <Input placeholder="1.2.0" />
          </Form.Item>
          <Form.Item
            name="versionCode"
            label="versionCode"
            rules={[{ required: true }]}
            extra="整数，越大越新；同包唯一。上传安装包时按此版本号 upsert"
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "draft", label: "draft" },
                { value: "published", label: "published" },
                { value: "archived", label: "archived" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="forceUpdate"
            label="单版本强制更新"
            valuePropName="checked"
            extra="当该版本是 latest 时，低于它的客户端强制更新（包级最低版本优先）"
          >
            <Switch />
          </Form.Item>
          <div style={{ marginBottom: 8, color: "rgba(0,0,0,0.45)", fontSize: 12 }}>
            更新文案（按语言填写；客户端按 locale 选取，缺省回退 en → zh）
          </div>
          <Tabs
            size="small"
            style={{ marginBottom: 16 }}
            items={APP_COPY_LOCALES.map((loc) => ({
              key: loc.code,
              label: loc.label,
              forceRender: true,
              children: (
                <>
                  <Form.Item
                    name={`title_${loc.code}`}
                    label="更新标题"
                    style={{ marginBottom: 12 }}
                  >
                    <Input
                      placeholder={loc.code === "zh" ? "发现新版本" : "What's New"}
                    />
                  </Form.Item>
                  <Form.Item
                    name={`changelog_${loc.code}`}
                    label="更新说明"
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea
                      rows={4}
                      placeholder={
                        loc.code === "zh"
                          ? "- 修复连接问题\n- 优化启动速度"
                          : "- Bug fixes\n- Performance improvements"
                      }
                    />
                  </Form.Item>
                </>
              ),
            }))}
          />
          <Form.Item
            label="上传安装包"
            extra="上传到 App 分发绑定的 S3（可多桶镜像）。路径：{Key Prefix}{项目}/{包}/{平台}/{版本}-{code}/{文件名}，Prefix 建议 download/。自动写直链、大小、sha256。"
          >
            <Upload.Dragger
              maxCount={1}
              multiple={false}
              accept=".apk,.ipa,.exe,.msi,.dmg,.pkg,.zip,.msix,.appx,.AppImage"
              beforeUpload={(file) => {
                setReleaseArtifactFile({
                  uid: file.uid,
                  name: file.name,
                  status: "done",
                  size: file.size,
                  originFileObj: file,
                } as UploadFile);
                return false;
              }}
              onRemove={() => {
                setReleaseArtifactFile(null);
              }}
              fileList={releaseArtifactFile ? [releaseArtifactFile] : []}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽安装包到此区域</p>
              <p className="ant-upload-hint">
                支持 apk / ipa / exe / dmg / zip 等；单文件，最大约 512MB
              </p>
            </Upload.Dragger>
            {editingRelease?.has_managed_artifact ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                当前：{formatBytes(editingRelease.file_size)}
                {editingRelease.checksum
                  ? ` · ${editingRelease.checksum.slice(0, 20)}…`
                  : ""}
                {editingRelease.artifact_key
                  ? ` · ${editingRelease.artifact_key}`
                  : ""}
              </Typography.Paragraph>
            ) : null}
          </Form.Item>
          {editingRelease?.status === "published" ? (
            <Form.Item
              name="replacePublished"
              label="覆盖已发布安装包"
              valuePropName="checked"
              extra="已发布版本重传安装包时必须勾选"
            >
              <Switch />
            </Form.Item>
          ) : null}
          <Form.Item
            name="downloadUrl"
            label="直链下载"
            extra="也可手填外链；若上方上传了安装包则以上传结果为准"
          >
            <Input placeholder="https://cdn.example.com/app.apk" />
          </Form.Item>
          <Form.Item name="storeUrl" label="本版本商店链接（可选）">
            <Input placeholder="覆盖包默认商店链接" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
