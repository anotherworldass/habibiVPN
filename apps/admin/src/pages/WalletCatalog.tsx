import { useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from "antd";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { PROJECT_CHANGE_EVENT } from "../lib/project";

type CatalogItem = {
  id: string;
  kind: "phone_credit" | "gift_card";
  name: string;
  description?: string | null;
  faceValueCents: number;
  priceCents: number;
  enabled: boolean;
  sort: number;
  stock?: number | null;
  remark?: string | null;
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

const kindLabel: Record<string, string> = {
  phone_credit: "话费",
  gift_card: "购物卡",
};

function stockLabel(stock?: number | null) {
  if (stock == null) return <Tag>不限</Tag>;
  if (stock <= 0) return <Tag color="error">售罄</Tag>;
  return <Tag color="processing">{stock}</Tag>;
}

export default function WalletCatalogPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [editing, setEditing] = useState<CatalogItem | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const limitStock = Form.useWatch("limitStock", form) as boolean | undefined;

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch<{ items: CatalogItem[] }>("/admin/v1/referral/catalog");
      setItems(res.items || []);
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

  function openCreate() {
    setEditing("new");
    form.setFieldsValue({
      kind: "phone_credit",
      name: "",
      description: "",
      faceValueCents: 1000,
      priceCents: 1000,
      enabled: true,
      sort: 0,
      limitStock: false,
      stock: 100,
      remark: "",
    });
  }

  function openEdit(item: CatalogItem) {
    setEditing(item);
    form.setFieldsValue({
      kind: item.kind,
      name: item.name,
      description: item.description || "",
      faceValueCents: item.faceValueCents,
      priceCents: item.priceCents,
      enabled: item.enabled,
      sort: item.sort,
      limitStock: item.stock != null,
      stock: item.stock ?? 100,
      remark: item.remark || "",
    });
  }

  async function onSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        kind: values.kind,
        name: values.name,
        description: values.description || null,
        face_value_cents: values.faceValueCents,
        price_cents: values.priceCents,
        enabled: values.enabled,
        sort: values.sort,
        stock: values.limitStock ? values.stock : null,
        remark: values.remark || null,
      };
      if (editing === "new") {
        await adminFetch("/admin/v1/referral/catalog", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else if (editing) {
        await adminFetch(`/admin/v1/referral/catalog/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }
      message.success("已保存");
      setEditing(null);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer
      title="兑换商品"
      subTitle="佣金可兑话费/购物卡；可设库存，下单时扣减，拒绝兑换时退回"
      extra={
        <Button type="primary" onClick={openCreate}>
          新建商品
        </Button>
      }
    >
      <Table<CatalogItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        columns={[
          {
            title: "类型",
            dataIndex: "kind",
            width: 100,
            render: (k: string) => kindLabel[k] || k,
          },
          { title: "名称", dataIndex: "name" },
          {
            title: "面值",
            dataIndex: "faceValueCents",
            width: 100,
            render: (v: number) => money(v),
          },
          {
            title: "扣费",
            dataIndex: "priceCents",
            width: 100,
            render: (v: number) => money(v),
          },
          {
            title: "库存",
            dataIndex: "stock",
            width: 90,
            render: (v: number | null | undefined) => stockLabel(v),
          },
          {
            title: "启用",
            dataIndex: "enabled",
            width: 80,
            render: (v: boolean) =>
              v ? <Tag color="success">开</Tag> : <Tag>关</Tag>,
          },
          { title: "排序", dataIndex: "sort", width: 70 },
          {
            title: "操作",
            width: 90,
            render: (_, row) => <a onClick={() => openEdit(row)}>编辑</a>,
          },
        ]}
      />

      <Modal
        title={editing === "new" ? "新建兑换商品" : "编辑兑换商品"}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => void onSave()}
        confirmLoading={saving}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "phone_credit", label: "话费" },
                { value: "gift_card", label: "购物卡" },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：10 元话费" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space wrap size="large">
            <Form.Item
              name="faceValueCents"
              label="面值（分）"
              rules={[{ required: true }]}
              extra="展示给用户的面额"
            >
              <InputNumber min={1} step={100} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item
              name="priceCents"
              label="实际扣费（分）"
              rules={[{ required: true }]}
              extra="从佣金可提现余额扣除"
            >
              <InputNumber min={1} step={100} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="sort" label="排序" rules={[{ required: true }]}>
              <InputNumber style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Space wrap size="large" align="start">
            <Form.Item
              name="limitStock"
              label="限制库存"
              valuePropName="checked"
              extra="关闭表示不限库存"
            >
              <Switch />
            </Form.Item>
            {limitStock ? (
              <Form.Item
                name="stock"
                label="库存数量"
                rules={[{ required: true, message: "请填写库存" }]}
              >
                <InputNumber min={0} step={1} style={{ width: 140 }} />
              </Form.Item>
            ) : null}
          </Space>
          <Form.Item name="remark" label="内部备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
