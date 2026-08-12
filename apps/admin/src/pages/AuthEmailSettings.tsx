import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Form, Input, Switch, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type AuthEmailConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  allowSoftBindWithoutCode: boolean;
  allowUnverifiedPasswordLogin: boolean;
  allowClaimUnverifiedEmail: boolean;
};

export default function AuthEmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await adminFetch<AuthEmailConfig>(
        "/admin/v1/settings/auth/email",
      );
      form.setFieldsValue({
        enabled: cfg.enabled,
        allowSoftBindWithoutCode: cfg.allowSoftBindWithoutCode,
        allowUnverifiedPasswordLogin: cfg.allowUnverifiedPasswordLogin,
        allowClaimUnverifiedEmail: cfg.allowClaimUnverifiedEmail,
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
      await adminFetch("/admin/v1/settings/auth/email", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          allowSoftBindWithoutCode: !!values.allowSoftBindWithoutCode,
          allowUnverifiedPasswordLogin: !!values.allowUnverifiedPasswordLogin,
          allowClaimUnverifiedEmail: !!values.allowClaimUnverifiedEmail,
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
      title="账号与邮箱"
      subTitle="按顶部当前项目配置；未启用时使用系统默认策略"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="策略说明"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              <Typography.Text strong>未启用</Typography.Text>
              时生效默认：允许无验证码软绑定、禁止未验证密码登录、允许验码抢走未验证邮箱。
            </li>
            <li>
              软绑定会把邮箱挂到当前 UID，状态为未验证；未验证邮箱不能互抢，只有验码成功才能抢走。
            </li>
            <li>
              新建账号（无匿名会话）仍须邮箱验证码，不会开放「未验证直接注册」。
            </li>
            <li>找回密码 / 邮箱验证码登录始终仅面向已验证邮箱。</li>
          </ul>
        }
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            enabled: false,
            allowSoftBindWithoutCode: true,
            allowUnverifiedPasswordLogin: false,
            allowClaimUnverifiedEmail: true,
          }}
        >
          <Form.Item
            name="enabled"
            label="启用自定义策略"
            valuePropName="checked"
            extra="关闭时忽略下方开关，始终使用系统默认值"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="allowSoftBindWithoutCode"
            label="允许无验证码软绑定"
            valuePropName="checked"
            extra="匿名 UID 可只填邮箱+密码绑定，邮箱状态为未验证（TG「我的」常用）"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="allowUnverifiedPasswordLogin"
            label="未验证邮箱允许密码登录"
            valuePropName="checked"
            extra="关闭更安全：未验证邮箱不能用邮箱+密码登录其他设备；开启则允许"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="allowClaimUnverifiedEmail"
            label="验码可抢走未验证邮箱"
            valuePropName="checked"
            extra="验证码注册/绑定成功时，可从仅软绑定占用者剥离该邮箱（UID/套餐保留）"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Button
            type="primary"
            icon={<SafetyCertificateOutlined />}
            loading={saving}
            onClick={() => void onSave()}
          >
            保存
          </Button>
        </Form>
      </Card>
    </PageContainer>
  );
}
