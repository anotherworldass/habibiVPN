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
  Typography,
  Switch,
} from "antd";
import { SafetyOutlined } from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type PaymentOrderGuardConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  maxPendingOrders: number;
  createCooldownSeconds: number;
  userPer10Min: number;
  ipPer10Min: number;
  pendingReuseMinutes: number;
};

const DEFAULT_GUARD = {
  enabled: false,
  maxPendingOrders: 3,
  createCooldownSeconds: 10,
  userPer10Min: 8,
  ipPer10Min: 30,
  pendingReuseMinutes: 30,
  remark: "",
};

export default function PaymentOrderGuardSettingsPage() {
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
      const cfg = await adminFetch<PaymentOrderGuardConfig>(
        "/admin/v1/settings/payment/order-guard",
      );
      form.setFieldsValue({
        enabled: cfg.enabled,
        maxPendingOrders: cfg.maxPendingOrders,
        createCooldownSeconds: cfg.createCooldownSeconds,
        userPer10Min: cfg.userPer10Min,
        ipPer10Min: cfg.ipPer10Min,
        pendingReuseMinutes: cfg.pendingReuseMinutes,
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
      await adminFetch("/admin/v1/settings/payment/order-guard", {
        method: "PUT",
        body: JSON.stringify({
          enabled: !!values.enabled,
          maxPendingOrders: Number(values.maxPendingOrders),
          createCooldownSeconds: Number(values.createCooldownSeconds),
          userPer10Min: Number(values.userPer10Min),
          ipPer10Min: Number(values.ipPer10Min),
          pendingReuseMinutes: Number(values.pendingReuseMinutes),
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
      title="下单风控"
      subTitle="按顶部当前项目配置；限制创建支付订单的频率与待支付数量"
      loading={loading}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="触发后客户端会收到 429"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              待支付订单数超限返回{" "}
              <Typography.Text code>payment.too_many_pending</Typography.Text>
              （提示「未支付订单过多」）。
            </li>
            <li>
              冷却 / 10 分钟次数超限返回{" "}
              <Typography.Text code>payment.rate_limited</Typography.Text>
              （提示「下单过于频繁」）。
            </li>
            <li>
              次数计数存在 Redis；Redis 不可用时仅待支付订单数上限仍然生效。保存后本
              API 进程立即读入内存，约 30 秒内其它实例也会刷新。
            </li>
          </ul>
        }
      />

      <Card title="创建订单限制">
        <Form form={form} layout="vertical" initialValues={DEFAULT_GUARD}>
          <Form.Item
            name="enabled"
            label="启用自定义阈值"
            valuePropName="checked"
            extra="关闭时使用系统默认：待支付 3 笔、冷却 10s、用户 8 次/10 分、IP 30 次/10 分、复用窗口 30 分钟"
          >
            <Switch />
          </Form.Item>
          <Space wrap size="large" style={{ width: "100%" }}>
            <Form.Item
              name="maxPendingOrders"
              label="待支付订单数上限"
              rules={[{ required: true }]}
              extra="同一账号处于 pending 的订单数"
            >
              <InputNumber min={1} max={100} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="createCooldownSeconds"
              label="同用户下单冷却（秒）"
              rules={[{ required: true }]}
              extra="填 0 关闭冷却"
            >
              <InputNumber min={0} max={3600} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="userPer10Min"
              label="同用户 10 分钟上限"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={1000} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="ipPer10Min"
              label="同 IP 10 分钟上限"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={10000} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item
              name="pendingReuseMinutes"
              label="待支付订单复用窗口（分钟）"
              rules={[{ required: true }]}
              extra="相同套餐/通道/金额在窗口内复用旧支付链接，不占用新的名额；填 0 关闭复用"
            >
              <InputNumber min={0} max={1440} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button
            type="primary"
            icon={<SafetyOutlined />}
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
