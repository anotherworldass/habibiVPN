import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
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

type SignupTrialConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  planId: string;
  trigger: "any_register" | "verified_email" | "bootstrap" | "identity";
};

type SellPlan = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
};

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
        trigger: cfg.trigger || "any_register",
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
          trigger: values.trigger,
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
          </ul>
        }
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            trigger: "any_register",
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
            name="trigger"
            label="发放时机"
            extra="要 Web / App / TG 体验一致，选「各端注册都送」。同一用户只会开通一次。"
          >
            <Select
              options={[
                {
                  value: "any_register",
                  label: "各端注册都送（Web 验邮、App/TG 新建匿名号）",
                },
                {
                  value: "verified_email",
                  label: "仅验证邮箱后（含 Web 注册、App 绑邮箱）",
                },
                {
                  value: "bootstrap",
                  label: "仅 App/TG 新建匿名账号（不含 Web）",
                },
                {
                  value: "identity",
                  label: "验证邮箱或绑定 Telegram（含 Web，不含纯匿名）",
                },
              ]}
            />
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
