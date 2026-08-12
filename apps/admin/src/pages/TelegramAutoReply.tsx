import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@ant-design/pro-components";
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { message } from "../lib/antd-message";
import { PlusOutlined } from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type Rule = {
  id: string;
  keyword: string;
  match_mode: "contains" | "exact" | "starts_with";
  reply_text: string;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

const MATCH_LABEL: Record<Rule["match_mode"], string> = {
  contains: "包含",
  exact: "完全匹配",
  starts_with: "开头匹配",
};

export default function TelegramAutoReplyPage() {
  const [items, setItems] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
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
      const res = await adminFetch<{ items: Rule[] }>("/admin/v1/telegram/auto-replies");
      setItems(res.items || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      keyword: "",
      match_mode: "contains",
      reply_text: "",
      enabled: true,
      priority: 100,
    });
    setOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    form.setFieldsValue({
      keyword: r.keyword,
      match_mode: r.match_mode,
      reply_text: r.reply_text,
      enabled: r.enabled,
      priority: r.priority,
    });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await adminFetch(`/admin/v1/telegram/auto-replies/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        message.success("已更新");
      } else {
        await adminFetch("/admin/v1/telegram/auto-replies", {
          method: "POST",
          body: JSON.stringify(values),
        });
        message.success("已创建");
      }
      setOpen(false);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (r: Rule, enabled: boolean) => {
    try {
      await adminFetch(`/admin/v1/telegram/auto-replies/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "更新失败");
    }
  };

  const remove = async (r: Rule) => {
    Modal.confirm({
      title: "删除这条自动回复？",
      content: `关键词：${r.keyword}`,
      okType: "danger",
      onOk: async () => {
        await adminFetch(`/admin/v1/telegram/auto-replies/${r.id}`, { method: "DELETE" });
        message.success("已删除");
        await load();
      },
    });
  };

  return (
    <PageContainer
      title="Telegram 自动回复"
      subTitle={
        <Space>
          <Link to="/telegram">Bot 配置</Link>
          <Link to="/support/inbox">客服台</Link>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建规则
        </Button>
      }
    >
      <Card size="small">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          用户私聊发送文本时，按优先级（数字越小越先）匹配第一条启用规则并自动回复。
          <code>/start</code> 仍走欢迎语，不参与关键词匹配。
        </Typography.Paragraph>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={false}
          size="small"
          columns={[
            {
              title: "优先级",
              dataIndex: "priority",
              width: 80,
            },
            {
              title: "关键词",
              dataIndex: "keyword",
              render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
            },
            {
              title: "匹配",
              dataIndex: "match_mode",
              width: 110,
              render: (v: Rule["match_mode"]) => MATCH_LABEL[v] || v,
            },
            {
              title: "回复内容",
              dataIndex: "reply_text",
              ellipsis: true,
            },
            {
              title: "启用",
              width: 80,
              render: (_, r) => (
                <Switch checked={r.enabled} onChange={(v) => void toggleEnabled(r, v)} />
              ),
            },
            {
              title: "状态",
              width: 80,
              render: (_, r) =>
                r.enabled ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
            },
            {
              title: "操作",
              width: 140,
              render: (_, r) => (
                <Space>
                  <Button type="link" size="small" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <Button type="link" size="small" danger onClick={() => void remove(r)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "编辑自动回复" : "新建自动回复"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="keyword"
            label="关键词"
            rules={[{ required: true, message: "请输入关键词" }]}
          >
            <Input placeholder="例如：价格、客服、续费" maxLength={100} />
          </Form.Item>
          <Form.Item name="match_mode" label="匹配方式" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "contains", label: "包含（不区分大小写）" },
                { value: "exact", label: "完全匹配" },
                { value: "starts_with", label: "开头匹配" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="reply_text"
            label="回复内容"
            rules={[{ required: true, message: "请输入回复" }]}
          >
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
          <Space size="large">
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <InputNumber min={0} max={9999} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </PageContainer>
  );
}
