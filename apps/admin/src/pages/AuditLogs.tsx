import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { PageContainer, ProTable } from "@ant-design/pro-components";
import { Descriptions, Modal, Space, Tag, Typography } from "antd";
import { adminFetch } from "../lib/api";

type ActorView =
  | { kind: "admin"; id: string; username: string }
  | { kind: "user"; id: string; uid: number; email: string | null };

type TargetView =
  | { kind: "user"; id: string; uid: number; email: string | null }
  | { kind: "project"; id: string; code: string; name: string };

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  actor: ActorView | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target: TargetView | null;
  meta: unknown;
  ip: string | null;
  created_at: string;
};

const ACTOR_ENUM = {
  admin: { text: "管理员" },
  user: { text: "用户" },
  system: { text: "系统" },
  payment: { text: "支付" },
} as const;

const ACTION_ENUM: Record<string, { text: string }> = {
  "announcement.create": { text: "创建公告" },
  "announcement.update": { text: "更新公告" },
  "announcement.delete": { text: "删除公告" },
  "auth.login_code_sent": { text: "发送登录验证码" },
  "auth.password_changed": { text: "用户改密" },
  "auth.password_reset": { text: "用户重置密码" },
  "auth.password_reset_by_admin": { text: "后台重置密码" },
  "auth.password_reset_requested": { text: "申请重置密码" },
  "auth.register_code_sent": { text: "发送注册验证码" },
  "campaign.create": { text: "创建活动" },
  "campaign.participate": { text: "参与活动" },
  "campaign.update": { text: "更新活动" },
  "commission.admin_invalidate": { text: "作废订单佣金" },
  "commission.admin_invalidate_ledger": { text: "作废佣金流水" },
  "commission.invalidate_order": { text: "系统作废订单佣金" },
  "commission.skip_disabled": { text: "跳过佣金（已停用）" },
  "commission.skip_group_disabled": { text: "跳过佣金（分组关闭）" },
  "coupon.create": { text: "创建优惠券" },
  "iap.apple.asn": { text: "Apple ASN 通知" },
  "iap.apple.fulfilled": { text: "Apple 内购到账" },
  "iap.google.fulfilled": { text: "Google 内购到账" },
  "invite.code_update": { text: "修改邀请码" },
  "order.entitlement_clawback": { text: "退款扣回权益" },
  "order.entitlement_clawback_failed": { text: "退款扣回失败" },
  "payment.order_provisioned": { text: "订单开通完成" },
  "payment.provider_create": { text: "新增支付通道" },
  "payment.provider_update": { text: "更新支付通道" },
  "promo.disable": { text: "关闭分销资格" },
  "promo.enable": { text: "开启分销资格" },
  "promo_group.assign": { text: "分配分销分组" },
  "redeem.batch_create": { text: "创建兑换码批次" },
  "redeem.codes_generate": { text: "生成兑换码" },
  "redeem.success": { text: "兑换成功" },
  "referral.inviter_bind": { text: "绑定邀请人" },
  "settings.auth_email.upsert": { text: "保存账号邮箱设置" },
  "settings.mail_rate_limit.upsert": { text: "保存邮件限流" },
  "settings.mail_ses.upsert": { text: "保存 SES 配置" },
  "settings.storage_s3.bindings.update": { text: "更新存储绑定" },
  "settings.storage_s3.profile.create": { text: "新增存储配置" },
  "settings.storage_s3.profile.delete": { text: "删除存储配置" },
  "settings.storage_s3.profile.test": { text: "测试存储配置" },
  "settings.storage_s3.profile.update": { text: "更新存储配置" },
  "settings.subscription_domains.upsert": { text: "保存订阅域名" },
  "settings.subscription_node_name.upsert": { text: "保存节点命名" },
  "settings.subscription_notice.upsert": { text: "保存订阅转换文案" },
  "settings.support_client_message_window.upsert": { text: "保存客服窗口" },
  "spend.fulfill": { text: "兑换履约" },
  "spend.reject": { text: "拒绝兑换" },
  "user.admin_remark_update": { text: "更新用户备注" },
  "user.preferences_updated": { text: "更新用户偏好" },
  "user.profile_updated": { text: "更新用户资料" },
  "wallet.freeze": { text: "冻结钱包" },
  "withdraw.approve": { text: "通过提现" },
  "withdraw.paid": { text: "提现已打款" },
  "withdraw.reject": { text: "拒绝提现" },
};

const ACTOR_COLOR: Record<string, string> = {
  admin: "blue",
  user: "default",
  system: "purple",
  payment: "gold",
};

function actionLabel(action: string) {
  return ACTION_ENUM[action]?.text || action;
}

function actorLabel(row: AuditRow) {
  if (row.actor?.kind === "admin") return row.actor.username;
  if (row.actor?.kind === "user") {
    return `UID ${row.actor.uid}`;
  }
  if (row.actor_type === "system") return "系统";
  if (row.actor_type === "payment") return row.actor_id || "支付";
  return row.actor_id || ACTOR_ENUM[row.actor_type as keyof typeof ACTOR_ENUM]?.text || row.actor_type;
}

function formatMeta(meta: unknown) {
  if (meta == null) return "";
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

function TargetCell({ row }: { row: AuditRow }) {
  if (row.target?.kind === "user") {
    return (
      <Space direction="vertical" size={0}>
        <Link to={`/users/detail?user=${encodeURIComponent(row.target.id)}`}>
          UID {row.target.uid}
        </Link>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {row.target.email || row.target.id.slice(0, 10)}
        </Typography.Text>
      </Space>
    );
  }
  if (row.target?.kind === "project") {
    return `${row.target.name} (${row.target.code})`;
  }
  if (row.target_type === "order" && row.target_id) {
    return (
      <Link to={`/orders?q=${encodeURIComponent(row.target_id)}`}>
        订单 {row.target_id.slice(0, 10)}…
      </Link>
    );
  }
  if (!row.target_type && !row.target_id) return "—";
  return `${row.target_type || "—"}:${row.target_id || "—"}`;
}

export default function AuditLogsPage() {
  const actionRef = useRef<ActionType>(undefined);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const columns: ProColumns<AuditRow>[] = [
    {
      title: "时间",
      dataIndex: "created_at",
      width: 170,
      valueType: "dateTimeRange",
      search: {
        transform: (value) => {
          const range = value as [string, string] | undefined;
          return {
            from: range?.[0],
            to: range?.[1],
          };
        },
      },
      render: (_, r) => new Date(r.created_at).toLocaleString(),
    },
    {
      title: "动作",
      dataIndex: "action",
      width: 200,
      valueType: "select",
      fieldProps: { showSearch: true, optionFilterProp: "label" },
      valueEnum: ACTION_ENUM,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{actionLabel(r.action)}</span>
          {ACTION_ENUM[r.action] ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.action}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: "操作人",
      dataIndex: "actor_type",
      width: 160,
      valueType: "select",
      valueEnum: ACTOR_ENUM,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <Tag color={ACTOR_COLOR[r.actor_type] || "default"}>
              {ACTOR_ENUM[r.actor_type as keyof typeof ACTOR_ENUM]?.text ||
                r.actor_type}
            </Tag>
            {r.actor?.kind === "user" ? (
              <Link to={`/users/detail?user=${encodeURIComponent(r.actor.id)}`}>
                {actorLabel(r)}
              </Link>
            ) : (
              <span>{actorLabel(r)}</span>
            )}
          </Space>
          {r.actor?.kind === "user" && r.actor.email ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.actor.email}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: "目标",
      dataIndex: "target_id",
      width: 200,
      search: false,
      render: (_, r) => <TargetCell row={r} />,
    },
    {
      title: "关键词",
      dataIndex: "q",
      hideInTable: true,
      fieldProps: { placeholder: "动作 / 操作人 ID / 目标 ID / IP" },
    },
    {
      title: "IP",
      dataIndex: "ip",
      width: 140,
      search: false,
      ellipsis: true,
      render: (_, r) => r.ip || "—",
    },
    {
      title: "附加信息",
      dataIndex: "meta",
      width: 220,
      search: false,
      ellipsis: true,
      render: (_, r) => {
        if (r.meta == null) return "—";
        const text =
          typeof r.meta === "string" ? r.meta : JSON.stringify(r.meta);
        return (
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 200 }}>
            {text}
          </Typography.Text>
        );
      },
    },
    {
      title: "操作",
      valueType: "option",
      width: 80,
      fixed: "right",
      render: (_, r) => [
        <a key="detail" onClick={() => setDetail(r)}>
          详情
        </a>,
      ],
    },
  ];

  return (
    <PageContainer
      title="操作日志"
      subTitle="全局审计记录，含管理员操作、用户行为和系统事件（不随当前项目切换过滤）"
    >
      <ProTable<AuditRow>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        search={{ labelWidth: "auto" }}
        scroll={{ x: 1200 }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true }}
        onRow={(r) => ({
          onDoubleClick: () => setDetail(r),
        })}
        request={async (params) => {
          const qs = new URLSearchParams();
          if (params.action) qs.set("action", String(params.action));
          if (params.actor_type) qs.set("actor_type", String(params.actor_type));
          if (params.q) qs.set("q", String(params.q));
          if (params.from) qs.set("from", String(params.from));
          if (params.to) qs.set("to", String(params.to));
          qs.set("limit", String(params.pageSize || 20));
          qs.set(
            "offset",
            String(((params.current || 1) - 1) * (params.pageSize || 20)),
          );
          const data = await adminFetch<{ total: number; items: AuditRow[] }>(
            `/admin/v1/audit-logs?${qs}`,
          );
          return { data: data.items, total: data.total, success: true };
        }}
      />
      <Modal
        title="操作详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {detail ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="时间">
              {new Date(detail.created_at).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="动作">
              {actionLabel(detail.action)}
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                {detail.action}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="操作人">
              {ACTOR_ENUM[detail.actor_type as keyof typeof ACTOR_ENUM]?.text ||
                detail.actor_type}
              {detail.actor?.kind === "admin"
                ? ` · ${detail.actor.username}`
                : detail.actor?.kind === "user"
                  ? ` · UID ${detail.actor.uid}`
                  : detail.actor_id
                    ? ` · ${detail.actor_id}`
                    : ""}
            </Descriptions.Item>
            <Descriptions.Item label="目标">
              <TargetCell row={detail} />
            </Descriptions.Item>
            <Descriptions.Item label="IP">{detail.ip || "—"}</Descriptions.Item>
            <Descriptions.Item label="附加信息">
              {detail.meta == null ? (
                "—"
              ) : (
                <Typography.Paragraph
                  copyable
                  style={{
                    marginBottom: 0,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {formatMeta(detail.meta)}
                </Typography.Paragraph>
              )}
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
