import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Form, InputNumber, Select, Space, Switch, Typography } from "antd";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId, PROJECT_CHANGE_EVENT } from "../lib/project";

type Config = {
  id: string;
  projectId?: string;
  enabled: boolean;
  maxLevel: number;
  settleDays: number;
  minWithdrawCents: number;
  withdrawFeeBps: number;
  maxTotalRateBps: number;
  iapCommissionBaseBps?: number;
  playCommissionBaseBps?: number;
  firstCommissionBaseBps?: number;
  renewCommissionBaseBps?: number;
  withdrawMethods: string[];
  catalogSpendEnabled?: boolean;
};

const { Text } = Typography;

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2);
}

function centsToYuan(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function ReferralConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectIdState] = useState(getProjectId());
  const [form] = Form.useForm();

  const minWithdrawCents = Form.useWatch("minWithdrawCents", form) as number | undefined;
  const withdrawFeeBps = Form.useWatch("withdrawFeeBps", form) as number | undefined;
  const iapCommissionBaseBps = Form.useWatch("iapCommissionBaseBps", form) as
    | number
    | undefined;
  const playCommissionBaseBps = Form.useWatch("playCommissionBaseBps", form) as
    | number
    | undefined;
  const firstCommissionBaseBps = Form.useWatch("firstCommissionBaseBps", form) as
    | number
    | undefined;
  const renewCommissionBaseBps = Form.useWatch("renewCommissionBaseBps", form) as
    | number
    | undefined;

  async function load() {
    setLoading(true);
    try {
      const cfg = await adminFetch<Config>("/admin/v1/referral/config");
      setProjectIdState(cfg.projectId || getProjectId());
      form.setFieldsValue({
        enabled: cfg.enabled,
        maxLevel: cfg.maxLevel,
        settleDays: cfg.settleDays,
        minWithdrawCents: cfg.minWithdrawCents,
        withdrawFeeBps: cfg.withdrawFeeBps,
        maxTotalRateBps: cfg.maxTotalRateBps,
        iapCommissionBaseBps: cfg.iapCommissionBaseBps ?? 10000,
        playCommissionBaseBps: cfg.playCommissionBaseBps ?? 10000,
        firstCommissionBaseBps: cfg.firstCommissionBaseBps ?? 10000,
        renewCommissionBaseBps: cfg.renewCommissionBaseBps ?? 10000,
        withdrawMethods: cfg.withdrawMethods,
        catalogSpendEnabled: cfg.catalogSpendEnabled ?? false,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onProject = () => void load();
    window.addEventListener(PROJECT_CHANGE_EVENT, onProject);
    return () => window.removeEventListener(PROJECT_CHANGE_EVENT, onProject);
  }, []);

  async function onSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch("/admin/v1/referral/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: values.enabled,
          maxLevel: values.maxLevel,
          settleDays: values.settleDays,
          minWithdrawCents: values.minWithdrawCents,
          withdrawFeeBps: values.withdrawFeeBps,
          maxTotalRateBps: values.maxTotalRateBps,
          iapCommissionBaseBps: values.iapCommissionBaseBps,
          playCommissionBaseBps: values.playCommissionBaseBps,
          firstCommissionBaseBps: values.firstCommissionBaseBps,
          renewCommissionBaseBps: values.renewCommissionBaseBps,
          withdrawMethods: values.withdrawMethods,
          catalogSpendEnabled: values.catalogSpendEnabled,
        }),
      });
      message.success("已保存");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const feeYuanOnMin =
    minWithdrawCents != null && withdrawFeeBps != null
      ? centsToYuan(Math.floor((minWithdrawCents * withdrawFeeBps) / 10000))
      : null;

  return (
    <PageContainer title="分销配置">
      <Card loading={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              以下为当前项目（{projectId}）的分销开关与提现规则。N 级费率请到{" "}
              <Link to="/referral/groups">用户组</Link> 配置；结算按受益人所属组取费率。
            </span>
          }
        />
        <Form form={form} layout="vertical" style={{ maxWidth: 860 }}>
          <Form.Item name="enabled" label="启用分销" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            name="catalogSpendEnabled"
            label="佣金兑换（话费/购物卡）"
            valuePropName="checked"
            extra="关闭后用户不可下单兑换；商品与审核仍可在后台管理"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Space wrap size="large" align="start">
            <Form.Item
              name="maxLevel"
              label="项目最大级数"
              rules={[{ required: true }]}
              extra="本项目闭包深度上限；各组可单独设更小级数"
            >
              <InputNumber min={1} max={10} />
            </Form.Item>
            <Form.Item name="settleDays" label="结算天数" rules={[{ required: true }]}>
              <InputNumber min={0} max={90} addonAfter="天" />
            </Form.Item>
            <Form.Item
              name="minWithdrawCents"
              label="最低提现（分）"
              rules={[{ required: true }]}
              extra={
                minWithdrawCents != null ? (
                  <span>
                    ≈ <Text strong>{centsToYuan(minWithdrawCents)}</Text> 元
                    {feeYuanOnMin != null && withdrawFeeBps != null ? (
                      <>
                        {" "}
                        · 按当前手续费 {bpsToPercent(withdrawFeeBps)}%，最低提现约扣{" "}
                        <Text strong>{feeYuanOnMin}</Text> 元
                      </>
                    ) : null}
                  </span>
                ) : null
              }
            >
              <InputNumber min={0} step={100} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="withdrawFeeBps"
              label="提现手续费（万分比）"
              rules={[{ required: true }]}
              extra={
                withdrawFeeBps != null ? (
                  <span>
                    = <Text strong>{bpsToPercent(withdrawFeeBps)}</Text>%
                  </span>
                ) : null
              }
            >
              <InputNumber min={0} max={5000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="maxTotalRateBps"
              label="参考预算上限（万分比）"
              rules={[{ required: true }]}
              extra="仅作参考提示，用户组费率可自由设置，不再强制校验"
            >
              <InputNumber min={0} max={10000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="iapCommissionBaseBps"
              label="App Store 计佣基数（万分比）"
              rules={[{ required: true }]}
              extra={
                iapCommissionBaseBps != null ? (
                  <span>
                    App Store 订单先按标价的{" "}
                    <Text strong>{bpsToPercent(iapCommissionBaseBps)}</Text>%，再乘首充/续费系数
                  </span>
                ) : (
                  "App Store 订单分佣基数相对套餐标价的比例"
                )
              }
            >
              <InputNumber min={0} max={10000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="playCommissionBaseBps"
              label="Google Play 计佣基数（万分比）"
              rules={[{ required: true }]}
              extra={
                playCommissionBaseBps != null ? (
                  <span>
                    Google Play 订单先按标价的{" "}
                    <Text strong>{bpsToPercent(playCommissionBaseBps)}</Text>%，再乘首充/续费系数
                  </span>
                ) : (
                  "Google Play 订单分佣基数相对套餐标价的比例"
                )
              }
            >
              <InputNumber min={0} max={10000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="firstCommissionBaseBps"
              label="首充计佣基数（万分比）"
              rules={[{ required: true }]}
              extra={
                firstCommissionBaseBps != null ? (
                  <span>
                    首笔付费订单再乘{" "}
                    <Text strong>{bpsToPercent(firstCommissionBaseBps)}</Text>%
                  </span>
                ) : null
              }
            >
              <InputNumber min={0} max={10000} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="renewCommissionBaseBps"
              label="续费计佣基数（万分比）"
              rules={[{ required: true }]}
              extra={
                renewCommissionBaseBps != null ? (
                  <span>
                    非首笔付费（含复购/订阅续订）再乘{" "}
                    <Text strong>{bpsToPercent(renewCommissionBaseBps)}</Text>%
                  </span>
                ) : null
              }
            >
              <InputNumber min={0} max={10000} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Form.Item name="withdrawMethods" label="提现方式">
            <Select
              mode="multiple"
              style={{ maxWidth: 360 }}
              options={[
                { value: "usdt", label: "USDT" },
                { value: "bank", label: "银行卡" },
              ]}
            />
          </Form.Item>
        </Form>

        <Button type="primary" loading={saving} onClick={() => void onSave()}>
          保存配置
        </Button>
      </Card>
    </PageContainer>
  );
}
