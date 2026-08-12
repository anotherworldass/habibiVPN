import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Typography,
} from "antd";
import { message } from "../lib/antd-message";
import { MailOutlined, SafetyOutlined, SendOutlined } from "@ant-design/icons";
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

type MailSesConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string | null;
  configurationSet: string | null;
  secret_set: boolean;
};

type MailRateLimitConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  emailCooldownSeconds: number;
  emailPerHour: number;
  ipPerMinute: number;
  ipPerHour: number;
  projectPerMinute: number;
};

const SECRET_MASK = "********";

const DEFAULT_RATE_LIMIT = {
  enabled: false,
  emailCooldownSeconds: 60,
  emailPerHour: 5,
  ipPerMinute: 10,
  ipPerHour: 60,
  projectPerMinute: 120,
  remark: "",
};

export default function MailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [rateForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cfg, rate] = await Promise.all([
        adminFetch<MailSesConfig>("/admin/v1/settings/mail/ses"),
        adminFetch<MailRateLimitConfig>("/admin/v1/settings/mail/rate-limit"),
      ]);
      form.setFieldsValue({
        enabled: cfg.enabled,
        region: cfg.region || "ap-southeast-1",
        accessKeyId: cfg.accessKeyId || "",
        secretAccessKey: cfg.secret_set ? SECRET_MASK : "",
        fromEmail: cfg.fromEmail || "",
        fromName: cfg.fromName || "",
        configurationSet: cfg.configurationSet || "",
        remark: cfg.remark || "",
      });
      rateForm.setFieldsValue({
        enabled: rate.enabled,
        emailCooldownSeconds: rate.emailCooldownSeconds,
        emailPerHour: rate.emailPerHour,
        ipPerMinute: rate.ipPerMinute,
        ipPerHour: rate.ipPerHour,
        projectPerMinute: rate.projectPerMinute,
        remark: rate.remark || "",
      });
      setTestTo((prev) => prev || cfg.fromEmail || "");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [form, rateForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch("/admin/v1/settings/mail/ses", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          region: String(values.region || "").trim(),
          accessKeyId: String(values.accessKeyId || "").trim(),
          secretAccessKey: String(values.secretAccessKey || "").trim(),
          fromEmail: String(values.fromEmail || "").trim(),
          fromName: values.fromName?.trim() || null,
          configurationSet: values.configurationSet?.trim() || null,
          remark: values.remark?.trim() || null,
        }),
      });
      message.success("已保存");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onSaveRate = async () => {
    const values = await rateForm.validateFields();
    setSavingRate(true);
    try {
      await adminFetch("/admin/v1/settings/mail/rate-limit", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          emailCooldownSeconds: Number(values.emailCooldownSeconds),
          emailPerHour: Number(values.emailPerHour),
          ipPerMinute: Number(values.ipPerMinute),
          ipPerHour: Number(values.ipPerHour),
          projectPerMinute: Number(values.projectPerMinute),
          remark: values.remark?.trim() || null,
        }),
      });
      message.success("防刷参数已保存（本进程立即生效）");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingRate(false);
    }
  };

  const onTest = async () => {
    const to = testTo.trim();
    if (!to) {
      message.warning("请填写测试收件邮箱");
      return;
    }
    setTesting(true);
    setTestError(null);
    try {
      const res = await adminFetch<{
        ok: boolean;
        message_id?: string;
        subject?: string;
      }>("/admin/v1/settings/mail/ses/test", {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      message.success(
        res.subject
          ? `发送成功：${res.subject}`
          : res.message_id
            ? `发送成功（MessageId: ${res.message_id}）`
            : "发送成功",
      );
    } catch (e) {
      const text = errorText(e, "发送失败");
      setTestError(text);
      message.error(text);
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageContainer
      title="邮件（Amazon SES）"
      subTitle="按顶部当前项目配置；SES 发信与验证码防刷"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="配置说明"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              使用 IAM Access Key（需{" "}
              <Typography.Text code>ses:SendEmail</Typography.Text> 权限），不是
              SES SMTP 用户名。
            </li>
            <li>
              <Typography.Text code>fromEmail</Typography.Text>{" "}
              须在 SES 已验证（沙盒还需验证收件地址）。
            </li>
            <li>
              Secret 读出为打码；不改密码请保留{" "}
              <Typography.Text code>{SECRET_MASK}</Typography.Text> 或留空后勿清空已保存密钥（保存时传打码会保留旧值）。
            </li>
          </ul>
        }
      />

      <Card title="Amazon SES">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            region: "ap-southeast-1",
          }}
        >
          <Form.Item
            name="enabled"
            label="启用发信"
            valuePropName="checked"
            extra="关闭后该项目不会通过 SES 发信（找回密码在生产环境将无法送达）"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="region"
            label="AWS Region"
            rules={[{ required: true, message: "如 ap-southeast-1" }]}
          >
            <Input placeholder="ap-southeast-1" />
          </Form.Item>
          <Form.Item
            name="accessKeyId"
            label="Access Key ID"
            rules={[{ required: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="secretAccessKey"
            label="Secret Access Key"
            rules={[{ required: true, message: "首次必填；更新可填打码保留" }]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={SECRET_MASK}
            />
          </Form.Item>
          <Form.Item
            name="fromEmail"
            label="发件人邮箱"
            rules={[{ required: true, type: "email" }]}
          >
            <Input placeholder="noreply@yourdomain.com" />
          </Form.Item>
          <Form.Item name="fromName" label="发件人显示名（可选）">
            <Input placeholder="HabibiVPN" />
          </Form.Item>
          <Form.Item
            name="configurationSet"
            label="Configuration Set（可选）"
          >
            <Input placeholder="留空则不指定" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Space wrap>
            <Button
              type="primary"
              icon={<MailOutlined />}
              loading={saving}
              onClick={() => void onSave()}
            >
              保存
            </Button>
            <Input
              style={{ width: 260 }}
              placeholder="测试收件邮箱"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button
              icon={<SendOutlined />}
              loading={testing}
              onClick={() => void onTest()}
            >
              发送测试邮件
            </Button>
          </Space>

          {testError ? (
            <Alert
              type="error"
              showIcon
              closable
              onClose={() => setTestError(null)}
              style={{ marginTop: 16 }}
              message="测试邮件发送失败"
              description={
                <Typography.Paragraph
                  copyable
                  style={{ marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {testError}
                </Typography.Paragraph>
              }
            />
          ) : null}
        </Form>
      </Card>

      <Card title="验证码发送防刷（Redis）" style={{ marginTop: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="作用于注册验码 / 登录验码 / 找回密码"
          description="计数存在 Redis；Redis 不可用时回退进程内存。未启用自定义时使用下方默认值。保存后本 API 进程立即读入内存，约 30 秒内其它实例也会刷新。"
        />
        <Form form={rateForm} layout="vertical" initialValues={DEFAULT_RATE_LIMIT}>
          <Form.Item
            name="enabled"
            label="启用自定义限流"
            valuePropName="checked"
            extra="关闭时使用系统默认：冷却 60s、邮箱 5/时、IP 10/分·60/时、项目 SES 120/分"
          >
            <Switch />
          </Form.Item>
          <Space wrap size="large" style={{ width: "100%" }}>
            <Form.Item
              name="emailCooldownSeconds"
              label="同邮箱冷却（秒）"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={3600} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="emailPerHour"
              label="同邮箱每小时上限"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={100} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="ipPerMinute"
              label="同 IP 每分钟上限"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={1000} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="ipPerHour"
              label="同 IP 每小时上限"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={10000} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="projectPerMinute"
              label="项目 SES 每分钟上限"
              rules={[{ required: true }]}
              extra="仅实际发信前计数"
            >
              <InputNumber min={1} max={10000} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button
            type="primary"
            icon={<SafetyOutlined />}
            loading={savingRate}
            onClick={() => void onSaveRate()}
          >
            保存防刷参数
          </Button>
        </Form>
      </Card>
    </PageContainer>
  );
}
