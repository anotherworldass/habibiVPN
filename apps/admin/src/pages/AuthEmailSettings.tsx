import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Form, Input, InputNumber, Space, Switch, Typography } from "antd";
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
  allowUnverifiedDirectRegister: boolean;
  allowUnverifiedPasswordLogin: boolean;
  allowClaimUnverifiedEmail: boolean;
  blockGmailAliasVariants: boolean;
  limitRegisterAbuse: boolean;
  registerAttemptPer10Min: number;
  registerIpNewPerDay: number;
  registerDeviceNewPerDay: number;
};

export default function AuthEmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const limitRegisterAbuse = Form.useWatch("limitRegisterAbuse", form);

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
        allowUnverifiedDirectRegister: cfg.allowUnverifiedDirectRegister,
        allowUnverifiedPasswordLogin: cfg.allowUnverifiedPasswordLogin,
        allowClaimUnverifiedEmail: cfg.allowClaimUnverifiedEmail,
        blockGmailAliasVariants: cfg.blockGmailAliasVariants,
        limitRegisterAbuse: cfg.limitRegisterAbuse,
        registerAttemptPer10Min: cfg.registerAttemptPer10Min,
        registerIpNewPerDay: cfg.registerIpNewPerDay,
        registerDeviceNewPerDay: cfg.registerDeviceNewPerDay,
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
          allowUnverifiedDirectRegister: !!values.allowUnverifiedDirectRegister,
          allowUnverifiedPasswordLogin: !!values.allowUnverifiedPasswordLogin,
          allowClaimUnverifiedEmail: !!values.allowClaimUnverifiedEmail,
          blockGmailAliasVariants: !!values.blockGmailAliasVariants,
          limitRegisterAbuse: !!values.limitRegisterAbuse,
          registerAttemptPer10Min: values.registerAttemptPer10Min,
          registerIpNewPerDay: values.registerIpNewPerDay,
          registerDeviceNewPerDay: values.registerDeviceNewPerDay,
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
              时生效默认：允许无验证码软绑定、禁止 Web 无验证码直接注册、禁止未验证密码登录、允许验码抢走未验证邮箱、开启注册防刷（10 分钟 8 次尝试、同一 IP 每天 12 个新号、同一设备每天 2 个新号）。
            </li>
            <li>
              软绑定会把邮箱挂到当前 UID，状态为未验证；未验证邮箱不能互抢，只有验码成功才能抢走。
            </li>
            <li>
              Web 注册默认必须邮箱验证码。打开「允许无验证码直接注册」后，注册页可只填邮箱+密码，账号为未验证。
            </li>
            <li>找回密码 / 邮箱验证码登录始终仅面向已验证邮箱。</li>
            <li>
              Gmail 小号限制开启后，用户名里的点、+后缀、googlemail.com
              视为同一邮箱，不能再开第二个号；已有小号不会自动合并。
            </li>
            <li>
              「限制同一 IP / 设备批量注册」只拦邮箱新建账号：Web 注册页发码 / 直接注册 / 验码开新号，以及未登录打
              /auth/register 的客户端（含 TG 走这条时）。不管 App 首次打开的匿名开户（/auth/bootstrap，仍用环境变量那套）。已有 UID 再绑邮箱、补验证也不计新号。
            </li>
            <li>
              关掉这个开关：Web 邮箱刷号放开，App 清数据狂开匿名号仍受 bootstrap 限制。同一设备每天新号与同一 IP 每天新号是两套上限。
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
            allowSoftBindWithoutCode: true,
            allowUnverifiedDirectRegister: false,
            allowUnverifiedPasswordLogin: false,
            allowClaimUnverifiedEmail: true,
            blockGmailAliasVariants: false,
            limitRegisterAbuse: true,
            registerAttemptPer10Min: 8,
            registerIpNewPerDay: 12,
            registerDeviceNewPerDay: 2,
          }}
        >
          <Form.Item
            name="enabled"
            label="启用自定义策略"
            valuePropName="checked"
            extra="关闭时忽略下方开关与数字，始终使用系统默认值"
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
            name="allowUnverifiedDirectRegister"
            label="允许无验证码直接注册（Web）"
            valuePropName="checked"
            extra="开启后 Web 注册页隐藏验证码，只填邮箱+密码即可创建未验证账号。关闭则必须获取并填写邮箱验证码"
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
          <Form.Item
            name="blockGmailAliasVariants"
            label="限制 Gmail 点号 / + 小号"
            valuePropName="checked"
            extra="aaaa@gmail.com、aaa.a@gmail.com、aaaa+1@gmail.com、googlemail.com 只能注册其中一个"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="limitRegisterAbuse"
            label="限制同一 IP / 设备批量注册"
            valuePropName="checked"
            extra="只约束邮箱新建账号（Web 注册、未登录 /auth/register），不影响 App 匿名开户，也不影响已有 UID 绑邮箱 / 补验证。关闭后不再校验下方三个数字"
          >
            <Switch />
          </Form.Item>
          <Space wrap size="large" style={{ width: "100%" }}>
            <Form.Item
              name="registerAttemptPer10Min"
              label="10 分钟内尝试次数"
              extra="同一 IP、同一设备各自独立计数（发码 + 直接注册）"
              rules={[{ required: true, type: "number", min: 1, max: 1000 }]}
            >
              <InputNumber
                min={1}
                max={1000}
                precision={0}
                disabled={!limitRegisterAbuse}
                style={{ width: 160 }}
              />
            </Form.Item>
            <Form.Item
              name="registerIpNewPerDay"
              label="同一 IP 每天新号"
              extra="按成功创建的邮箱账号计，不是尝试次数"
              rules={[{ required: true, type: "number", min: 1, max: 10000 }]}
            >
              <InputNumber
                min={1}
                max={10000}
                precision={0}
                disabled={!limitRegisterAbuse}
                style={{ width: 160 }}
              />
            </Form.Item>
            <Form.Item
              name="registerDeviceNewPerDay"
              label="同一设备每天新号"
              extra="按 Web 设备指纹计；与 App 匿名开户的每天新号上限无关，两边可分开调"
              rules={[{ required: true, type: "number", min: 1, max: 10000 }]}
            >
              <InputNumber
                min={1}
                max={10000}
                precision={0}
                disabled={!limitRegisterAbuse}
                style={{ width: 160 }}
              />
            </Form.Item>
          </Space>
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
