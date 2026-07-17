import { useEffect, useState, type ReactNode } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Button,
  Card,
  Form,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from "antd";
import { adminFetch } from "../lib/api";

type LevelRate = { level: number; rateBps: number };

type Config = {
  id: string;
  enabled: boolean;
  maxLevel: number;
  settleDays: number;
  minWithdrawCents: number;
  withdrawFeeBps: number;
  maxTotalRateBps: number;
  withdrawMethods: string[];
  levels: LevelRate[];
};

const { Text } = Typography;

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2);
}

function centsToYuan(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Example commission yuan for a 100-yuan order. */
function exampleCommissionYuan(rateBps: number, orderYuan = 100) {
  const orderCents = Math.round(orderYuan * 100);
  return centsToYuan(Math.floor((orderCents * rateBps) / 10000));
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <Text type="secondary" style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
      {children}
    </Text>
  );
}

export default function ReferralConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [levels, setLevels] = useState<LevelRate[]>([]);

  const minWithdrawCents = Form.useWatch("minWithdrawCents", form) as number | undefined;
  const withdrawFeeBps = Form.useWatch("withdrawFeeBps", form) as number | undefined;
  const maxTotalRateBps = Form.useWatch("maxTotalRateBps", form) as number | undefined;

  async function load() {
    setLoading(true);
    try {
      const cfg = await adminFetch<Config>("/admin/v1/referral/config");
      form.setFieldsValue({
        enabled: cfg.enabled,
        maxLevel: cfg.maxLevel,
        settleDays: cfg.settleDays,
        minWithdrawCents: cfg.minWithdrawCents,
        withdrawFeeBps: cfg.withdrawFeeBps,
        maxTotalRateBps: cfg.maxTotalRateBps,
        withdrawMethods: cfg.withdrawMethods,
      });
      setLevels(cfg.levels.length ? cfg.levels : [{ level: 1, rateBps: 1400 }]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave() {
    const values = await form.validateFields();
    const total = levels.reduce((s, l) => s + l.rateBps, 0);
    if (total > values.maxTotalRateBps) {
      message.error(
        `各级比例合计 ${bpsToPercent(total)}% 超过预算 ${bpsToPercent(values.maxTotalRateBps)}%`,
      );
      return;
    }
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
          withdrawMethods: values.withdrawMethods,
          levels: levels.map((l, i) => ({ level: i + 1, rateBps: l.rateBps })),
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

  const totalBps = levels.reduce((s, l) => s + l.rateBps, 0);
  const feeYuanOnMin =
    minWithdrawCents != null && withdrawFeeBps != null
      ? centsToYuan(Math.floor((minWithdrawCents * withdrawFeeBps) / 10000))
      : null;

  return (
    <PageContainer title="分销配置">
      <Card loading={loading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 860 }}>
          <Form.Item name="enabled" label="启用分销" valuePropName="checked">
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Space wrap size="large" align="start">
            <Form.Item name="maxLevel" label="最大级数" rules={[{ required: true }]}>
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
              label="佣金预算上限（万分比）"
              rules={[{ required: true }]}
              extra={
                maxTotalRateBps != null ? (
                  <span>
                    = <Text strong>{bpsToPercent(maxTotalRateBps)}</Text>%
                    {" "}
                    · 100 元订单最多分佣{" "}
                    <Text strong>{exampleCommissionYuan(maxTotalRateBps)}</Text> 元
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

        <Table
          size="small"
          rowKey="level"
          pagination={false}
          dataSource={levels.map((l, i) => ({ ...l, level: i + 1 }))}
          columns={[
            { title: "层级", dataIndex: "level", width: 70 },
            {
              title: "比例（万分比）",
              dataIndex: "rateBps",
              width: 200,
              render: (_, row, index) => (
                <Space>
                  <InputNumber
                    min={0}
                    max={10000}
                    value={row.rateBps}
                    onChange={(v) => {
                      const next = [...levels];
                      next[index] = { level: index + 1, rateBps: Number(v) || 0 };
                      setLevels(next);
                    }}
                  />
                  <Hint>= {bpsToPercent(row.rateBps)}%</Hint>
                </Space>
              ),
            },
            {
              title: "100 元订单示例",
              render: (_, row) => (
                <Text>
                  <Text strong>{exampleCommissionYuan(row.rateBps)}</Text> 元
                </Text>
              ),
            },
            {
              title: "操作",
              width: 80,
              render: (_, __, index) =>
                levels.length > 1 ? (
                  <a onClick={() => setLevels(levels.filter((_, i) => i !== index))}>删除</a>
                ) : null,
            },
          ]}
          footer={() => (
            <Space wrap>
              <Button
                disabled={levels.length >= 10}
                onClick={() =>
                  setLevels([...levels, { level: levels.length + 1, rateBps: 0 }])
                }
              >
                增加一级
              </Button>
              <span>
                合计：{bpsToPercent(totalBps)}%（{totalBps} bps）· 100 元订单总分佣{" "}
                <Text strong>{exampleCommissionYuan(totalBps)}</Text> 元
              </span>
            </Space>
          )}
        />

        <Button type="primary" style={{ marginTop: 16 }} loading={saving} onClick={() => void onSave()}>
          保存配置
        </Button>
      </Card>
    </PageContainer>
  );
}
