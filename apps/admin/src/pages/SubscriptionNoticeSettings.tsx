import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Radio,
  Space,
  Switch,
  Tabs,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  PlusOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

const CLIENT_LABELS: Record<string, string> = {
  shadowrocket: "Shadowrocket",
  clash: "Clash / Mihomo",
  hiddify: "Hiddify",
  v2ray: "Xray / V2Ray",
  surge: "Surge",
  quantumult_x: "Quantumult X",
};

type NodeNameConfig = {
  project_id: string;
  key: string;
  remark: string | null;
  mode: "original" | "zh_region" | "code_region";
};

type NoticeClientBlock = {
  enabled: boolean;
  items: string[];
  profile_title?: string;
};

type NoticeConfig = {
  project_id: string;
  key: string;
  enabled: boolean;
  remark: string | null;
  by_client: Record<string, NoticeClientBlock>;
  item_max: number;
  items_max: number;
  profile_title_max?: number;
  available_clients: string[];
};

const CLIENT_IDS = Object.keys(CLIENT_LABELS);

function emptyByClient(): Record<string, NoticeClientBlock> {
  const out: Record<string, NoticeClientBlock> = {};
  for (const id of CLIENT_IDS) {
    out[id] = { enabled: false, items: [""], profile_title: "" };
  }
  return out;
}

export default function SubscriptionNoticeSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [meta, setMeta] = useState({
    itemMax: 80,
    itemsMax: 15,
    titleMax: 80,
    availableClients: Object.keys(CLIENT_LABELS),
  });
  const [form] = Form.useForm();
  const [nameForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [cfg, nameCfg] = await Promise.all([
        adminFetch<NoticeConfig>("/admin/v1/settings/subscription/notice"),
        adminFetch<NodeNameConfig>(
          "/admin/v1/settings/subscription/node-name",
        ),
      ]);
      const available = cfg.available_clients?.length
        ? cfg.available_clients
        : CLIENT_IDS;
      setMeta({
        itemMax: cfg.item_max,
        itemsMax: cfg.items_max,
        titleMax: cfg.profile_title_max || 80,
        availableClients: available,
      });
      const byClient = emptyByClient();
      for (const id of available) {
        const block = cfg.by_client?.[id];
        byClient[id] = {
          enabled: !!block?.enabled,
          items: block?.items?.length ? block.items : [""],
          profile_title: block?.profile_title || "",
        };
      }
      form.setFieldsValue({
        by_client: byClient,
        remark: cfg.remark || "",
      });
      nameForm.setFieldsValue({
        mode: nameCfg.mode || "original",
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [form, nameForm]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const values = await form.validateFields();
    const raw = (values.by_client || {}) as Record<string, NoticeClientBlock>;
    const byClient: Record<string, NoticeClientBlock> = {};
    for (const id of meta.availableClients) {
      const items = (raw[id]?.items || [])
        .map((s) => (s || "").trim())
        .filter(Boolean);
      const enabled = !!raw[id]?.enabled;
      if (enabled && !items.length) {
        message.error(
          `${CLIENT_LABELS[id] || id} 已启用，请至少填写一条说明文案`,
        );
        return;
      }
      byClient[id] = {
        enabled,
        items,
        profile_title: (raw[id]?.profile_title || "").trim(),
      };
    }
    setSaving(true);
    try {
      await adminFetch("/admin/v1/settings/subscription/notice", {
        method: "PUT",
        body: JSON.stringify({
          by_client: byClient,
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

  const onSaveName = async () => {
    const values = await nameForm.validateFields();
    setSavingName(true);
    try {
      await adminFetch("/admin/v1/settings/subscription/node-name", {
        method: "PUT",
        body: JSON.stringify({ mode: values.mode }),
      });
      message.success("节点名称已保存（本进程立即生效）");
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <PageContainer
      title="订阅转换"
      subTitle="按顶部当前项目配置；影响 /api/v1/sub 转换订阅的节点名与说明节点"
      loading={loading}
    >
      <Card
        title={
          <span>
            <FontSizeOutlined style={{ marginRight: 8 }} />
            节点名称
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="优化上游不够友好的节点名"
          description="按节点备注、国旗或主机地区识别国家/地区，再按该地区内顺序编号。识别不出则归为「其他 / UN」。说明节点不受此项影响。"
        />
        <Form
          form={nameForm}
          layout="vertical"
          initialValues={{ mode: "original" }}
          style={{ maxWidth: 640 }}
        >
          <Form.Item
            name="mode"
            label="命名模式"
            rules={[{ required: true, message: "请选择模式" }]}
          >
            <Radio.Group
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <Radio value="original">
                原始名称
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  保持上游节点名不变
                </Typography.Text>
              </Radio>
              <Radio value="zh_region">
                中文地区 + 编号
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  香港 01、日本 02
                </Typography.Text>
              </Radio>
              <Radio value="code_region">
                地区编码
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  HK01、JP02
                </Typography.Text>
              </Radio>
            </Radio.Group>
          </Form.Item>
          <Button
            type="primary"
            loading={savingName}
            onClick={() => void onSaveName()}
          >
            保存节点名称
          </Button>
        </Form>
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="说明节点怎么工作"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li>
              每个客户端单独开关、单独写文案；未启用或文案为空的客户端不插入。
            </li>
            <li>
              每条填写的文案会
              <Typography.Text strong> 多复制一条真实节点 </Typography.Text>
              ，插到该客户端转换订阅最前面，节点名就是文案。
            </li>
            <li>原有可用节点全部保留；用户误点说明节点仍可连通。</li>
            <li>顺序即展示顺序：第 1 条在最顶上。</li>
            <li>
              显示名称和说明文案都可用变量：
              <Typography.Text code>{"{plan_name}"}</Typography.Text>{" "}
              套餐名、
              <Typography.Text code>{"{site_name}"}</Typography.Text>{" "}
              站点名、
              <Typography.Text code>{"{expire_date}"}</Typography.Text>{" "}
              到期日。
            </li>
          </ul>
        }
      />

      <Card
        title={
          <span>
            <FileTextOutlined style={{ marginRight: 8 }} />
            说明文案
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            by_client: emptyByClient(),
            remark: "",
          }}
          style={{ maxWidth: 720 }}
        >
          <Tabs
            items={meta.availableClients.map((id) => ({
              key: id,
              label: CLIENT_LABELS[id] || id,
              children: (
                <div>
                  <Form.Item
                    name={["by_client", id, "profile_title"]}
                    label="订阅显示名称"
                    extra="客户端里看到的套餐/订阅名。留空则默认 {site_name}-{plan_name}"
                    rules={[
                      {
                        max: meta.titleMax,
                        message: `不超过 ${meta.titleMax} 字`,
                      },
                    ]}
                  >
                    <Input
                      placeholder="{site_name}-{plan_name}"
                      maxLength={meta.titleMax}
                    />
                  </Form.Item>
                  <Form.Item
                    name={["by_client", id, "enabled"]}
                    label="启用该客户端说明节点"
                    valuePropName="checked"
                    extra="关闭后，这个客户端的转换订阅不插入说明节点"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.List name={["by_client", id, "items"]}>
                    {(fields, { add, remove, move }) => (
                      <div>
                        <Typography.Text
                          style={{ display: "block", marginBottom: 8 }}
                        >
                          文案列表（最多 {meta.itemsMax} 条，每条不超过{" "}
                          {meta.itemMax} 字）
                        </Typography.Text>
                        {fields.map((field, index) => (
                          <Space
                            key={field.key}
                            align="start"
                            style={{
                              display: "flex",
                              marginBottom: 8,
                              width: "100%",
                            }}
                          >
                            <Typography.Text
                              type="secondary"
                              style={{ width: 28, lineHeight: "32px" }}
                            >
                              {index + 1}.
                            </Typography.Text>
                            <Form.Item
                              {...field}
                              style={{ flex: 1, marginBottom: 0 }}
                              rules={[
                                {
                                  max: meta.itemMax,
                                  message: `不超过 ${meta.itemMax} 字`,
                                },
                              ]}
                            >
                              <Input
                                placeholder="例如：当前套餐 {plan_name} · 到期 {expire_date}"
                                maxLength={meta.itemMax}
                              />
                            </Form.Item>
                            <Button
                              type="text"
                              icon={<UpOutlined />}
                              disabled={index === 0}
                              onClick={() => move(index, index - 1)}
                            />
                            <Button
                              type="text"
                              icon={<DownOutlined />}
                              disabled={index === fields.length - 1}
                              onClick={() => move(index, index + 1)}
                            />
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              disabled={fields.length <= 1}
                              onClick={() => remove(field.name)}
                            />
                          </Space>
                        ))}
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          disabled={fields.length >= meta.itemsMax}
                          onClick={() => add("")}
                        >
                          添加文案
                        </Button>
                      </div>
                    )}
                  </Form.List>
                </div>
              ),
            }))}
          />
          <Form.Item name="remark" label="备注" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} maxLength={255} placeholder="仅后台可见" />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void onSave()}>
            保存说明文案
          </Button>
        </Form>
      </Card>
    </PageContainer>
  );
}
