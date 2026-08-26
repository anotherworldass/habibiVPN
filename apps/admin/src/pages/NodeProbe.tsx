import { useCallback, useEffect, useRef, useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { CloudServerOutlined } from "@ant-design/icons";
import { message } from "../lib/antd-message";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type LastRun = {
  at: string;
  ok: boolean;
  error?: string | null;
  targetCount: number;
  delayOk: number;
  delayFail: number;
  speedCount: number;
  speedMs: number | null;
};

type ProbeSchedule = {
  last_tick: { at: string; result: string } | null;
  next_probe_at: string | null;
};

type ProbeSettings = {
  enabled: boolean;
  remark: string | null;
  last_run: LastRun | null;
  schedule?: ProbeSchedule;
  probeSlotId: string | null;
  delayIntervalSec: number;
  speedIntervalSec: number;
  delayUrl: string;
  speedUrl: string;
  speedBytes: number;
  speedEnabled: boolean;
  delayTimeoutMs: number;
  speedTimeoutMs: number;
  delayConcurrency: number;
  downFailStreak: number;
  unstableWindowMin: number;
  unstableSuccessRate: number;
  delayP95Ms: number;
  slowMbps: number;
  slowStreak: number;
  alertCooldownSec: number;
  regionDigestMin: number;
  mihomoApiUrl: string;
  mihomoSecret: string;
  mixedPort: number;
  telegramChatId: string | null;
};

type TargetRow = {
  id: string;
  name: string;
  region: string;
  protocol: string;
  server: string;
  port: number;
  wireraw_name: string | null;
  last_ok: boolean | null;
  last_tcp_ms: number | null;
  last_delay_ms: number | null;
  last_download_mbps: number | null;
  last_error: string | null;
  last_probed_at: string | null;
};

type IncidentRow = {
  id: string;
  kind: string;
  region: string | null;
  summary: string;
  opened_at: string;
  closed_at: string | null;
  target: { name: string; protocol: string; region: string } | null;
};

const PROBE_ERR: Record<string, string> = {
  "node_probe.slot_not_found":
    "找不到这条槽。请到用户「订阅详情」复制「槽位 ID」，不要复制用户 ID 或本地套餐 ID。",
  "node_probe.got_plan_id":
    "这是本地套餐 ID，不是槽位 ID。请到订阅详情复制「槽位 ID」。",
  "node_probe.user_no_slot": "这个用户还没有套餐槽，先开通套餐再填。",
  "node_probe.slot_no_subscription":
    "槽找到了，但还没有订阅链接。请先同步/开通该槽。",
  "node_probe.slot_disabled": "这条槽不是 active 状态。",
  "node_probe.slot_missing": "还没配置探针槽位。",
  "node_probe.mihomo_unreachable":
    "连不上本机 mihomo（默认 127.0.0.1:19090）。生产机仓库根目录执行：docker compose -p habibivpn-probe -f docker-compose.probe.yml up -d",
  "node_probe.subscription_fetch_failed": "拉不到探针槽的订阅内容。",
  "node_probe.empty_subscription": "订阅里没有可用节点。",
  disabled: "定时探测未启用（请保存开关）",
  skipped_interval: "间隔未到，本轮跳过",
  busy: "上一轮还在跑",
};

function tickText(result: string) {
  if (result === "ok") return "已完成一轮";
  return probeErrText(result);
}

function probeErrText(code: string) {
  if (
    /Connection is closed|redis\.(connect_timeout|command_timeout|disconnected)|NOAUTH|HELLO must be called/i.test(
      code,
    )
  ) {
    return "Redis 连不上。生产 .env 把 REDIS_URL 写成 redis://:密码@127.0.0.1:6379（冒号不能少）后重新部署。探测本身已改为不依赖 Redis 锁。";
  }
  const hit = Object.keys(PROBE_ERR)
    .sort((a, b) => b.length - a.length)
    .find((k) => code === k || code.startsWith(`${k}:`) || code.startsWith(`${k} `));
  return hit ? PROBE_ERR[hit] : code;
}

export default function NodeProbePage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [schedule, setSchedule] = useState<ProbeSchedule | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);

  const loadSettings = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await adminFetch<ProbeSettings>("/admin/v1/node-probe/settings", {
        signal: AbortSignal.timeout(12_000),
      });
      setLastRun(cfg.last_run);
      setSchedule(cfg.schedule || null);
      form.setFieldsValue({
        enabled: cfg.enabled,
        remark: cfg.remark || "",
        probeSlotId: cfg.probeSlotId || "",
        telegramChatId: cfg.telegramChatId || "",
        delayUrl: cfg.delayUrl,
        speedUrl: cfg.speedUrl || "",
        speedEnabled: cfg.speedEnabled,
        delayIntervalSec: cfg.delayIntervalSec,
        speedIntervalSec: cfg.speedIntervalSec,
        delayConcurrency: cfg.delayConcurrency,
        speedBytes: cfg.speedBytes,
        downFailStreak: cfg.downFailStreak,
        delayP95Ms: cfg.delayP95Ms,
        slowMbps: cfg.slowMbps,
        mixedPort: cfg.mixedPort,
        mihomoApiUrl: cfg.mihomoApiUrl,
        mihomoSecret: cfg.mihomoSecret,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [form]);

  const loadTables = useCallback(async () => {
    try {
      const [t, i] = await Promise.all([
        adminFetch<{ items: TargetRow[] }>("/admin/v1/node-probe/targets"),
        adminFetch<{ items: IncidentRow[] }>("/admin/v1/node-probe/incidents?open=1"),
      ]);
      setTargets(t.items);
      setIncidents(i.items);
    } catch {
      /* ignore table errors on first load */
    }
  }, []);

  const statusInflight = useRef(false);
  const loadStatus = useCallback(async () => {
    if (!getProjectId() || statusInflight.current) return;
    statusInflight.current = true;
    try {
      const cfg = await adminFetch<ProbeSettings>("/admin/v1/node-probe/settings", {
        signal: AbortSignal.timeout(8_000),
      });
      setLastRun(cfg.last_run);
      setSchedule(cfg.schedule || null);
    } catch {
      /* ignore poll errors */
    } finally {
      statusInflight.current = false;
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadTables();
  }, [loadSettings, loadTables]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadStatus();
      void loadTables();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [loadStatus, loadTables]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminFetch("/admin/v1/node-probe/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...values,
          probeSlotId: values.probeSlotId?.trim() || null,
          telegramChatId: values.telegramChatId?.trim() || null,
          remark: values.remark?.trim() || null,
        }),
      });
      message.success(
        values.enabled ? "已保存，约 20 秒内会自动跑第一轮" : "已保存",
      );
      await loadSettings();
    } catch (e) {
      message.error(e instanceof Error ? probeErrText(e.message) : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (includeSpeed: boolean) => {
    setRunning(true);
    try {
      const run = await adminFetch<LastRun>("/admin/v1/node-probe/run", {
        method: "POST",
        body: JSON.stringify({ include_speed: includeSpeed }),
      });
      setLastRun(run);
      message.success(
        run.ok
          ? `探测完成：${run.delayOk} 通 / ${run.delayFail} 失败`
          : probeErrText(run.error || "探测失败"),
      );
      await loadTables();
    } catch (e) {
      message.error(e instanceof Error ? probeErrText(e.message) : "探测失败");
    } finally {
      setRunning(false);
    }
  };

  const testTg = async () => {
    try {
      const chatId = form.getFieldValue("telegramChatId");
      await adminFetch("/admin/v1/node-probe/test-telegram", {
        method: "POST",
        body: JSON.stringify({ chat_id: chatId || undefined }),
      });
      message.success("测试消息已发送");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "发送失败");
    }
  };

  return (
    <PageContainer
      title="节点探测"
      extra={
        <Space>
          <Button
            onClick={() => {
              void loadStatus();
              void loadTables();
            }}
          >
            刷新结果
          </Button>
          <Button loading={running} onClick={() => void runNow(false)}>
            立即探测
          </Button>
          <Button loading={running} onClick={() => void runNow(true)}>
            探测并测速
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        icon={<CloudServerOutlined />}
        style={{ marginBottom: 16 }}
        message="境外机房经本机 mihomo 做协议 URL-test。测的是节点自身是否健康，不是国内用户翻墙质量。H5 /status 未挂导航，仅内部观察。"
      />
      {schedule?.last_tick && (
        <Alert
          type={schedule.last_tick.result === "disabled" ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 16 }}
          message={`定时任务心跳 ${new Date(schedule.last_tick.at).toLocaleString()} · ${tickText(
            schedule.last_tick.result,
          )}${
            schedule.next_probe_at
              ? ` · 下次探测约 ${new Date(schedule.next_probe_at).toLocaleString()}`
              : ""
          }`}
        />
      )}
      {lastRun && (
        <Alert
          type={lastRun.ok ? "success" : "warning"}
          showIcon
          style={{ marginBottom: 16 }}
          message={`上次探测 ${new Date(lastRun.at).toLocaleString()} · ${
            lastRun.ok ? "成功" : probeErrText(lastRun.error || "失败")
          } · ${lastRun.delayOk}/${lastRun.targetCount} 通${
            lastRun.speedCount ? ` · 测速 ${lastRun.speedCount}` : ""
          }`}
        />
      )}
      <Tabs
        items={[
          {
            key: "settings",
            label: "配置",
            children: (
              <Card loading={loading}>
                <Form form={form} layout="vertical" onFinish={() => void onSave()}>
                  <Form.Item
                    name="enabled"
                    label="启用定时探测"
                    extra="保存打开后约 20 秒内会跑第一轮，之后按「延迟间隔」自动探测。上次探测不会在间隔内重复刷。"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    name="probeSlotId"
                    label="探针槽位 ID"
                    extra="到 Habibi 用户 → 订阅详情，复制「槽位 ID」。不要复制用户 ID、本地套餐 ID、usr-xxx。槽必须是 active 且已有订阅链接。"
                    rules={[{ required: true, message: "填写探针槽位" }]}
                  >
                    <Input placeholder="槽位 ID（cuid）" />
                  </Form.Item>
                  <Form.Item
                    name="telegramChatId"
                    label="运维群 chat_id"
                    extra="同一条故障只推一次，恢复后再推；同轮测速异常会合并成一条。"
                  >
                    <Input placeholder="-100xxxxxxxxxx" />
                  </Form.Item>
                  <Space wrap style={{ marginBottom: 16 }}>
                    <Button onClick={() => void testTg()}>发送测试消息</Button>
                    <Typography.Text type="secondary">
                      先把项目 Telegram Bot 拉进群，再填 chat_id
                    </Typography.Text>
                  </Space>
                  <Form.Item name="delayUrl" label="URL-test 地址">
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="speedUrl"
                    label="测速 URL"
                    extra="留空则只测延迟。建议自建 1MB 文件。"
                  >
                    <Input placeholder="https://example.com/1mb.bin" />
                  </Form.Item>
                  <Form.Item name="speedEnabled" label="启用测速" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Space wrap>
                    <Form.Item name="delayIntervalSec" label="延迟间隔（秒）">
                      <InputNumber min={60} max={3600} />
                    </Form.Item>
                    <Form.Item name="speedIntervalSec" label="测速间隔（秒）">
                      <InputNumber min={900} max={86400} />
                    </Form.Item>
                    <Form.Item name="delayConcurrency" label="延迟并发">
                      <InputNumber min={1} max={8} />
                    </Form.Item>
                    <Form.Item name="speedBytes" label="测速字节">
                      <InputNumber min={262144} max={5242880} step={262144} />
                    </Form.Item>
                  </Space>
                  <Space wrap>
                    <Form.Item name="downFailStreak" label="Down 连续失败">
                      <InputNumber min={2} max={10} />
                    </Form.Item>
                    <Form.Item name="delayP95Ms" label="不稳 p95（ms）">
                      <InputNumber min={200} max={20000} />
                    </Form.Item>
                    <Form.Item name="slowMbps" label="慢速阈值 Mbps">
                      <InputNumber min={0.1} max={500} step={0.5} />
                    </Form.Item>
                    <Form.Item name="mixedPort" label="mixed-port">
                      <InputNumber min={1024} max={65535} />
                    </Form.Item>
                  </Space>
                  <Form.Item name="mihomoApiUrl" label="mihomo API">
                    <Input />
                  </Form.Item>
                  <Form.Item name="mihomoSecret" label="mihomo secret">
                    <Input.Password />
                  </Form.Item>
                  <Form.Item name="remark" label="备注">
                    <Input />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    保存
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: "targets",
            label: `探测结果 (${targets.length})`,
            children: (
              <Table
                rowKey="id"
                size="small"
                dataSource={targets}
                pagination={{ pageSize: 50 }}
                columns={[
                  { title: "名称", dataIndex: "name", ellipsis: true },
                  { title: "地区", dataIndex: "region", width: 72 },
                  { title: "协议", dataIndex: "protocol", width: 100 },
                  {
                    title: "状态",
                    width: 80,
                    render: (_, r) =>
                      r.last_ok == null ? (
                        <Tag>未测</Tag>
                      ) : r.last_ok ? (
                        <Tag color="green">通</Tag>
                      ) : (
                        <Tag color="red">失败</Tag>
                      ),
                  },
                  { title: "延迟 ms", dataIndex: "last_delay_ms", width: 90 },
                  { title: "TCP ms", dataIndex: "last_tcp_ms", width: 80 },
                  { title: "Mbps", dataIndex: "last_download_mbps", width: 80 },
                  { title: "错误", dataIndex: "last_error", ellipsis: true },
                  {
                    title: "探测时间",
                    dataIndex: "last_probed_at",
                    width: 170,
                    render: (v: string | null) =>
                      v ? new Date(v).toLocaleString() : "—",
                  },
                ]}
              />
            ),
          },
          {
            key: "incidents",
            label: `进行中 (${incidents.length})`,
            children: (
              <>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                  这是还没关掉的告警单，不是「现在一定挂了」。类型
                  Down：连续探测失败；不稳：近 15 分钟窗口里波动，当前可能已通；慢速：等下次测速合格才关。节点恢复后 Down 会自动关掉。
                </Typography.Paragraph>
              <Table
                rowKey="id"
                size="small"
                dataSource={incidents}
                pagination={false}
                columns={[
                  {
                    title: "类型",
                    dataIndex: "kind",
                    width: 90,
                    render: (k: string) =>
                      k === "down" ? "Down" : k === "unstable" ? "不稳" : k === "slow" ? "慢速" : k,
                  },
                  { title: "地区", dataIndex: "region", width: 72 },
                  {
                    title: "节点",
                    render: (_, r) => r.target?.name || "—",
                    ellipsis: true,
                  },
                  { title: "摘要", dataIndex: "summary", ellipsis: true },
                  {
                    title: "开始",
                    dataIndex: "opened_at",
                    width: 170,
                    render: (v: string) => new Date(v).toLocaleString(),
                  },
                ]}
              />
              </>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
