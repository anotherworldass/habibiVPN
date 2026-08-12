import { useState } from "react";
import { PageContainer, ProCard, StatisticCard } from "@ant-design/pro-components";
import { Button, DatePicker, Space, Table } from "antd";
import { message } from "../lib/antd-message";
import dayjs, { type Dayjs } from "dayjs";
import { adminFetch } from "../lib/api";

const { RangePicker } = DatePicker;

function formatBytes(n?: number) {
  if (n == null) return "-";
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export default function TrafficPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs(),
  ]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        since: range[0].format("YYYY-MM-DD"),
        until: range[1].add(1, "day").format("YYYY-MM-DD"),
        granularity: "day",
      });
      const data = await adminFetch<Record<string, unknown>>(
        `/admin/v1/wireraw/traffic/summary?${qs}`,
      );
      setSummary(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const series = Array.isArray(summary?.series) ? (summary!.series as Record<string, unknown>[]) : [];

  return (
    <PageContainer title="流量对账">
      <Space style={{ marginBottom: 16 }}>
        <RangePicker
          value={range}
          onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
        />
        <Button type="primary" loading={loading} onClick={load}>
          查询
        </Button>
      </Space>

      {summary && (
        <>
          <StatisticCard.Group direction="row">
            <StatisticCard
              statistic={{ title: "总用量", value: formatBytes(summary.total_bytes as number) }}
            />
            <StatisticCard
              statistic={{ title: "上行", value: formatBytes(summary.total_up_bytes as number) }}
            />
            <StatisticCard
              statistic={{ title: "下行", value: formatBytes(summary.total_down_bytes as number) }}
            />
            <StatisticCard
              statistic={{
                title: "商户剩余",
                value: formatBytes(summary.merchant_remaining_bytes as number),
              }}
            />
          </StatisticCard.Group>
          <ProCard title="按日明细" style={{ marginTop: 16 }}>
            <Table
              rowKey={(r) => String(r.date)}
              dataSource={series}
              pagination={{ pageSize: 31 }}
              columns={[
                { title: "日期", dataIndex: "date" },
                {
                  title: "用量",
                  dataIndex: "bytes",
                  render: (v: number) => formatBytes(v),
                },
              ]}
            />
          </ProCard>
        </>
      )}
    </PageContainer>
  );
}
