import { useEffect, useState } from "react";
import { PageContainer, ProCard, StatisticCard } from "@ant-design/pro-components";
import { Alert, Spin, Typography } from "antd";
import { adminFetch, unwrapList } from "../lib/api";

function formatBytes(n?: number | null) {
  if (n == null) return "-";
  const gb = n / 1024 ** 3;
  if (Math.abs(gb) >= 1) return `${gb.toFixed(2)} GB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    health: "-",
    planCount: 0,
    customerTotal: 0 as number | string,
    onlineCount: 0 as number | string,
    merchantQuota: "-",
    merchantRemaining: "-",
    merchantExpires: "-",
  });

  useEffect(() => {
    (async () => {
      try {
        const h = await adminFetch<{ ok: boolean }>("/health");
        setStats((s) => ({ ...s, health: h.ok ? "ok" : "down" }));

        const plans = unwrapList(
          await adminFetch("/admin/v1/wireraw/customer-plans"),
          ["items", "plans"],
        );
        const customers = await adminFetch<Record<string, unknown>>(
          "/admin/v1/wireraw/customers?limit=1&offset=0",
        );
        const online = await adminFetch<{ count?: number; usernames?: string[] }>(
          "/admin/v1/wireraw/customers/online?limit=1000",
        );

        let merchantQuota = "-";
        let merchantRemaining = "-";
        let merchantExpires = "-";
        try {
          const merchant = await adminFetch<{
            merchant?: {
              plan_traffic_quota_bytes?: number;
              plan_traffic_remaining_bytes?: number;
              plan_expires_at?: string;
            };
            customer_count?: number;
          }>("/admin/v1/wireraw/merchant");
          merchantQuota = formatBytes(merchant.merchant?.plan_traffic_quota_bytes);
          merchantRemaining = formatBytes(merchant.merchant?.plan_traffic_remaining_bytes);
          merchantExpires = merchant.merchant?.plan_expires_at?.slice(0, 10) || "-";
          if (typeof merchant.customer_count === "number") {
            customers.total = merchant.customer_count;
          }
        } catch {
          /* merchant endpoint optional */
        }

        setStats({
          health: h.ok ? "ok" : "down",
          planCount: plans.length,
          customerTotal:
            typeof customers.total === "number"
              ? customers.total
              : typeof customers.count === "number"
                ? customers.count
                : "-",
          onlineCount: online.count ?? online.usernames?.length ?? 0,
          merchantQuota,
          merchantRemaining,
          merchantExpires,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "load_failed";
        setError(
          msg === "wireraw.unauthorized" || msg === "http.401" || msg.includes("sdk_key")
            ? "上游 WireRaw SDK Key 无效或已吊销，总览上游数据暂不可用。请检查服务器 .env 的 WIRERAW_KEY_ID / WIRERAW_KEY_SECRET。"
            : msg,
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageContainer title="总览">
      {error && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载失败"
          description={error}
        />
      )}
      <Spin spinning={loading}>
        <StatisticCard.Group direction="row">
          <StatisticCard statistic={{ title: "API", value: stats.health }} />
          <StatisticCard statistic={{ title: "可售套餐", value: stats.planCount }} />
          <StatisticCard statistic={{ title: "顾客数", value: stats.customerTotal }} />
          <StatisticCard statistic={{ title: "在线", value: stats.onlineCount }} />
        </StatisticCard.Group>
        <StatisticCard.Group direction="row" style={{ marginTop: 16 }}>
          <StatisticCard statistic={{ title: "商户流量配额", value: stats.merchantQuota }} />
          <StatisticCard statistic={{ title: "剩余可分配", value: stats.merchantRemaining }} />
          <StatisticCard statistic={{ title: "商户套餐到期", value: stats.merchantExpires }} />
        </StatisticCard.Group>
        <ProCard title="快捷说明" style={{ marginTop: 16 }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            默认管理员 <Typography.Text code>admin / admin123</Typography.Text>
            （可用环境变量 ADMIN_BOOTSTRAP_* 修改）。顾客开停续、换链、批量操作见「上游顾客」。
          </Typography.Paragraph>
        </ProCard>
      </Spin>
    </PageContainer>
  );
}
