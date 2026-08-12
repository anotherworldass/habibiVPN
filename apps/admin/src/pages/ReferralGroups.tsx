import { useEffect, useState, type ReactNode } from "react";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography } from "antd";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";

type LevelRate = { level: number; rateBps: number };

type PromoGroup = {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  enabled: boolean;
  maxLevel: number | null;
  sort: number;
  remark: string | null;
  userCount: number;
  levels: LevelRate[];
};

const { Text } = Typography;

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2);
}

function centsToYuan(cents: number) {
  return (cents / 100).toFixed(2);
}

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

export default function ReferralGroupsPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PromoGroup[]>([]);
  const [editing, setEditing] = useState<PromoGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [levels, setLevels] = useState<LevelRate[]>([]);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const list = await adminFetch<PromoGroup[]>("/admin/v1/referral/groups");
      setGroups(list);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit(g: PromoGroup) {
    setEditing(g);
    setLevels(g.levels.length ? g.levels : [{ level: 1, rateBps: 1400 }]);
    form.setFieldsValue({
      name: g.name,
      enabled: g.enabled,
      maxLevel: g.maxLevel,
      sort: g.sort,
      remark: g.remark,
    });
  }

  async function onSave() {
    if (!editing) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch(`/admin/v1/referral/groups/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: values.name,
          enabled: values.enabled,
          maxLevel: values.maxLevel ?? null,
          sort: values.sort,
          remark: values.remark ?? null,
          levels: levels.map((l, i) => ({ level: i + 1, rateBps: l.rateBps })),
        }),
      });
      message.success("已保存");
      setEditing(null);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const totalBps = levels.reduce((s, l) => s + l.rateBps, 0);

  return (
    <PageContainer title="用户组（代理等级）">
      <Card loading={loading}>
        <Text type="secondary">
          结算按受益人所属组取费率；各组可自由配置，不强制卡全局预算。改组只影响之后新订单。
        </Text>
        <Table
          style={{ marginTop: 16 }}
          rowKey="id"
          size="middle"
          pagination={false}
          dataSource={groups}
          columns={[
            {
              title: "名称",
              dataIndex: "name",
              render: (name, row) => (
                <Space>
                  <span>{name}</span>
                  {row.isDefault ? <Tag color="blue">默认</Tag> : null}
                  {!row.enabled ? <Tag color="default">已禁用</Tag> : null}
                </Space>
              ),
            },
            { title: "Code", dataIndex: "code", width: 100 },
            { title: "人数", dataIndex: "userCount", width: 80 },
            {
              title: "费率摘要",
              render: (_, row) =>
                row.levels.map((l) => `L${l.level}:${bpsToPercent(l.rateBps)}%`).join(" · ") ||
                "—",
            },
            {
              title: "合计",
              width: 100,
              render: (_, row) => {
                const t = row.levels.reduce((s, l) => s + l.rateBps, 0);
                return `${bpsToPercent(t)}%`;
              },
            },
            {
              title: "操作",
              width: 90,
              render: (_, row) => <a onClick={() => openEdit(row)}>编辑</a>,
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? `编辑用户组 · ${editing.name}` : "编辑"}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => void onSave()}
        confirmLoading={saving}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Space wrap size="large" align="start">
            <Form.Item name="name" label="名称" rules={[{ required: true }]}>
              <Input style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item
              name="maxLevel"
              label="组内最大级数"
              tooltip="留空则使用全局最大级数"
            >
              <InputNumber min={1} max={10} placeholder="全局" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="sort" label="排序">
              <InputNumber style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
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
              width: 220,
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
                onClick={() => setLevels([...levels, { level: levels.length + 1, rateBps: 0 }])}
              >
                增加一级
              </Button>
              <span>
                合计：{bpsToPercent(totalBps)}% · 100 元订单总分佣{" "}
                <Text strong>{exampleCommissionYuan(totalBps)}</Text> 元
              </span>
            </Space>
          )}
        />
      </Modal>
    </PageContainer>
  );
}
