import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Select,
  Switch,
  Typography,
} from "antd";
import { GiftOutlined } from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

const SIGNUP_TRIAL_EVENTS = [
  "web_unverified",
  "web_verified",
  "app_bootstrap",
  "app_soft_bind",
  "app_verified_bind",
  "telegram_bootstrap",
  "telegram_soft_bind",
  "telegram_verified_bind",
  "telegram_bind",
] as const;

type SignupTrialEvent = (typeof SIGNUP_TRIAL_EVENTS)[number];

const DEFAULT_EVENTS: SignupTrialEvent[] = [
  "web_verified",
  "app_bootstrap",
  "app_verified_bind",
  "telegram_bootstrap",
  "telegram_verified_bind",
  "telegram_bind",
];

const EVENT_GROUPS: Array<{
  title: string;
  items: Array<{ value: SignupTrialEvent; label: string }>;
}> = [
  {
    title: "Web",
    items: [
      { value: "web_unverified", label: "注册（不验邮）" },
      { value: "web_verified", label: "注册（验邮）" },
    ],
  },
  {
    title: "App",
    items: [
      { value: "app_bootstrap", label: "新建匿名账号" },
      { value: "app_soft_bind", label: "绑邮箱（不验邮）" },
      { value: "app_verified_bind", label: "绑邮箱（验邮）" },
    ],
  },
  {
    title: "Telegram",
    items: [
      { value: "telegram_bootstrap", label: "新建匿名账号" },
      { value: "telegram_soft_bind", label: "绑邮箱（不验邮）" },
      { value: "telegram_verified_bind", label: "绑邮箱（验邮）" },
      { value: "telegram_bind", label: "绑定 Telegram" },
    ],
  },
];

type SignupTrialConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  planId: string;
  events?: SignupTrialEvent[];
  /** @deprecated migrated on load */
  trigger?: string;
};

type SellPlan = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
};

function normalizeEvents(cfg: SignupTrialConfig): SignupTrialEvent[] {
  if (Array.isArray(cfg.events)) {
    return SIGNUP_TRIAL_EVENTS.filter((e) => cfg.events!.includes(e));
  }
  return [...DEFAULT_EVENTS];
}

export default function SignupTrialSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<SellPlan[]>([]);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cfg, planRes] = await Promise.all([
        adminFetch<SignupTrialConfig>("/admin/v1/settings/signup/trial"),
        adminFetch<{ plans: SellPlan[] }>("/admin/v1/plans"),
      ]);
      setPlans(planRes.plans || []);
      form.setFieldsValue({
        enabled: cfg.enabled,
        planId: cfg.planId || undefined,
        events: normalizeEvents(cfg),
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
      await adminFetch("/admin/v1/settings/signup/trial", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          planId: values.planId || "",
          events: values.events || [],
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

  return (
    <PageContainer
      title="注册赠送"
      subTitle="按顶部当前项目配置；关闭时注册不会自动开通套餐"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="建议单独建一条体验 SKU"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              不要选用付费月卡/年卡：同一用户对同一套餐只能有一个槽，送过就无法再买同一计划。
            </li>
            <li>
              开通走上游建客，失败不会阻断注册；账本原因为「注册赠送」，每人每套餐只送一次。
            </li>
            <li>
              体验套餐建议短时长、限流量。目录若不想出现「免费领取」，把该套餐的可领开关关掉。
            </li>
            <li>
              Web「注册（不验邮）」依赖邮箱策略里的「允许不验邮直接注册」；未打开时该场景不会发生。
            </li>
          </ul>
        }
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            events: DEFAULT_EVENTS,
          }}
        >
          <Form.Item
            name="enabled"
            label="启用注册赠送"
            valuePropName="checked"
            extra="关闭后忽略下方选项，注册/绑定不会自动开通"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="planId"
            label="体验套餐"
            extra="仅列出当前项目套餐；启用时必须选一条已启用套餐"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="选择售卖套餐"
              options={plans.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.code})${p.enabled ? "" : " · 已停用"}`,
                disabled: !p.enabled,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="events"
            label="发放场景"
            extra="按端、按动作分别勾选。同一用户同一套餐只会开通一次。"
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: string[] | undefined) {
                  if (getFieldValue("enabled") && !(value && value.length)) {
                    return Promise.reject(new Error("启用时请至少勾选一个场景"));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Checkbox.Group style={{ width: "100%" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                {EVENT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
                      {group.title}
                    </Typography.Text>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {group.items.map((item) => (
                        <Checkbox key={item.value} value={item.value}>
                          {item.label}
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button
            type="primary"
            icon={<GiftOutlined />}
            loading={saving}
            onClick={() => void onSave()}
          >
            保存
          </Button>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            已有用户不会回溯赠送。同一用户重复触发会被幂等跳过。
          </Typography.Paragraph>
        </Form>
      </Card>
    </PageContainer>
  );
}
