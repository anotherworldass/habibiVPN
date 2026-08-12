import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Typography,
} from "antd";
import { CustomerServiceOutlined } from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type SupportClientMessageWindowConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  messageWindowSize: number;
  min: number;
  max: number;
  default_size: number;
};

export default function SupportSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bounds, setBounds] = useState({ min: 20, max: 500, defaultSize: 100 });
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await adminFetch<SupportClientMessageWindowConfig>(
        "/admin/v1/settings/support/client-message-window",
      );
      setBounds({
        min: cfg.min,
        max: cfg.max,
        defaultSize: cfg.default_size,
      });
      form.setFieldsValue({
        enabled: cfg.enabled,
        messageWindowSize: cfg.messageWindowSize,
        remark: cfg.remark || "",
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch("/admin/v1/settings/support/client-message-window", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          messageWindowSize: Number(values.messageWindowSize),
          remark: values.remark?.trim() || null,
        }),
      });
      message.success("已保存（本进程立即生效）");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="客服设置"
      subTitle="按顶部当前项目配置；影响官网/App 用户端聊天窗口"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="用户端消息窗口"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              用户端（H5 / App WebView）只展示会话中
              <Typography.Text strong> 最近 N 条 </Typography.Text>
              消息；管理端客服台不受此限制。
            </li>
            <li>
              未启用自定义时使用默认 N=
              {bounds.defaultSize}；允许范围 {bounds.min}–{bounds.max}。
            </li>
            <li>改小 N 后，用户侧刷新/重开聊天即按新窗口拉取，不会加载更早历史。</li>
          </ul>
        }
      />

      <Card
        title={
          <span>
            <CustomerServiceOutlined style={{ marginRight: 8 }} />
            客户端消息条数
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            messageWindowSize: 100,
            remark: "",
          }}
          style={{ maxWidth: 480 }}
        >
          <Form.Item
            name="enabled"
            label="启用自定义条数"
            valuePropName="checked"
            extra={`关闭时使用默认 ${bounds.defaultSize} 条`}
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="messageWindowSize"
            label="最新消息条数 N"
            rules={[{ required: true, message: "请填写条数" }]}
            extra={`用户端全量拉取时返回最近 N 条；范围 ${bounds.min}–${bounds.max}`}
          >
            <InputNumber
              min={bounds.min}
              max={bounds.max}
              step={10}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={255} placeholder="可选" />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void onSave()}>
            保存
          </Button>
        </Form>
      </Card>
    </PageContainer>
  );
}
