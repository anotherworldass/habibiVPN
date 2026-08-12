import { CheckOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { Button, Descriptions, Modal, Space, Table, Tag, Typography } from "antd";

export type EntitlementLedgerDetailRow = {
  id: string;
  user_id?: string;
  slot_id: string;
  reason: string;
  reason_label: string;
  change_flags: Record<string, boolean>;
  plan_id_before: string | null;
  plan_id_after: string | null;
  plan_before?: { id: string; code: string; name: string } | null;
  plan_after?: { id: string; code: string; name: string } | null;
  expires_at_before: string | null;
  expires_at_after: string | null;
  expire_delta_seconds: number | null;
  data_limit_before: string | null;
  data_limit_after: string | null;
  data_limit_delta: string | null;
  status_before?: string | null;
  status_after?: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  remark?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  user?: { id: string; uid: number; email?: string | null };
};

const FLAG_LABEL: Record<string, string> = {
  created: "开槽",
  renew: "续费",
  plan_change: "改套餐",
  traffic_adjust: "流量",
  expire_adjust: "到期",
  status_change: "状态",
  clawback: "扣回",
};

function formatBytes(raw: string | null | undefined) {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const abs = Math.abs(n);
  if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (abs >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatDeltaSeconds(sec: number | null | undefined) {
  if (sec == null) return "—";
  const sign = sec > 0 ? "+" : sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  if (abs >= 86400) return `${sign}${(abs / 86400).toFixed(1)} 天`;
  if (abs >= 3600) return `${sign}${(abs / 3600).toFixed(1)} 小时`;
  if (abs >= 60) return `${sign}${Math.round(abs / 60)} 分`;
  return `${sign}${abs} 秒`;
}

function planLabel(
  p: { id: string; code: string; name: string } | null | undefined,
  id: string | null,
) {
  if (p) return `${p.name} (${p.code})`;
  return id || "—";
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function changeFlagTags(flags: Record<string, boolean> | undefined) {
  const keys = Object.keys(flags || {}).filter((k) => flags?.[k]);
  if (!keys.length) return "—";
  return (
    <Space size={[4, 4]} wrap>
      {keys.map((k) => (
        <Tag key={k}>{FLAG_LABEL[k] || k}</Tag>
      ))}
    </Space>
  );
}

function refLink(r: EntitlementLedgerDetailRow) {
  if (!r.ref_type && !r.ref_id) return "—";
  if (r.ref_type === "order" && r.ref_id) {
    return (
      <Link to={`/orders?q=${encodeURIComponent(r.ref_id)}`}>
        订单 {r.ref_id}
      </Link>
    );
  }
  return `${r.ref_type || "—"}:${r.ref_id || "—"}`;
}

export function EntitlementLedgerDetailModal({
  row,
  onClose,
  hideUser,
}: {
  row: EntitlementLedgerDetailRow | null;
  onClose: () => void;
  /** User detail page already has user context */
  hideUser?: boolean;
}) {
  return (
    <Modal
      title="权益流水详情"
      open={!!row}
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={800}
      destroyOnHidden
    >
      {row ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="时间" span={2}>
              {formatTime(row.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="流水 ID" span={2}>
              <Typography.Text copyable>{row.id}</Typography.Text>
            </Descriptions.Item>
            {!hideUser ? (
              <Descriptions.Item label="用户" span={2}>
                <Space>
                  {row.user_id ? (
                    <Link
                      to={`/users/detail?user=${encodeURIComponent(row.user_id)}`}
                    >
                      UID {row.user?.uid ?? "—"}
                    </Link>
                  ) : (
                    <span>UID {row.user?.uid ?? "—"}</span>
                  )}
                  <Typography.Text type="secondary">
                    {row.user?.email || row.user_id || "—"}
                  </Typography.Text>
                </Space>
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="槽 ID" span={2}>
              <Typography.Text copyable>{row.slot_id}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="原因" span={2}>
              {row.reason_label || row.reason}
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                ({row.reason})
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="变更类型" span={2}>
              {changeFlagTags(row.change_flags)}
            </Descriptions.Item>
          </Descriptions>

          <Table
            size="small"
            pagination={false}
            rowKey="field"
            rowClassName={(r) => (r.changed ? "entitlement-row-changed" : "")}
            dataSource={[
              (() => {
                const before = planLabel(row.plan_before, row.plan_id_before);
                const after = planLabel(row.plan_after, row.plan_id_after);
                return {
                  field: "套餐",
                  before,
                  after,
                  changed: before !== after,
                };
              })(),
              (() => {
                const before = formatTime(row.expires_at_before);
                const after = formatTime(row.expires_at_after);
                return {
                  field: "到期",
                  before,
                  after,
                  changed: before !== after,
                };
              })(),
              (() => {
                const before =
                  formatBytes(row.data_limit_before) +
                  (row.data_limit_before != null
                    ? ` (${row.data_limit_before} B)`
                    : "");
                const after =
                  formatBytes(row.data_limit_after) +
                  (row.data_limit_after != null
                    ? ` (${row.data_limit_after} B)`
                    : "");
                return {
                  field: "流量限额",
                  before,
                  after,
                  changed:
                    String(row.data_limit_before ?? "") !==
                    String(row.data_limit_after ?? ""),
                };
              })(),
              (() => {
                const before = row.status_before || "—";
                const after = row.status_after || "—";
                return {
                  field: "状态",
                  before,
                  after,
                  changed: before !== after,
                };
              })(),
            ]}
            columns={[
              { title: "字段", dataIndex: "field", width: 100 },
              { title: "前", dataIndex: "before" },
              { title: "后", dataIndex: "after" },
              {
                title: "变化",
                dataIndex: "changed",
                width: 64,
                align: "center",
                render: (changed: boolean) =>
                  changed ? (
                    <CheckOutlined style={{ color: "#52c41a", fontSize: 16 }} />
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ),
              },
            ]}
          />
          <style>{`
            .entitlement-row-changed > td {
              background: #f6ffed !important;
            }
          `}</style>

          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="到期 Δ">
              {formatDeltaSeconds(row.expire_delta_seconds)}
              {row.expire_delta_seconds != null ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  ({row.expire_delta_seconds} 秒)
                </Typography.Text>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="流量限额 Δ">
              {formatBytes(row.data_limit_delta)}
              {row.data_limit_delta != null ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  ({row.data_limit_delta} B)
                </Typography.Text>
              ) : null}
            </Descriptions.Item>
            <Descriptions.Item label="引用" span={2}>
              {refLink(row)}
            </Descriptions.Item>
            <Descriptions.Item label="操作者" span={2}>
              {row.actor_type
                ? `${row.actor_type}${row.actor_id ? ` / ${row.actor_id}` : ""}`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="幂等键" span={2}>
              {row.idempotency_key ? (
                <Typography.Text copyable>{row.idempotency_key}</Typography.Text>
              ) : (
                "—"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {row.remark || "—"}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ) : null}
    </Modal>
  );
}

export { FLAG_LABEL as ENTITLEMENT_CHANGE_FLAG_LABEL };
