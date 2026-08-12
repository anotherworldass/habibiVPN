import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@ant-design/pro-components";
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Progress,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  RollbackOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { adminFetch } from "../lib/api";
import { getProjectId } from "../lib/project";

type Job = {
  id: string;
  status: string;
  text: string;
  only_can_dm: boolean;
  total_targeted: number;
  sent_count: number;
  failed_count: number;
  processed: number;
  progress_pct: number;
  delivery_count?: number;
  recalled_count?: number;
  recall_failed_count?: number;
  pending_recall?: number | null;
  recall_progress_pct?: number;
  recallable?: boolean;
  within_recall_window?: boolean;
  created_by: string | null;
  error_message: string | null;
  error_samples?: Array<{ chat_id: string; error: string; at: string }>;
  started_at: string | null;
  finished_at: string | null;
  recall_started_at?: string | null;
  recall_finished_at?: string | null;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  queued: "default",
  running: "processing",
  paused: "warning",
  completed: "success",
  cancelled: "default",
  failed: "error",
  recalling: "processing",
  recalled: "purple",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  running: "发送中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败",
  recalling: "撤回中",
  recalled: "已撤回",
};

const RECALL_ERROR_HINT: Record<string, string> = {
  "telegram.broadcast_recall_busy_send": "请先暂停或取消发送中的任务，再撤回",
  "telegram.broadcast_already_recalled": "该任务已撤回",
  "telegram.broadcast_recall_expired": "超过约 48 小时，Telegram 已无法删除",
  "telegram.broadcast_nothing_to_recall": "没有可撤回的投递记录（旧任务无 message_id）",
  "telegram.broadcast_busy": "已有发送/撤回任务进行中，请稍后再试",
};

export default function TelegramBroadcastPage() {
  const { message } = App.useApp();
  const [text, setText] = useState("");
  const [onlyCanDm, setOnlyCanDm] = useState(true);
  const [audience, setAudience] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadAudience = useCallback(async () => {
    if (!getProjectId()) return;
    try {
      const res = await adminFetch<{ count: number }>(
        `/admin/v1/telegram/broadcasts/audience?only_can_dm=${onlyCanDm ? "1" : "0"}`,
      );
      setAudience(res.count);
    } catch {
      setAudience(null);
    }
  }, [onlyCanDm]);

  const loadJobs = useCallback(async () => {
    if (!getProjectId()) {
      message.warning("请先选择项目");
      setLoading(false);
      return;
    }
    try {
      const res = await adminFetch<{ total: number; items: Job[] }>(
        "/admin/v1/telegram/broadcasts?limit=30&offset=0",
      );
      setJobs(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadAudience();
  }, [loadAudience]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Poll while any job is active (send or recall)
  useEffect(() => {
    const active = jobs.some((j) =>
      ["queued", "running", "recalling"].includes(j.status),
    );
    if (!active) return;
    const t = window.setInterval(() => void loadJobs(), 2500);
    return () => window.clearInterval(t);
  }, [jobs, loadJobs]);

  async function enqueue() {
    if (!text.trim()) {
      message.warning("请输入群发内容");
      return;
    }
    if (audience === 0) {
      message.warning("当前没有可发送订户");
      return;
    }
    setSubmitting(true);
    try {
      await adminFetch("/admin/v1/telegram/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          text: text.trim(),
          only_can_dm: onlyCanDm,
        }),
      });
      message.success("已加入发送队列，后台分批推送");
      setText("");
      void loadJobs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "创建失败";
      message.error(
        msg === "telegram.broadcast_busy"
          ? "已有任务在发送/排队/撤回，请先完成或取消"
          : msg,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function act(id: string, action: "pause" | "resume" | "cancel") {
    try {
      await adminFetch(`/admin/v1/telegram/broadcasts/${id}/${action}`, {
        method: "POST",
      });
      message.success(
        action === "pause" ? "已暂停" : action === "resume" ? "已继续" : "已取消",
      );
      void loadJobs();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    }
  }

  async function doRecall(job: Job) {
    try {
      await adminFetch(`/admin/v1/telegram/broadcasts/${job.id}/recall`, {
        method: "POST",
      });
      message.success("已开始撤回，后台分批删除");
      void loadJobs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "撤回失败";
      message.error(RECALL_ERROR_HINT[msg] || msg);
    }
  }

  return (
    <PageContainer
      title="Telegram 群发"
      subTitle="异步分批发送；完成后 48 小时内可撤回已发出消息"
      extra={
        <Link to="/telegram">
          <Button>Bot 配置 / 订户</Button>
        </Link>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card title="新建群发" size="small">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Input.TextArea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入要群发的文本（支持多行，最多 4000 字）"
              maxLength={4000}
              showCount
            />
            <Space wrap>
              <Switch checked={onlyCanDm} onChange={setOnlyCanDm} />
              <span>仅发送给可私聊订户（推荐）</span>
              <Statistic title="预计触达" value={audience ?? "—"} />
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              发送由服务端后台 worker 按游标分批执行（约每批 40 条、约 25
              条/秒）。成功投递会记录 message_id，便于撤回。遇限流会自动暂停。
            </Typography.Paragraph>
            <Button
              type="primary"
              loading={submitting}
              onClick={() => void enqueue()}
              disabled={audience === 0}
            >
              加入发送队列
            </Button>
          </Space>
        </Card>

        <Card
          size="small"
          title={`任务列表（${total}）`}
          extra={
            <Button size="small" onClick={() => void loadJobs()}>
              刷新
            </Button>
          }
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={jobs}
            pagination={false}
            size="small"
            expandable={{
              expandedRowRender: (r) => (
                <div style={{ maxWidth: 720 }}>
                  <Typography.Paragraph
                    copyable
                    style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}
                  >
                    {r.text}
                  </Typography.Paragraph>
                  {r.status === "recalling" || r.status === "recalled" ? (
                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                      撤回：{r.recalled_count ?? 0} 成功 / {r.recall_failed_count ?? 0}{" "}
                      失败
                      {r.pending_recall != null ? ` / 待处理 ${r.pending_recall}` : ""}
                    </Typography.Text>
                  ) : null}
                  {r.error_message ? (
                    <Typography.Text type="danger">
                      {r.error_message}
                    </Typography.Text>
                  ) : null}
                  {Array.isArray(r.error_samples) && r.error_samples.length > 0 ? (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {r.error_samples.slice(0, 8).map((e, i) => (
                        <li key={i}>
                          <Typography.Text type="secondary">
                            {e.chat_id}: {e.error}
                          </Typography.Text>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ),
            }}
            columns={[
              {
                title: "状态",
                width: 100,
                render: (_, r) => (
                  <Tag color={STATUS_COLOR[r.status] || "default"}>
                    {STATUS_LABEL[r.status] || r.status}
                  </Tag>
                ),
              },
              {
                title: "进度",
                width: 220,
                render: (_, r) => (
                  <div>
                    {r.status === "recalling" || r.status === "recalled" ? (
                      <>
                        <Progress
                          percent={r.recall_progress_pct ?? 0}
                          size="small"
                          status={
                            r.status === "recalling" ? "active" : "success"
                          }
                        />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          撤回 {r.recalled_count ?? 0} / 失败{" "}
                          {r.recall_failed_count ?? 0}
                        </Typography.Text>
                      </>
                    ) : (
                      <>
                        <Progress
                          percent={r.progress_pct}
                          size="small"
                          status={
                            r.status === "failed"
                              ? "exception"
                              : r.status === "running"
                                ? "active"
                                : r.status === "completed"
                                  ? "success"
                                  : "normal"
                          }
                        />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {r.sent_count} 成功 / {r.failed_count} 失败 / 共{" "}
                          {r.total_targeted}
                        </Typography.Text>
                      </>
                    )}
                  </div>
                ),
              },
              {
                title: "摘要",
                ellipsis: true,
                render: (_, r) => r.text.slice(0, 48) + (r.text.length > 48 ? "…" : ""),
              },
              {
                title: "创建",
                width: 160,
                render: (_, r) => new Date(r.created_at).toLocaleString(),
              },
              {
                title: "操作",
                width: 260,
                render: (_, r) => (
                  <Space size={4} wrap>
                    {(r.status === "queued" || r.status === "running") && (
                      <Button
                        size="small"
                        icon={<PauseCircleOutlined />}
                        onClick={() => void act(r.id, "pause")}
                      >
                        暂停
                      </Button>
                    )}
                    {r.status === "paused" && (
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={() => void act(r.id, "resume")}
                      >
                        继续
                      </Button>
                    )}
                    {!["completed", "cancelled", "recalled", "recalling"].includes(
                      r.status,
                    ) && (
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        onClick={() => void act(r.id, "cancel")}
                      >
                        取消
                      </Button>
                    )}
                    {r.recallable ? (
                      <Popconfirm
                        title="撤回这条群发？"
                        description={`将删除约 ${r.pending_recall ?? r.delivery_count ?? r.sent_count} 条已发出私信（约 48 小时内有效）`}
                        okText="开始撤回"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => doRecall(r)}
                      >
                        <Button size="small" danger icon={<RollbackOutlined />}>
                          撤回
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </PageContainer>
  );
}
