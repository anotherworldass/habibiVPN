import { useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { message } from "../lib/antd-message";
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";

type Channel = {
  id: string;
  code: string;
  name: string;
  method: string;
  currency: string;
  minCents: number;
  maxCents: number;
  enabled: boolean;
  sortOrder: number;
};

type Provider = {
  id: string;
  code: string;
  name: string;
  adapter: string;
  enabled: boolean;
  config: {
    appId?: string;
    createOrderUrl?: string;
    queryOrderUrl?: string;
    balanceUrl?: string;
    callbackIp?: string;
    pid?: string;
    submitUrl?: string;
    apiBaseUrl?: string;
  };
  hasSecret: boolean;
  secret?: string | null;
  secretUnreadable?: boolean;
  channels: Channel[];
};

type AdapterOption = {
  value: string;
  label: string;
};

type BalanceResult = {
  appId?: string;
  amt?: string;
  userName?: string;
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function isAcceptoAdapter(adapter?: string) {
  return adapter === "accepto_epay";
}

function providerConfigFromForm(adapter: string, values: {
  pid?: string;
  submitUrl?: string;
  apiBaseUrl?: string;
  appId?: string;
  createOrderUrl?: string;
  queryOrderUrl?: string;
  balanceUrl?: string;
  callbackIp?: string;
}) {
  if (isAcceptoAdapter(adapter)) {
    return {
      pid: values.pid,
      submitUrl: values.submitUrl,
      apiBaseUrl: values.apiBaseUrl,
    };
  }
  return {
    appId: values.appId,
    createOrderUrl: values.createOrderUrl,
    queryOrderUrl: values.queryOrderUrl,
    balanceUrl: values.balanceUrl || undefined,
    callbackIp: values.callbackIp || undefined,
  };
}

export default function PaymentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [adapters, setAdapters] = useState<AdapterOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [providerForm] = Form.useForm();
  const [channelForm] = Form.useForm();

  const selected = providers.find((provider) => provider.id === selectedId);
  const createAdapter = Form.useWatch("adapter", providerForm);
  const editAdapter = Form.useWatch("adapter", form);
  const acceptoSelected = isAcceptoAdapter(editAdapter || selected?.adapter);

  function applyAdapterDefaults(adapter: string) {
    const current = form.getFieldsValue();
    if (isAcceptoAdapter(adapter)) {
      form.setFieldsValue({
        pid: current.pid || current.appId,
        submitUrl: current.submitUrl || "https://api.accepto.io/submit.php",
        apiBaseUrl: current.apiBaseUrl || "https://api.accepto.io",
      });
      return;
    }
    form.setFieldsValue({
      appId: current.appId || current.pid,
    });
  }

  async function load(preferredId?: string) {
    setLoading(true);
    try {
      const [result, adapterResult] = await Promise.all([
        adminFetch<{ providers: Provider[] }>("/admin/v1/payment/providers"),
        adminFetch<{ adapters: AdapterOption[] }>("/admin/v1/payment/adapters"),
      ]);
      setProviders(result.providers);
      setAdapters(adapterResult.adapters);
      const provider =
        result.providers.find((item) => item.id === (preferredId || selectedId)) ||
        result.providers[0];
      setSelectedId(provider?.id);
      if (provider) {
        form.setFieldsValue({
          name: provider.name,
          adapter: provider.adapter,
          enabled: provider.enabled,
          secret: provider.secret || "",
          ...provider.config,
        });
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载支付配置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectProvider(id: string) {
    const provider = providers.find((item) => item.id === id);
    setSelectedId(id);
    setBalance(null);
    if (provider) {
      form.setFieldsValue({
        name: provider.name,
        adapter: provider.adapter,
        enabled: provider.enabled,
        secret: provider.secret || "",
        ...provider.config,
      });
    }
  }

  async function createProvider() {
    const values = await providerForm.validateFields();
    setSaving(true);
    try {
      const response = await adminFetch<{ provider: Provider }>("/admin/v1/payment/providers", {
        method: "POST",
        body: JSON.stringify({
          code: values.code,
          name: values.name,
          adapter: values.adapter,
          enabled: false,
          secret: values.secret,
          config: providerConfigFromForm(values.adapter, values),
        }),
      });
      message.success("支付商已创建");
      setProviderModalOpen(false);
      providerForm.resetFields();
      await load(response.provider.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建支付商失败");
    } finally {
      setSaving(false);
    }
  }

  async function createChannel() {
    if (!selected) return;
    const values = await channelForm.validateFields();
    setSaving(true);
    try {
      await adminFetch(`/admin/v1/payment/providers/${selected.id}/channels`, {
        method: "POST",
        body: JSON.stringify({
          code: values.code,
          name: values.name,
          method: values.method,
          currency: values.currency,
          minCents: Math.round(Number(values.minYuan) * 100),
          maxCents: Math.round(Number(values.maxYuan) * 100),
          enabled: false,
          sortOrder: Number(values.sortOrder || 0),
        }),
      });
      message.success("支付通道已创建");
      setChannelModalOpen(false);
      channelForm.resetFields();
      await load(selected.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "创建支付通道失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveProvider() {
    if (!selected) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch(`/admin/v1/payment/providers/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          enabled: values.enabled,
          adapter: values.adapter,
          config: providerConfigFromForm(values.adapter, values),
          ...(values.secret ? { secret: values.secret } : {}),
        }),
      });
      message.success("支付服务商配置已保存");
      await load(selected.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateChannel(channel: Channel, patch: Partial<Channel>, options?: { silent?: boolean }) {
    try {
      await adminFetch(`/admin/v1/payment/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load(selected?.id);
      if (!options?.silent) message.success("通道配置已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    }
  }

  async function moveChannel(index: number, delta: -1 | 1) {
    if (!selected) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= selected.channels.length) return;
    const reordered = [...selected.channels];
    const [item] = reordered.splice(index, 1);
    if (!item) return;
    reordered.splice(nextIndex, 0, item);
    try {
      await Promise.all(
        reordered.map((channel, order) =>
          adminFetch(`/admin/v1/payment/channels/${channel.id}`, {
            method: "PATCH",
            body: JSON.stringify({ sortOrder: (order + 1) * 10 }),
          }),
        ),
      );
      await load(selected.id);
      message.success("通道顺序已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "调整顺序失败");
    }
  }

  async function queryBalance() {
    if (!selected) return;
    setBalanceLoading(true);
    try {
      const response = await adminFetch<{
        result?: {
          code?: number;
          msg?: string;
          data?: BalanceResult;
        };
      }>(
        `/admin/v1/payment/providers/${selected.id}/balance`,
        { method: "POST" },
      );
      if (Number(response.result?.code) !== 200 || !response.result?.data) {
        throw new Error(response.result?.msg || "余额查询失败");
      }
      setBalance(response.result.data);
      message.success("余额查询成功");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "余额查询失败");
    } finally {
      setBalanceLoading(false);
    }
  }

  return (
    <PageContainer
      title="支付配置"
      subTitle="一个支付商可配置多个独立通道；系统支持同时启用多个支付商"
      loading={loading}
      extra={[
        <Button
          key="new-provider"
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            providerForm.setFieldsValue({ adapter: adapters[0]?.value || "aixi_newbank" });
            setProviderModalOpen(true);
          }}
        >
          新增支付商
        </Button>,
      ]}
    >
      {!providers.length && !loading ? (
        <Alert type="info" showIcon message="暂无支付商，请点击右上角新增支付商。" />
      ) : null}
      {selected ? (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small">
            <Space wrap>
              <Typography.Text strong>当前支付商</Typography.Text>
              <Select
                value={selected.id}
                style={{ minWidth: 280 }}
                onChange={selectProvider}
                options={providers.map((provider) => ({
                  value: provider.id,
                  label: `${provider.name}（${provider.code}）${provider.enabled ? "" : " · 已停用"}`,
                }))}
              />
              <Tag color={selected.enabled ? "success" : "default"}>
                {selected.enabled ? "已启用" : "已停用"}
              </Tag>
              <Typography.Text type="secondary">
                已配置 {selected.channels.length} 个通道
              </Typography.Text>
            </Space>
          </Card>
          <Card title={`${selected.name}（${selected.code}）`}>
            <Alert
              type={selected.secretUnreadable ? "error" : selected.hasSecret ? "success" : "warning"}
              showIcon
              message={
                selected.secretUnreadable
                  ? "已保存的商户秘钥无法解密（加密密钥与保存时不一致）。请重新填写并保存。"
                  : selected.hasSecret
                    ? "商户秘钥如下所示；清空后保存不会覆盖现有秘钥。"
                    : "尚未配置商户秘钥，服务商和通道即使开启也不会展示给用户。"
              }
              style={{ marginBottom: 20 }}
            />
            {editAdapter && selected.adapter !== editAdapter ? (
              <Alert
                type="warning"
                showIcon
                message="支付体系已更改，保存后才会按新协议对接。密钥通常不能沿用，请重新填写对应商户秘钥/API Key。"
                style={{ marginBottom: 20 }}
              />
            ) : null}
            <Form form={form} layout="vertical" style={{ maxWidth: 920 }}>
              <Space wrap size="large" align="start">
                <Form.Item name="name" label="支付商名称" rules={[{ required: true }]}>
                  <Input style={{ width: 240 }} />
                </Form.Item>
                <Form.Item
                  name="adapter"
                  label="支付体系"
                  rules={[{ required: true }]}
                  extra="改这个才会切换 Accepto / 艾希字段；仅改名称不会换协议。"
                >
                  <Select
                    style={{ width: 260 }}
                    options={adapters}
                    onChange={(value) => applyAdapterDefaults(value)}
                  />
                </Form.Item>
                {acceptoSelected ? (
                  <Form.Item name="pid" label="Accepto App ID (pid)" rules={[{ required: true }]}>
                    <Input style={{ width: 240 }} />
                  </Form.Item>
                ) : (
                  <Form.Item name="appId" label="商户号 appId" rules={[{ required: true }]}>
                    <Input style={{ width: 240 }} />
                  </Form.Item>
                )}
                <Form.Item name="secret" label={acceptoSelected ? "API Key (sk_live_...)" : "商户秘钥"}>
                  <Input
                    style={{ width: 360 }}
                    placeholder={selected.hasSecret ? "留空保持不变" : "请输入商户秘钥"}
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item name="enabled" label="启用服务商" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Space>
              {acceptoSelected ? (
                <>
                  <Form.Item
                    name="submitUrl"
                    label="易支付提交地址"
                    extra="默认 https://api.accepto.io/submit.php"
                    rules={[{ required: true }, { type: "url" }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="apiBaseUrl"
                    label="Accepto API 根地址"
                    extra="用于 GET /api/checkout/{id} 查单兜底"
                    rules={[{ required: true }, { type: "url" }]}
                  >
                    <Input />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    name="createOrderUrl"
                    label="支付下单地址"
                    rules={[{ required: true }, { type: "url" }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="queryOrderUrl"
                    label="支付订单查询地址"
                    rules={[{ required: true }, { type: "url" }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="balanceUrl" label="查询商户余额地址" rules={[{ type: "url" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="callbackIp"
                    label="平台提供的回调 IP"
                    extra="当前以 MD5 签名作为回调鉴权依据；该 IP 留作部署和排查记录。"
                  >
                    <Input style={{ width: 300 }} />
                  </Form.Item>
                </>
              )}
              <Space>
                <Button type="primary" loading={saving} onClick={() => void saveProvider()}>
                  保存服务商配置
                </Button>
                {!acceptoSelected ? (
                  <Button
                    disabled={!selected.hasSecret}
                    loading={balanceLoading}
                    onClick={() => void queryBalance()}
                  >
                    测试并查询余额
                  </Button>
                ) : null}
              </Space>
              {balance ? (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginTop: 16 }}
                  message={`商户余额：${balance.amt ?? "-"} 元`}
                  description={
                    <Space wrap>
                      <span>商户：{balance.userName || "-"}</span>
                      <Typography.Text copyable>appId：{balance.appId || "-"}</Typography.Text>
                    </Space>
                  }
                />
              ) : null}
            </Form>
          </Card>

          <Card
            title={`${selected.name} 的支付通道`}
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  channelForm.setFieldsValue({
                    currency: "CNY",
                    method: acceptoSelected ? "crypto" : "wechat_qr",
                    code: acceptoSelected ? "usdt" : undefined,
                    name: acceptoSelected ? "加密货币" : undefined,
                    sortOrder: selected.channels.length * 10 + 10,
                  });
                  setChannelModalOpen(true);
                }}
              >
                新增通道
              </Button>
            }
          >
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="结账页按排序数字从小到大展示，跨支付商全局生效。可用上移/下移，或直接改数字让加密货币排在微信、支付宝前面。"
            />
            <Table<Channel>
              rowKey="id"
              pagination={false}
              dataSource={selected.channels}
              columns={[
                {
                  title: "顺序",
                  width: 168,
                  render: (_, channel, index) => (
                    <Space size={4}>
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => void moveChannel(index, -1)}
                      />
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === selected.channels.length - 1}
                        onClick={() => void moveChannel(index, 1)}
                      />
                      <InputNumber
                        min={0}
                        precision={0}
                        style={{ width: 72 }}
                        value={channel.sortOrder}
                        onChange={(value) => {
                          if (value != null && value !== channel.sortOrder) {
                            void updateChannel(channel, { sortOrder: value });
                          }
                        }}
                      />
                    </Space>
                  ),
                },
                {
                  title: "通道名称",
                  dataIndex: "name",
                  render: (_, channel) => (
                    <Input
                      defaultValue={channel.name}
                      maxLength={128}
                      style={{ minWidth: 140 }}
                      onPressEnter={(event) => event.currentTarget.blur()}
                      onBlur={(event) => {
                        const name = event.currentTarget.value.trim();
                        if (!name) {
                          event.currentTarget.value = channel.name;
                          message.warning("通道名称不能为空");
                          return;
                        }
                        if (name !== channel.name) {
                          void updateChannel(channel, { name });
                        }
                      }}
                    />
                  ),
                },
                {
                  title: "编码",
                  dataIndex: "code",
                  render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
                },
                {
                  title: "方式",
                  dataIndex: "method",
                  render: (value) => <Tag>{value}</Tag>,
                },
                {
                  title: "最低金额（元）",
                  render: (_, channel) => (
                    <InputNumber
                      min={0.01}
                      precision={2}
                      value={Number(yuan(channel.minCents))}
                      onChange={(value) => {
                        if (value != null) void updateChannel(channel, { minCents: Math.round(value * 100) });
                      }}
                    />
                  ),
                },
                {
                  title: "最高金额（元）",
                  render: (_, channel) => (
                    <InputNumber
                      min={0.01}
                      precision={2}
                      value={Number(yuan(channel.maxCents))}
                      onChange={(value) => {
                        if (value != null) void updateChannel(channel, { maxCents: Math.round(value * 100) });
                      }}
                    />
                  ),
                },
                { title: "币种", dataIndex: "currency", width: 80 },
                {
                  title: "启用",
                  render: (_, channel) => (
                    <Switch
                      checked={channel.enabled}
                      onChange={(enabled) => void updateChannel(channel, { enabled })}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Space>
      ) : null}

      <Modal
        title="新增支付商"
        open={providerModalOpen}
        confirmLoading={saving}
        onOk={() => void createProvider()}
        onCancel={() => setProviderModalOpen(false)}
        destroyOnHidden
        width={720}
      >
        <Form form={providerForm} layout="vertical" preserve={false}>
          <Space wrap align="start">
            <Form.Item
              name="code"
              label="支付商编码"
              rules={[
                { required: true },
                { pattern: /^[a-z0-9_-]+$/, message: "只能使用小写字母、数字、下划线和短横线" },
              ]}
              extra="系统内唯一，例如 aixi_backup"
            >
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="name" label="支付商名称" rules={[{ required: true }]}>
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Form.Item
              name="adapter"
              label="支付体系"
              rules={[{ required: true }]}
            >
              <Select
                style={{ width: 220 }}
                options={adapters}
                onChange={(value) => {
                  if (isAcceptoAdapter(value)) {
                    providerForm.setFieldsValue({
                      submitUrl: "https://api.accepto.io/submit.php",
                      apiBaseUrl: "https://api.accepto.io",
                    });
                  }
                }}
              />
            </Form.Item>
          </Space>
          {isAcceptoAdapter(createAdapter) ? (
            <>
              <Space wrap align="start">
                <Form.Item name="pid" label="Accepto App ID (pid)" rules={[{ required: true }]}>
                  <Input style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name="secret" label="API Key (sk_live_...)" rules={[{ required: true }]}>
                  <Input style={{ width: 360 }} autoComplete="off" />
                </Form.Item>
              </Space>
              <Form.Item
                name="submitUrl"
                label="易支付提交地址"
                rules={[{ required: true }, { type: "url" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="apiBaseUrl"
                label="Accepto API 根地址"
                rules={[{ required: true }, { type: "url" }]}
              >
                <Input />
              </Form.Item>
            </>
          ) : (
            <>
              <Space wrap align="start">
                <Form.Item name="appId" label="商户号 appId" rules={[{ required: true }]}>
                  <Input style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name="secret" label="商户秘钥" rules={[{ required: true }]}>
                  <Input style={{ width: 360 }} autoComplete="off" />
                </Form.Item>
              </Space>
              <Form.Item name="createOrderUrl" label="支付下单地址" rules={[{ required: true }, { type: "url" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="queryOrderUrl" label="订单查询地址" rules={[{ required: true }, { type: "url" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="balanceUrl" label="余额查询地址" rules={[{ type: "url" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="callbackIp" label="回调 IP">
                <Input style={{ width: 300 }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title={`为 ${selected?.name || ""} 新增支付通道`}
        open={channelModalOpen}
        confirmLoading={saving}
        onOk={() => void createChannel()}
        onCancel={() => setChannelModalOpen(false)}
        destroyOnHidden
      >
        <Form form={channelForm} layout="vertical" preserve={false}>
          <Space wrap align="start">
            <Form.Item name="code" label="通道编码" rules={[{ required: true }]}>
              <Input style={{ width: 180 }} placeholder="例如 usdt 或 6608" />
            </Form.Item>
            <Form.Item name="name" label="通道名称" rules={[{ required: true }]}>
              <Input style={{ width: 220 }} placeholder="例如 加密货币 / 微信扫码" />
            </Form.Item>
          </Space>
          <Space wrap align="start">
            <Form.Item name="method" label="支付方式" rules={[{ required: true }]}>
              <Select
                style={{ width: 200 }}
                options={[
                  { value: "wechat_qr", label: "微信扫码" },
                  { value: "alipay_native", label: "支付宝原生" },
                  { value: "crypto", label: "加密货币" },
                  { value: "other", label: "其他" },
                ]}
              />
            </Form.Item>
            <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
              <Select
                style={{ width: 120 }}
                options={[
                  { value: "CNY", label: "CNY" },
                  { value: "USD", label: "USD" },
                ]}
              />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序">
              <InputNumber precision={0} />
            </Form.Item>
          </Space>
          <Space wrap align="start">
            <Form.Item name="minYuan" label="最低金额" rules={[{ required: true }]}>
              <InputNumber min={0.01} precision={2} />
            </Form.Item>
            <Form.Item
              name="maxYuan"
              label="最高金额"
              dependencies={["minYuan"]}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (value == null || Number(value) >= Number(getFieldValue("minYuan") || 0)) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("最高金额不能低于最低金额"));
                  },
                }),
              ]}
            >
              <InputNumber min={0.01} precision={2} />
            </Form.Item>
          </Space>
          <Alert type="info" showIcon message="新通道创建后默认停用，确认配置无误后再启用。" />
        </Form>
      </Modal>
    </PageContainer>
  );
}
