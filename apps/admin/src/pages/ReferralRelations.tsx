import { useState } from "react";
import { PageContainer } from "@ant-design/pro-components";
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Space,
  Switch,
  Table,
  message,
} from "antd";
import { adminFetch } from "../lib/api";

type RelationRes = {
  user: {
    id: string;
    email?: string | null;
    inviteCode: string;
    invitedById?: string | null;
    promoEnabled: boolean;
    status: string;
    createdAt: string;
    promoWallet?: {
      availableCents: number;
      pendingCents: number;
      withdrawnCents: number;
      frozenCents: number;
    } | null;
    inviter?: { id: string; email?: string | null; inviteCode: string } | null;
  };
  upline: Array<{
    level: number;
    user_id: string;
    email?: string | null;
    invite_code: string;
    status: string;
  }>;
  downline_by_level: Record<string, number>;
};

function money(cents?: number) {
  return ((cents || 0) / 100).toFixed(2);
}

export default function ReferralRelationsPage() {
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<RelationRes | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(id: string) {
    if (!id.trim()) {
      message.warning("请输入用户 ID");
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch<RelationRes>(
        `/admin/v1/referral/users/${id.trim()}/relations`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      message.error(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  async function savePromo(promoEnabled: boolean, frozenCents?: number) {
    if (!data) return;
    await adminFetch(`/admin/v1/referral/users/${data.user.id}/promo`, {
      method: "PATCH",
      body: JSON.stringify({
        promo_enabled: promoEnabled,
        ...(frozenCents != null ? { frozen_cents: frozenCents } : {}),
      }),
    });
    message.success("已更新");
    await load(data.user.id);
  }

  const downlineRows = Object.entries(data?.downline_by_level || {})
    .map(([level, count]) => ({ level: Number(level), count }))
    .sort((a, b) => a.level - b.level);

  return (
    <PageContainer title="邀请关系">
      <Card>
        <Space>
          <Input
            style={{ width: 360 }}
            placeholder="用户 ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onPressEnter={() => void load(userId)}
          />
          <Button type="primary" loading={loading} onClick={() => void load(userId)}>
            查询
          </Button>
        </Space>
      </Card>

      {data && (
        <>
          <Card title="用户信息" style={{ marginTop: 16 }} loading={loading}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="邮箱">{data.user.email || "—"}</Descriptions.Item>
              <Descriptions.Item label="邀请码">{data.user.inviteCode}</Descriptions.Item>
              <Descriptions.Item label="状态">{data.user.status}</Descriptions.Item>
              <Descriptions.Item label="上级">
                {data.user.inviter
                  ? `${data.user.inviter.email || data.user.inviter.id} (${data.user.inviter.inviteCode})`
                  : "无"}
              </Descriptions.Item>
              <Descriptions.Item label="可提现">{money(data.user.promoWallet?.availableCents)}</Descriptions.Item>
              <Descriptions.Item label="待结算">{money(data.user.promoWallet?.pendingCents)}</Descriptions.Item>
              <Descriptions.Item label="已提现">{money(data.user.promoWallet?.withdrawnCents)}</Descriptions.Item>
              <Descriptions.Item label="冻结">{money(data.user.promoWallet?.frozenCents)}</Descriptions.Item>
            </Descriptions>

            <Form layout="inline" style={{ marginTop: 16 }}>
              <Form.Item label="推广资格">
                <Switch
                  checked={data.user.promoEnabled}
                  onChange={(v) => void savePromo(v)}
                />
              </Form.Item>
              <Form.Item label="冻结金额（分）">
                <InputNumber
                  min={0}
                  defaultValue={data.user.promoWallet?.frozenCents || 0}
                  onPressEnter={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    void savePromo(data.user.promoEnabled, v);
                  }}
                />
              </Form.Item>
              <span style={{ color: "#999", fontSize: 12 }}>回车保存冻结金额</span>
            </Form>
          </Card>

          <Card title="上级链（只读）" style={{ marginTop: 16 }}>
            <Table
              size="small"
              rowKey="user_id"
              pagination={false}
              dataSource={data.upline}
              columns={[
                { title: "层级", dataIndex: "level", width: 80 },
                { title: "邮箱", dataIndex: "email" },
                { title: "邀请码", dataIndex: "invite_code" },
                { title: "状态", dataIndex: "status", width: 100 },
              ]}
            />
          </Card>

          <Card title="下级人数" style={{ marginTop: 16 }}>
            <Table
              size="small"
              rowKey="level"
              pagination={false}
              dataSource={downlineRows}
              columns={[
                { title: "层级", dataIndex: "level" },
                { title: "人数", dataIndex: "count" },
              ]}
            />
          </Card>
        </>
      )}
    </PageContainer>
  );
}
