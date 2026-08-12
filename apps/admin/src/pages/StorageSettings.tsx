import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { message } from "../lib/antd-message";
import {
  CloudUploadOutlined,
  ExperimentOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { ApiError, adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: unknown; error?: unknown } | null;
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
    if (typeof body?.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
    if (e.message.trim()) return e.message.trim();
  }
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

type StorageS3Profile = {
  id: string;
  name: string;
  enabled: boolean;
  remark: string | null;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  keyPrefix: string | null;
  secret_set: boolean;
};

type StorageS3Bindings = {
  support?: string | null;
  /** Multi-select fan-out targets. */
  app_dist?: string[] | string | null;
  /** Multi-select fan-out targets. */
  config?: string[] | string | null;
};

function asIdList(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((id): id is string => typeof id === "string" && !!id.trim());
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

type StorageS3Response = {
  project_id: string;
  key: string;
  roles: string[];
  profiles: StorageS3Profile[];
  bindings: StorageS3Bindings;
};

type StorageS3ProbeStep = {
  step: "upload" | "head" | "public_get" | "delete";
  ok: boolean;
  ms: number;
  detail?: string | null;
};

type StorageS3ProbeResult = {
  ok: boolean;
  profile_id: string;
  profile_name: string;
  bucket: string;
  key: string;
  public_url: string;
  steps: StorageS3ProbeStep[];
  error?: string | null;
};

const PROBE_STEP_LABEL: Record<StorageS3ProbeStep["step"], string> = {
  upload: "上传",
  head: "Head 校验",
  public_get: "公网读取",
  delete: "删除",
};

const ROLE_META: Record<
  string,
  { label: string; hint: string }
> = {
  support: {
    label: "客服媒体",
    hint: "工单/Telegram 图片等；建议该桶 Key Prefix 填 support/；未绑定则落本地磁盘",
  },
  app_dist: {
    label: "App 分发",
    hint: "可多选镜像；建议 Key Prefix 填 download/（路径：download/{项目}/{包}/{平台}/{版本}/文件）",
  },
  config: {
    label: "配置下发",
    hint: "可多选镜像；建议 Key Prefix 填 config/",
  },
};

export default function StorageSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [profiles, setProfiles] = useState<StorageS3Profile[]>([]);
  const [bindings, setBindings] = useState<StorageS3Bindings>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StorageS3Profile | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [probeOpen, setProbeOpen] = useState(false);
  const [probeTarget, setProbeTarget] = useState<StorageS3Profile | null>(null);
  const [probeResult, setProbeResult] = useState<StorageS3ProbeResult | null>(
    null,
  );
  const [form] = Form.useForm();
  const [bindForm] = Form.useForm();

  const profileOptions = useMemo(
    () =>
      profiles.map((p) => ({
        value: p.id,
        label: `${p.name}${p.enabled ? "" : "（已停用）"}`,
        disabled: !p.enabled,
      })),
    [profiles],
  );

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await adminFetch<StorageS3Response>(
        "/admin/v1/settings/storage/s3",
      );
      setProfiles(cfg.profiles || []);
      setBindings(cfg.bindings || {});
      bindForm.setFieldsValue({
        support: cfg.bindings?.support ?? null,
        app_dist: asIdList(cfg.bindings?.app_dist),
        config: asIdList(cfg.bindings?.config),
      });
    } catch (e) {
      message.error(errorText(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [bindForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      enabled: true,
      region: "ap-southeast-1",
      forcePathStyle: false,
      keyPrefix: "download/",
      secretAccessKey: "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: StorageS3Profile) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      enabled: row.enabled,
      region: row.region || "ap-southeast-1",
      bucket: row.bucket || "",
      accessKeyId: row.accessKeyId || "",
      secretAccessKey: row.secretAccessKey || "",
      publicBaseUrl: row.publicBaseUrl || "",
      endpoint: row.endpoint || "",
      forcePathStyle: !!row.forcePathStyle,
      keyPrefix: row.keyPrefix || "download/",
      remark: row.remark || "",
    });
    setModalOpen(true);
  };

  const applyResponse = (cfg: StorageS3Response) => {
    setProfiles(cfg.profiles || []);
    setBindings(cfg.bindings || {});
    bindForm.setFieldsValue({
      support: cfg.bindings?.support ?? null,
      app_dist: asIdList(cfg.bindings?.app_dist),
      config: asIdList(cfg.bindings?.config),
    });
  };

  const onSaveProfile = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const body = {
        name: values.name.trim(),
        enabled: !!values.enabled,
        region: values.region,
        bucket: values.bucket,
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey || undefined,
        publicBaseUrl: values.publicBaseUrl,
        endpoint: values.endpoint?.trim() ? values.endpoint.trim() : null,
        forcePathStyle: !!values.forcePathStyle,
        keyPrefix: values.keyPrefix?.trim() || null,
        remark: values.remark?.trim() ? values.remark.trim() : null,
      };
      const cfg = editing
        ? await adminFetch<StorageS3Response>(
            `/admin/v1/settings/storage/s3/profiles/${encodeURIComponent(editing.id)}`,
            { method: "PUT", body: JSON.stringify(body) },
          )
        : await adminFetch<StorageS3Response>(
            "/admin/v1/settings/storage/s3/profiles",
            { method: "POST", body: JSON.stringify(body) },
          );
      applyResponse(cfg);
      message.success(editing ? "已更新" : "已创建");
      setModalOpen(false);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(errorText(e, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: StorageS3Profile) => {
    try {
      const cfg = await adminFetch<StorageS3Response>(
        `/admin/v1/settings/storage/s3/profiles/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      applyResponse(cfg);
      message.success("已删除");
    } catch (e) {
      message.error(errorText(e, "删除失败"));
    }
  };

  const onProbe = async (row: StorageS3Profile) => {
    setProbeTarget(row);
    setProbeResult(null);
    setProbeOpen(true);
    setTestingId(row.id);
    try {
      const result = await adminFetch<StorageS3ProbeResult>(
        `/admin/v1/settings/storage/s3/profiles/${encodeURIComponent(row.id)}/test`,
        {
          method: "POST",
          body: JSON.stringify({ checkPublic: true }),
        },
      );
      setProbeResult(result);
      const coreOk = result.steps
        .filter((s) => s.step === "upload" || s.step === "delete")
        .every((s) => s.ok);
      if (result.ok) {
        message.success(`「${row.name}」上传/删除测试通过`);
      } else if (coreOk) {
        message.warning(
          `「${row.name}」上传/删除成功，但有步骤失败：${result.error || "见详情"}`,
        );
      } else {
        message.error(result.error || "测试未通过");
      }
    } catch (e) {
      setProbeResult({
        ok: false,
        profile_id: row.id,
        profile_name: row.name,
        bucket: row.bucket,
        key: "",
        public_url: "",
        steps: [],
        error: errorText(e, "测试失败"),
      });
      message.error(errorText(e, "测试失败"));
    } finally {
      setTestingId(null);
    }
  };

  const onSaveBindings = async () => {
    try {
      const values = await bindForm.validateFields();
      setBindingSaving(true);
      const cfg = await adminFetch<StorageS3Response>(
        "/admin/v1/settings/storage/s3/bindings",
        {
          method: "PUT",
          body: JSON.stringify({
            support: values.support || null,
            app_dist: Array.isArray(values.app_dist) ? values.app_dist : [],
            config: Array.isArray(values.config) ? values.config : [],
          }),
        },
      );
      applyResponse(cfg);
      message.success("用途绑定已保存");
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(errorText(e, "保存绑定失败"));
    } finally {
      setBindingSaving(false);
    }
  };

  const boundName = (id: string | null | undefined) => {
    if (!id) return null;
    return profiles.find((p) => p.id === id)?.name || id;
  };

  const boundListLabel = (raw: string[] | string | null | undefined) => {
    const ids = asIdList(raw);
    if (!ids.length) return "未绑定";
    return ids.map((id) => boundName(id) || id).join("、");
  };

  return (
    <PageContainer
      title="对象存储 S3"
      subTitle="可配置多个桶，用名称区分厂家与用途；模块按用途绑定"
      extra={
        <Space>
          <Button icon={<CloudUploadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增 S3
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="兼容 AWS S3 / Cloudflare R2 / MinIO / 腾讯云 COS / 阿里云 OSS（S3 兼容）"
        description="按用途建不同 profile（可同桶、不同 Key Prefix）：客服 → support/，安装包 → download/，配置 → config/。名称便于识别厂家与用途；Public Base URL 需公网可访问。"
      />

      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card title="S3 配置列表" size="small" loading={loading}>
          <Table<StorageS3Profile>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={profiles}
            locale={{ emptyText: "暂无 S3 配置，请点击右上角新增" }}
            columns={[
              {
                title: "名称",
                dataIndex: "name",
                render: (v, row) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{v}</Typography.Text>
                    {row.remark ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {row.remark}
                      </Typography.Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: "状态",
                dataIndex: "enabled",
                width: 90,
                render: (v) =>
                  v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
              },
              {
                title: "Bucket",
                dataIndex: "bucket",
                ellipsis: true,
              },
              {
                title: "Region",
                dataIndex: "region",
                width: 140,
                ellipsis: true,
              },
              {
                title: "Public Base URL",
                dataIndex: "publicBaseUrl",
                ellipsis: true,
                render: (v) => (
                  <Typography.Text copyable={{ text: v }} style={{ maxWidth: 280 }}>
                    {v}
                  </Typography.Text>
                ),
              },
              {
                title: "用途",
                width: 160,
                render: (_, row) => {
                  const roles: string[] = [];
                  if (bindings.support === row.id) roles.push("客服");
                  if (asIdList(bindings.app_dist).includes(row.id)) {
                    roles.push("分发");
                  }
                  if (asIdList(bindings.config).includes(row.id)) {
                    roles.push("配置");
                  }
                  return roles.length ? (
                    <Space size={4} wrap>
                      {roles.map((r) => (
                        <Tag key={r} color="blue">
                          {r}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  );
                },
              },
              {
                title: "操作",
                width: 220,
                render: (_, row) => (
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<ExperimentOutlined />}
                      loading={testingId === row.id}
                      disabled={!row.secret_set}
                      onClick={() => void onProbe(row)}
                    >
                      测试
                    </Button>
                    <Button type="link" size="small" onClick={() => openEdit(row)}>
                      编辑
                    </Button>
                    <Popconfirm
                      title={`删除「${row.name}」？`}
                      description="绑定该桶的用途会清空"
                      onConfirm={() => void onDelete(row)}
                    >
                      <Button type="link" size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>

        <Card
          title="用途绑定"
          size="small"
          loading={loading}
          extra={
            <Typography.Text type="secondary">
              当前：客服 {boundName(bindings.support) || "本地"} · 分发{" "}
              {boundListLabel(bindings.app_dist)} · 配置{" "}
              {boundListLabel(bindings.config)}
            </Typography.Text>
          }
        >
          <Form form={bindForm} layout="vertical" style={{ maxWidth: 640 }}>
            <Form.Item
              name="support"
              label={ROLE_META.support.label}
              extra={ROLE_META.support.hint}
            >
              <Select
                allowClear
                placeholder="不绑定（用本地磁盘）"
                options={profileOptions}
              />
            </Form.Item>
            <Form.Item
              name="app_dist"
              label={ROLE_META.app_dist.label}
              extra={ROLE_META.app_dist.hint}
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="可多选多个桶"
                options={profileOptions}
              />
            </Form.Item>
            <Form.Item
              name="config"
              label={ROLE_META.config.label}
              extra={ROLE_META.config.hint}
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="可多选多个桶"
                options={profileOptions}
              />
            </Form.Item>
            <Button
              type="primary"
              loading={bindingSaving}
              onClick={() => void onSaveBindings()}
            >
              保存绑定
            </Button>
          </Form>
        </Card>
      </Space>

      <Modal
        title={
          probeTarget
            ? `S3 测试 · ${probeTarget.name}`
            : "S3 上传/删除测试"
        }
        open={probeOpen}
        onCancel={() => setProbeOpen(false)}
        footer={[
          <Button key="close" onClick={() => setProbeOpen(false)}>
            关闭
          </Button>,
          probeTarget ? (
            <Button
              key="retry"
              type="primary"
              icon={<ExperimentOutlined />}
              loading={testingId === probeTarget.id}
              onClick={() => void onProbe(probeTarget)}
            >
              重新测试
            </Button>
          ) : null,
        ]}
        width={640}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="依次执行：上传小文件 → Head 校验 → 公网 URL 读取 → 删除对象"
          description="公网读取失败时，可能是桶未公开 / CDN 未同步，但上传与删除已能验证密钥与权限。"
        />
        {testingId && !probeResult ? (
          <Typography.Text type="secondary">测试进行中…</Typography.Text>
        ) : null}
        {probeResult ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Alert
              type={probeResult.ok ? "success" : "warning"}
              showIcon
              message={
                probeResult.ok
                  ? "全部步骤通过"
                  : probeResult.error || "部分步骤失败"
              }
            />
            <div>
              <Typography.Text type="secondary">Bucket：</Typography.Text>{" "}
              {probeResult.bucket}
            </div>
            {probeResult.key ? (
              <div>
                <Typography.Text type="secondary">Key：</Typography.Text>{" "}
                <Typography.Text copyable>{probeResult.key}</Typography.Text>
              </div>
            ) : null}
            {probeResult.public_url ? (
              <div>
                <Typography.Text type="secondary">Public URL：</Typography.Text>{" "}
                <Typography.Text copyable style={{ wordBreak: "break-all" }}>
                  {probeResult.public_url}
                </Typography.Text>
              </div>
            ) : null}
            <Table<StorageS3ProbeStep>
              rowKey="step"
              size="small"
              pagination={false}
              dataSource={probeResult.steps}
              columns={[
                {
                  title: "步骤",
                  dataIndex: "step",
                  width: 110,
                  render: (v: StorageS3ProbeStep["step"]) =>
                    PROBE_STEP_LABEL[v] || v,
                },
                {
                  title: "结果",
                  dataIndex: "ok",
                  width: 90,
                  render: (ok: boolean) =>
                    ok ? (
                      <Tag color="success">成功</Tag>
                    ) : (
                      <Tag color="error">失败</Tag>
                    ),
                },
                {
                  title: "耗时",
                  dataIndex: "ms",
                  width: 80,
                  render: (ms: number) => `${ms}ms`,
                },
                {
                  title: "详情",
                  dataIndex: "detail",
                  ellipsis: true,
                  render: (v) => v || "—",
                },
              ]}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={editing ? `编辑 S3 · ${editing.name}` : "新增 S3"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void onSaveProfile()}
        confirmLoading={saving}
        width={640}
        destroyOnClose
        okText="保存"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "必填" }]}
            extra="用于识别厂家与用途，如「腾讯云-国内配置」「R2-App 分发」"
          >
            <Input maxLength={64} placeholder="阿里云-国内配置" />
          </Form.Item>
          <Form.Item
            name="enabled"
            label="启用"
            valuePropName="checked"
            extra="停用后，绑定到该桶的用途不会再上传到此桶"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="region"
            label="Region"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input placeholder="ap-southeast-1" />
          </Form.Item>
          <Form.Item
            name="bucket"
            label="Bucket"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input placeholder="habibi-support" />
          </Form.Item>
          <Form.Item
            name="accessKeyId"
            label="Access Key ID"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="secretAccessKey"
            label="Secret Access Key"
            rules={[{ required: true, message: "必填" }]}
            extra="明文显示便于复制；保存时原样写入"
          >
            <Input.TextArea
              autoComplete="off"
              rows={2}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          </Form.Item>
          <Form.Item
            name="publicBaseUrl"
            label="Public Base URL"
            rules={[
              { required: true, message: "必填" },
              { type: "url", message: "需为合法 URL" },
            ]}
            extra="例如 https://cdn.example.com 或备案域名"
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            name="endpoint"
            label="自定义 Endpoint（可选）"
            extra="R2 / MinIO / COS / OSS S3 兼容地址；AWS 官方可留空"
          >
            <Input placeholder="https://xxxx.r2.cloudflarestorage.com" />
          </Form.Item>
          <Form.Item
            name="forcePathStyle"
            label="Force Path Style"
            valuePropName="checked"
            extra="MinIO / 部分兼容实现需要开启"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="keyPrefix"
            label="Key Prefix"
            extra="按用途区分目录：客服 support/ · 安装包 download/ · 配置 config/。同一桶可建多条 profile、不同前缀。可点选或手改。"
            rules={[{ required: true, message: "请填写前缀" }]}
            getValueFromEvent={(v: string) => {
              const s = (v || "").trim();
              if (!s) return s;
              return s.endsWith("/") ? s : `${s}/`;
            }}
          >
            <AutoComplete
              placeholder="download/"
              options={[
                { value: "support/", label: "support/（客服媒体）" },
                { value: "download/", label: "download/（App 安装包）" },
                { value: "config/", label: "config/（配置下发）" },
              ]}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
