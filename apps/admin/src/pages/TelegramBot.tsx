import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PageContainer,
  ProForm,
  ProFormSwitch,
  ProFormText,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { Button, Card, Input, Space, Statistic, Table, Tag, Typography } from "antd";
import { message } from "../lib/antd-message";
import { SendOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type BotConfig = {
  project_id: string;
  enabled: boolean;
  bot_username: string | null;
  has_token: boolean;
  webhook_secret: string;
  webhook_url: string | null;
  webhook_origin: string | null;
  webhook_origin_effective: string;
  mini_app_url: string | null;
  mini_app_direct_link: string | null;
  welcome_text: string | null;
  channel_url: string | null;
  updated_at: string;
};

type SubRow = {
  id: string;
  telegram_user_id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_premium: boolean | null;
  is_bot: boolean;
  allows_write_to_pm: boolean | null;
  photo_url: string | null;
  can_dm: boolean;
  blocked: boolean;
  user_uid: number | null;
  user_email: string | null;
  started_at: string;
  last_seen_at: string;
};

type Stats = {
  total: number;
  can_dm: number;
  blocked: number;
  linked: number;
  premium: number;
};

export default function TelegramBotPage() {
  const [bot, setBot] = useState<BotConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        adminFetch<BotConfig>("/admin/v1/telegram/bot"),
        adminFetch<{
          stats: Stats;
          total: number;
          items: SubRow[];
        }>(
          `/admin/v1/telegram/subscribers?limit=50&offset=0${
            q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""
          }`,
        ),
      ]);
      setBot(b);
      setStats(s.stats);
      setItems(s.items || []);
      setTotal(s.total || 0);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBot(values: {
    enabled: boolean;
    bot_token?: string;
    bot_username?: string;
    mini_app_url?: string;
    mini_app_direct_link?: string;
    welcome_text?: string;
    channel_url?: string;
    webhook_origin?: string;
  }) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled: values.enabled,
        bot_username: values.bot_username || null,
        mini_app_url: values.mini_app_url || null,
        mini_app_direct_link: values.mini_app_direct_link || null,
        welcome_text: values.welcome_text || null,
        channel_url: values.channel_url || null,
        webhook_origin: values.webhook_origin?.trim() || null,
        register_webhook: true,
      };
      if (values.bot_token?.trim()) {
        body.bot_token = values.bot_token.trim();
      }
      const next = await adminFetch<BotConfig>("/admin/v1/telegram/bot", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setBot(next);
      message.success("已保存，并尝试注册 Webhook");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer
      title="Telegram Bot"
      subTitle="Bot 配置与订户（与 Mini App 同一 Bot）"
      extra={
        <Space>
          <Link to="/support/inbox">
            <Button>客服台</Button>
          </Link>
          <Link to="/telegram/auto-reply">
            <Button>自动回复</Button>
          </Link>
          <Link to="/telegram/broadcast">
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!bot?.enabled || !bot?.has_token}
            >
              去群发
            </Button>
          </Link>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card loading={loading} title="Bot 配置" size="small">
          {bot && (
            <ProForm
              key={`${bot.project_id}-${bot.updated_at}`}
              layout="vertical"
              submitter={{
                searchConfig: { submitText: "保存并注册 Webhook" },
                resetButtonProps: false,
                submitButtonProps: { loading: saving },
              }}
              initialValues={{
                enabled: bot.enabled,
                bot_token: "",
                bot_username: bot.bot_username || "",
                mini_app_url: bot.mini_app_url || "",
                mini_app_direct_link: bot.mini_app_direct_link || "",
                welcome_text: bot.welcome_text || "",
                channel_url: bot.channel_url || "",
                webhook_origin: bot.webhook_origin || "",
              }}
              onFinish={async (v) => {
                await saveBot({
                  enabled: Boolean(v.enabled),
                  bot_token: typeof v.bot_token === "string" ? v.bot_token : undefined,
                  bot_username:
                    typeof v.bot_username === "string" ? v.bot_username : undefined,
                  mini_app_url:
                    typeof v.mini_app_url === "string" ? v.mini_app_url : undefined,
                  mini_app_direct_link:
                    typeof v.mini_app_direct_link === "string"
                      ? v.mini_app_direct_link
                      : undefined,
                  welcome_text:
                    typeof v.welcome_text === "string" ? v.welcome_text : undefined,
                  channel_url:
                    typeof v.channel_url === "string" ? v.channel_url : undefined,
                  webhook_origin:
                    typeof v.webhook_origin === "string" ? v.webhook_origin : undefined,
                });
              }}
            >
              <ProFormSwitch name="enabled" label="启用 Bot" />
              <ProFormText
                name="bot_token"
                label="Bot Token"
                placeholder={
                  bot.has_token
                    ? "已配置（留空表示不修改）"
                    : "从 BotFather 复制 token"
                }
                extra={
                  bot.has_token
                    ? "Token 已加密存储，重新填写可覆盖"
                    : "保存时会调用 getMe 校验"
                }
              />
              <ProFormText
                name="bot_username"
                label="Bot 用户名"
                placeholder="不含 @"
                fieldProps={{ addonBefore: "@" }}
              />
              <ProFormText
                name="mini_app_url"
                label="Mini App URL"
                placeholder="https://tg.example.com"
                extra="写入 /start 欢迎键盘的 web_app 按钮（HTTPS 站点地址）"
              />
              <ProFormText
                name="mini_app_direct_link"
                label="小程序直达链接（邀请用）"
                placeholder="https://t.me/YourBot/app 或 https://t.me/YourBot"
                extra="BotFather 的 t.me 直达链（主 Mini App 填 https://t.me/Bot；/newapp 则填 https://t.me/Bot/短名）。小程序邀请链接会变成该地址 + ?startapp=邀请码；未填时回退为 t.me/Bot用户名"
              />
              <ProFormText
                name="channel_url"
                label="官方频道链接"
                placeholder="https://t.me/your_channel 或 @your_channel"
                extra="填写后，小程序「我的」页会显示「加入官方频道」引导入口；留空则不展示"
              />
              <ProFormTextArea
                name="welcome_text"
                label="/start 欢迎语"
                fieldProps={{ rows: 3 }}
              />
              <ProFormText
                name="webhook_origin"
                label="Webhook 公网 Origin"
                placeholder={bot.webhook_origin_effective}
                extra={
                  bot.webhook_origin
                    ? `已覆盖系统配置；当前生效：${bot.webhook_origin_effective}。留空保存则回退环境变量 API_PUBLIC_ORIGIN`
                    : `留空则使用环境变量（当前生效：${bot.webhook_origin_effective}）。填写如 https://api.example.com 后保存并注册`
                }
                rules={[
                  {
                    validator: async (_, value) => {
                      if (!value || !String(value).trim()) return;
                      try {
                        const u = new URL(String(value).trim());
                        if (u.protocol !== "http:" && u.protocol !== "https:") {
                          throw new Error("invalid");
                        }
                      } catch {
                        throw new Error("请填写合法的 http(s) Origin，如 https://api.example.com");
                      }
                    },
                  },
                ]}
              />
              {bot.webhook_url ? (
                <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
                  <Typography.Text type="secondary">Webhook URL：</Typography.Text>
                  {bot.webhook_url}
                </Typography.Paragraph>
              ) : (
                <Typography.Text type="secondary">
                  填写 Token 并保存后生成 Webhook URL
                </Typography.Text>
              )}
            </ProForm>
          )}
        </Card>

        <Card size="small">
          <Space size="large" wrap>
            <Statistic title="订户总数" value={stats?.total ?? 0} />
            <Statistic title="可私聊" value={stats?.can_dm ?? 0} />
            <Statistic title="Premium" value={stats?.premium ?? 0} />
            <Statistic title="已拉黑/失效" value={stats?.blocked ?? 0} />
            <Statistic title="已绑定账号" value={stats?.linked ?? 0} />
          </Space>
        </Card>

        <Card
          size="small"
          title={`订户列表（${total}）`}
          extra={
            <Space>
              <Input.Search
                allowClear
                placeholder="搜用户名 / TG id / UID / 语言"
                onSearch={(v) => setQ(v)}
                style={{ width: 240 }}
              />
              <Button onClick={() => void load()}>刷新</Button>
            </Space>
          }
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={items}
            pagination={false}
            size="small"
            columns={[
              {
                title: "Telegram",
                render: (_, r) => (
                  <Space size={8}>
                    {r.photo_url ? (
                      <img
                        src={r.photo_url}
                        alt=""
                        width={28}
                        height={28}
                        style={{ borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : null}
                    <span>
                      {r.username ? `@${r.username}` : "—"}{" "}
                      <Typography.Text type="secondary">
                        ({r.telegram_user_id})
                      </Typography.Text>
                    </span>
                  </Space>
                ),
              },
              {
                title: "昵称",
                render: (_, r) =>
                  [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
              },
              {
                title: "语言",
                width: 90,
                dataIndex: "language_code",
                render: (v: string | null) => v || "—",
              },
              {
                title: "标签",
                width: 140,
                render: (_, r) => (
                  <Space size={4} wrap>
                    {r.is_premium ? <Tag color="gold">Premium</Tag> : null}
                    {r.is_bot ? <Tag>Bot</Tag> : null}
                    {r.allows_write_to_pm === true ? (
                      <Tag color="blue">可写 PM</Tag>
                    ) : r.allows_write_to_pm === false ? (
                      <Tag>拒写 PM</Tag>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: "业务用户",
                render: (_, r) =>
                  r.user_uid != null
                    ? `UID ${r.user_uid}`
                    : r.user_email || "未绑定",
              },
              {
                title: "状态",
                width: 120,
                render: (_, r) =>
                  r.blocked ? (
                    <Tag color="error">已失效</Tag>
                  ) : r.can_dm ? (
                    <Tag color="success">可私聊</Tag>
                  ) : (
                    <Tag>不可私聊</Tag>
                  ),
              },
              {
                title: "最近活跃",
                dataIndex: "last_seen_at",
                width: 170,
                render: (v: string) => new Date(v).toLocaleString(),
              },
            ]}
          />
        </Card>
      </Space>
    </PageContainer>
  );
}
