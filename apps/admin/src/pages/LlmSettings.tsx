import { useCallback, useEffect, useState } from "react";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { adminFetch } from "../lib/api";
import { getAdmin } from "../lib/auth";
import { message } from "../lib/antd-message";

type LlmProfile = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  remark: string | null;
  hasApiKey: boolean;
  apiKey?: string;
};

type ProfilesResponse = {
  profiles: LlmProfile[];
  defaultProfileId: string | null;
};

type ProfileForm = {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
  remark?: string;
};

export default function LlmSettingsPage() {
  const [data, setData] = useState<ProfilesResponse>({
    profiles: [],
    defaultProfileId: null,
  });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LlmProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm<ProfileForm>();
  const canWrite = getAdmin()?.role === "superadmin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminFetch<ProfilesResponse>("/admin/v1/llm/profiles"));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showEditor = async (profile?: LlmProfile) => {
    if (!profile) {
      setEditing(null);
      setOpen(true);
      return;
    }
    try {
      const result = await adminFetch<{ profile: LlmProfile }>(
        `/admin/v1/llm/profiles/${profile.id}`,
      );
      setEditing(result.profile);
      setOpen(true);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载模型配置失败");
    }
  };

  const populateEditor = () => {
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            name: editing.name,
            baseUrl: editing.baseUrl,
            model: editing.model,
            enabled: editing.enabled,
            remark: editing.remark || undefined,
            apiKey: editing.apiKey,
          }
        : {
            name: "",
            baseUrl: "https://api.openai.com",
            model: "",
            enabled: true,
            remark: undefined,
            apiKey: undefined,
          },
    );
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch(
        editing
          ? `/admin/v1/llm/profiles/${editing.id}`
          : "/admin/v1/llm/profiles",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );
      message.success(editing ? "模型已更新" : "模型已添加");
      setOpen(false);
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="大模型设置"
      subTitle="配置项目使用的 OpenAI 兼容模型，用于后台多语言文案翻译"
      extra={
        canWrite
          ? [
              <Button
                key="add"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => void showEditor()}
              >
                添加模型
              </Button>,
            ]
          : undefined
      }
    >
      {!canWrite && (
        <Alert
          type="info"
          showIcon
          message="当前账号可查看模型状态并使用翻译，只有超级管理员可以修改配置。"
          style={{ marginBottom: 16 }}
        />
      )}
      {!loading &&
        (!data.defaultProfileId ||
          !data.profiles.some(
            (profile) =>
              profile.id === data.defaultProfileId && profile.enabled,
          )) && (
          <Alert
            type="warning"
            showIcon
            message="尚无可用的默认模型，自动翻译功能暂不可用。"
            style={{ marginBottom: 16 }}
          />
        )}
      <Card>
        <Table<LlmProfile>
          rowKey="id"
          loading={loading}
          dataSource={data.profiles}
          pagination={false}
          columns={[
            {
              title: "名称",
              dataIndex: "name",
              render: (value, row) => (
                <Space>
                  <span>{value}</span>
                  {row.id === data.defaultProfileId && (
                    <Tag color="gold">默认</Tag>
                  )}
                </Space>
              ),
            },
            { title: "模型", dataIndex: "model" },
            {
              title: "Base URL",
              dataIndex: "baseUrl",
              ellipsis: true,
            },
            {
              title: "状态",
              width: 110,
              render: (_, row) => (
                <Space direction="vertical" size={0}>
                  <Tag color={row.enabled ? "success" : "default"}>
                    {row.enabled ? "启用" : "禁用"}
                  </Tag>
                  <span style={{ color: "rgba(0,0,0,.45)", fontSize: 12 }}>
                    {row.hasApiKey ? "密钥已设置" : "缺少密钥"}
                  </span>
                </Space>
              ),
            },
            {
              title: "备注",
              dataIndex: "remark",
              render: (value) => value || "—",
            },
            {
              title: "操作",
              width: 290,
              render: (_, row) => (
                <Space wrap>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={testingId === row.id}
                    disabled={!canWrite || !row.enabled}
                    onClick={async () => {
                      setTestingId(row.id);
                      try {
                        await adminFetch(`/admin/v1/llm/profiles/${row.id}/test`, {
                          method: "POST",
                        });
                        message.success("连接与翻译测试成功");
                      } catch (error) {
                        message.error(
                          error instanceof Error ? error.message : "测试失败",
                        );
                      } finally {
                        setTestingId(null);
                      }
                    }}
                  >
                    测试
                  </Button>
                  {row.id !== data.defaultProfileId && (
                    <Button
                      size="small"
                      icon={<StarOutlined />}
                      disabled={!canWrite || !row.enabled}
                      onClick={async () => {
                        await adminFetch(
                          `/admin/v1/llm/profiles/${row.id}/default`,
                          { method: "POST" },
                        );
                        message.success("已设为默认模型");
                        await load();
                      }}
                    >
                      设为默认
                    </Button>
                  )}
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    disabled={!canWrite}
                    onClick={() => void showEditor(row)}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除此模型配置？"
                    onConfirm={async () => {
                      await adminFetch(`/admin/v1/llm/profiles/${row.id}`, {
                        method: "DELETE",
                      });
                      message.success("模型已删除");
                      await load();
                    }}
                  >
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      disabled={!canWrite}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "编辑模型" : "添加模型"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        destroyOnClose
        afterOpenChange={(visible) => {
          if (visible) populateEditor();
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: "请输入配置名称" }]}
          >
            <Input placeholder="DeepSeek 翻译" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[
              { required: true, message: "请输入 Base URL" },
              { type: "url", message: "请输入有效 URL" },
            ]}
            extra="可填写到域名或 /v1，系统会自动调用 /chat/completions"
          >
            <Input placeholder="https://api.openai.com" />
          </Form.Item>
          <Form.Item
            name="model"
            label="模型名"
            rules={[{ required: true, message: "请输入模型名" }]}
          >
            <Input placeholder="gpt-4.1-mini" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={
              editing ? undefined : [{ required: true, message: "请输入 API Key" }]
            }
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
