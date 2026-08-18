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
import {
  CustomerServiceOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { ApiError, adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

const TOKEN_MASK = "********";

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

type SupportTelegramForwardConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  bot_username: string | null;
  has_token: boolean;
  webhook_secret: string;
  webhook_url: string | null;
  webhook_origin_effective: string;
  chat_id: string | null;
  chat_type: string | null;
  chat_title: string | null;
  bound: boolean;
};

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: unknown; error?: unknown } | null;
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
    if (typeof body?.error === "string" && body.error.trim()) {
      const code = body.error.trim();
      if (code === "support.telegram_forward_not_ready") {
        return "请先保存 Bot Token";
      }
      if (code === "support.telegram_forward_not_bound") {
        return "还没绑定会话：把 Bot 拉进群或私聊它，发送 /bind";
      }
      if (code === "telegram.api_error") return "Telegram API 调用失败，请检查 Token";
      return code;
    }
    if (e.message.trim()) return e.message.trim();
  }
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

function chatTypeLabel(type: string | null): string {
  if (type === "private") return "私聊";
  if (type === "group") return "群";
  if (type === "supergroup") return "超级群";
  return type || "会话";
}

export default function SupportSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBot, setSavingBot] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [bounds, setBounds] = useState({ min: 20, max: 500, defaultSize: 100 });
  const [botCfg, setBotCfg] = useState<SupportTelegramForwardConfig | null>(
    null,
  );
  const [form] = Form.useForm();
  const [botForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cfg, forward] = await Promise.all([
        adminFetch<SupportClientMessageWindowConfig>(
          "/admin/v1/settings/support/client-message-window",
        ),
        adminFetch<SupportTelegramForwardConfig>(
          "/admin/v1/settings/support/telegram-forward",
        ),
      ]);
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
      setBotCfg(forward);
      botForm.setFieldsValue({
        enabled: forward.enabled,
        bot_token: forward.has_token ? TOKEN_MASK : "",
        remark: forward.remark || "",
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [form, botForm]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!botCfg || botCfg.bound) return;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const forward = await adminFetch<SupportTelegramForwardConfig>(
            "/admin/v1/settings/support/telegram-forward",
          );
          setBotCfg(forward);
        } catch {
          /* ignore poll errors */
        }
      })();
    }, 3000);
    return () => window.clearInterval(t);
  }, [botCfg?.bound]);

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

  const onSaveBot = async () => {
    const values = await botForm.validateFields();
    const token = (values.bot_token || "").trim();
    setSavingBot(true);
    try {
      const next = await adminFetch<SupportTelegramForwardConfig>(
        "/admin/v1/settings/support/telegram-forward",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: !!values.enabled,
            bot_token: token && token !== TOKEN_MASK ? token : undefined,
            register_webhook: true,
            remark: values.remark?.trim() || null,
          }),
        },
      );
      setBotCfg(next);
      botForm.setFieldsValue({
        enabled: next.enabled,
        bot_token: next.has_token ? TOKEN_MASK : "",
        remark: next.remark || "",
      });
      message.success("已保存并注册 Webhook");
    } catch (e) {
      message.error(errorText(e, "保存失败"));
    } finally {
      setSavingBot(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      await adminFetch("/admin/v1/settings/support/telegram-forward/test", {
        method: "POST",
        body: JSON.stringify({}),
      });
      message.success("测试消息已发送");
    } catch (e) {
      message.error(errorText(e, "发送失败"));
    } finally {
      setTesting(false);
    }
  };

  const onClearBind = async () => {
    setClearing(true);
    try {
      const next = await adminFetch<SupportTelegramForwardConfig>(
        "/admin/v1/settings/support/telegram-forward/clear-bind",
        { method: "POST", body: JSON.stringify({}) },
      );
      setBotCfg(next);
      message.success("已清除绑定，请在目标会话重新发送 /bind");
    } catch (e) {
      message.error(errorText(e, "清除失败"));
    } finally {
      setClearing(false);
    }
  };

  return (
    <PageContainer
      title="客服设置"
      subTitle="按顶部当前项目配置；用户端消息窗口与 Telegram 员工转发"
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
        style={{ marginBottom: 16 }}
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

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Telegram Bot 转发（独立员工 Bot，不要用 Mini App 客户 Bot）"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              用 BotFather 新建一只 Bot，把 Token 填到下面并保存（会注册
              Webhook）。
            </li>
            <li>
              把 Bot 拉进员工群（或直接私聊它），在目标会话发送{" "}
              <Typography.Text code>/bind</Typography.Text>。
            </li>
            <li>
              客户消息（Web / App / 客户 TG）会转发到该会话；
              <Typography.Text strong>必须回复那条转发消息</Typography.Text>
              才会回给客户。群里闲聊不会入库。
            </li>
            <li>
              默认 Privacy Mode 即可：回复 Bot 自己的消息时 Telegram
              仍会推给 Bot。
            </li>
          </ul>
        }
      />

      <Card
        title={
          <span>
            <SendOutlined style={{ marginRight: 8 }} />
            Telegram Bot 转发
          </span>
        }
      >
        <Form
          form={botForm}
          layout="vertical"
          initialValues={{ enabled: false, bot_token: "", remark: "" }}
          style={{ maxWidth: 560 }}
        >
          <Form.Item
            name="enabled"
            label="启用转发"
            valuePropName="checked"
            extra="关闭后不再推送，群里回复也不会回写客户"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="bot_token"
            label="Bot Token"
            extra="留空或保持掩码则不修改。保存时会 getMe 校验并注册 Webhook。"
          >
            <Input.Password placeholder="123456:AAH..." autoComplete="off" />
          </Form.Item>
          {botCfg?.bot_username ? (
            <Typography.Paragraph style={{ marginTop: -8 }}>
              <Typography.Text type="secondary">Bot 用户名：</Typography.Text>
              @{botCfg.bot_username}
            </Typography.Paragraph>
          ) : null}
          {botCfg?.webhook_url ? (
            <Typography.Paragraph copyable={{ text: botCfg.webhook_url }}>
              <Typography.Text type="secondary">Webhook：</Typography.Text>
              {botCfg.webhook_url}
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary">
              保存 Token 后才会生成 Webhook URL
            </Typography.Paragraph>
          )}
          <Typography.Paragraph>
            <Typography.Text type="secondary">绑定会话：</Typography.Text>
            {botCfg?.bound ? (
              <>
                {chatTypeLabel(botCfg.chat_type)}
                {botCfg.chat_title ? ` · ${botCfg.chat_title}` : ""}
                {botCfg.chat_id ? (
                  <Typography.Text code style={{ marginLeft: 8 }}>
                    {botCfg.chat_id}
                  </Typography.Text>
                ) : null}
              </>
            ) : (
              <Typography.Text type="secondary">
                未绑定，请在目标群/私聊发送 /bind
              </Typography.Text>
            )}
          </Typography.Paragraph>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} maxLength={255} placeholder="仅后台可见" />
          </Form.Item>
          <Space wrap>
            <Button
              type="primary"
              loading={savingBot}
              onClick={() => void onSaveBot()}
            >
              保存并注册 Webhook
            </Button>
            <Button
              loading={testing}
              disabled={!botCfg?.has_token}
              onClick={() => void onTest()}
            >
              发送测试消息
            </Button>
            <Button
              danger
              loading={clearing}
              disabled={!botCfg?.bound}
              onClick={() => void onClearBind()}
            >
              清除绑定
            </Button>
          </Space>
        </Form>
      </Card>
    </PageContainer>
  );
}
