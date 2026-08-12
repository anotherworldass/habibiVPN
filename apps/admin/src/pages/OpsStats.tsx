import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageContainer,
  ProCard,
  StatisticCard,
} from "@ant-design/pro-components";
import { Alert, Col, DatePicker, Row, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { adminFetch } from "../lib/api";

type NamedCount = {
  key: string;
  name: string;
  count: number;
  amount_cents?: number;
};

type DailyRow = {
  day: string;
  registrations: number;
  paid_orders: number;
  gmv_cents: number;
  login_users: number;
};

type OpsStats = {
  project_id: string;
  range: { from: string; to: string; timezone: string };
  summary: {
    users_total: number;
    registrations: number;
    registrations_invited: number;
    registrations_organic: number;
    registrations_anonymous: number;
    orders_created: number;
    paid_orders: number;
    gmv_cents: number;
    refunded_orders: number;
    refunded_cents: number;
    paying_users: number;
    first_paid_orders: number;
    new_user_paid: number;
    new_user_pay_rate_bps: number;
    arpu_cents: number;
    avg_order_cents: number;
  };
  registrations_by_client: NamedCount[];
  registrations_by_package: NamedCount[];
  orders_by_status: NamedCount[];
  revenue_by_provider: NamedCount[];
  revenue_by_plan: NamedCount[];
  revenue_by_kind: NamedCount[];
  login_by_client: NamedCount[];
  users_by_locale: NamedCount[];
  users_by_language: NamedCount[];
  users_by_timezone: NamedCount[];
  daily: DailyRow[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  provisioning: "开通中",
  provisioned: "已开通",
  failed: "失败",
  refunded: "已退款",
  cancelled: "已取消",
};

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

function rate(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function presetRange(days: number): [Dayjs, Dayjs] {
  const end = dayjs();
  const start = end.subtract(days - 1, "day");
  return [start.startOf("day"), end.endOf("day")];
}

export default function OpsStatsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf("day"),
    dayjs().endOf("day"),
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OpsStats | null>(null);

  const load = useCallback(async (r: [Dayjs, Dayjs]) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        from: r[0].format("YYYY-MM-DD"),
        to: r[1].format("YYYY-MM-DD"),
      });
      const res = await adminFetch<OpsStats>(`/admin/v1/ops/stats?${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const s = data?.summary;

  const dailyColumns: ColumnsType<DailyRow> = useMemo(
    () => [
      { title: "日期", dataIndex: "day", width: 120 },
      { title: "注册", dataIndex: "registrations", width: 80 },
      { title: "登录用户", dataIndex: "login_users", width: 90 },
      { title: "付费单", dataIndex: "paid_orders", width: 80 },
      {
        title: "GMV (元)",
        dataIndex: "gmv_cents",
        width: 110,
        render: (v: number) => yuan(v),
      },
    ],
    [],
  );

  const namedColumns = (
    withAmount: boolean,
  ): ColumnsType<NamedCount> => [
    { title: "名称", dataIndex: "name", ellipsis: true },
    { title: "数量", dataIndex: "count", width: 90 },
    ...(withAmount
      ? [
          {
            title: "金额 (元)",
            dataIndex: "amount_cents",
            width: 110,
            render: (v?: number) => yuan(v || 0),
          } as const,
        ]
      : []),
  ];

  return (
    <PageContainer
      title="运营统计"
      subTitle="按当前项目统计注册、端、充值与套餐购买"
      extra={
        <Space wrap>
          <DatePicker.RangePicker
            value={range}
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(), "day")}
            onChange={(v) => {
              if (v?.[0] && v[1]) setRange([v[0], v[1]]);
            }}
            presets={[
              {
                label: "今天",
                value: [dayjs().startOf("day"), dayjs().endOf("day")],
              },
              {
                label: "昨天",
                value: [
                  dayjs().subtract(1, "day").startOf("day"),
                  dayjs().subtract(1, "day").endOf("day"),
                ],
              },
              { label: "近 7 天", value: presetRange(7) },
              { label: "近 14 天", value: presetRange(14) },
              { label: "近 30 天", value: presetRange(30) },
              {
                label: "本月",
                value: [dayjs().startOf("month"), dayjs().endOf("day")],
              },
            ]}
          />
        </Space>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载失败"
          description={error}
        />
      )}

      <Spin spinning={loading}>
        {data && s && (
          <>
            <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
              区间 {data.range.from} ~ {data.range.to}（{data.range.timezone}）
              · 累计用户 {s.users_total}
            </Typography.Paragraph>

            <StatisticCard.Group direction="row">
              <StatisticCard
                statistic={{ title: "新增注册", value: s.registrations }}
              />
              <StatisticCard
                statistic={{
                  title: "邀请注册",
                  value: s.registrations_invited,
                  description: (
                    <Typography.Text type="secondary">
                      自然 {s.registrations_organic} · 匿名{" "}
                      {s.registrations_anonymous}
                    </Typography.Text>
                  ),
                }}
              />
              <StatisticCard
                statistic={{ title: "付费订单", value: s.paid_orders }}
              />
              <StatisticCard
                statistic={{
                  title: "GMV (元)",
                  value: yuan(s.gmv_cents),
                }}
              />
            </StatisticCard.Group>

            <StatisticCard.Group direction="row" style={{ marginTop: 12 }}>
              <StatisticCard
                statistic={{ title: "付费人数", value: s.paying_users }}
              />
              <StatisticCard
                statistic={{
                  title: "新用户付费率",
                  value: rate(s.new_user_pay_rate_bps),
                  description: (
                    <Typography.Text type="secondary">
                      {s.new_user_paid} / {s.registrations} 人在期内付费
                    </Typography.Text>
                  ),
                }}
              />
              <StatisticCard
                statistic={{
                  title: "客单价 (元)",
                  value: yuan(s.avg_order_cents),
                }}
              />
              <StatisticCard
                statistic={{
                  title: "ARPU (元)",
                  value: yuan(s.arpu_cents),
                  description: (
                    <Typography.Text type="secondary">
                      首购单 {s.first_paid_orders} · 退款{" "}
                      {s.refunded_orders} / ¥{yuan(s.refunded_cents)}
                    </Typography.Text>
                  ),
                }}
              />
            </StatisticCard.Group>

            <ProCard title="每日趋势" style={{ marginTop: 16 }} headerBordered>
              <Table<DailyRow>
                size="small"
                rowKey="day"
                pagination={false}
                dataSource={[...data.daily].reverse()}
                columns={dailyColumns}
                scroll={{ y: 320 }}
              />
            </ProCard>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={12}>
                <ProCard title="注册 · 按端" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.registrations_by_client}
                    columns={namedColumns(false)}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={12}>
                <ProCard title="注册 · 按安装包" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.registrations_by_package}
                    columns={namedColumns(false)}
                    locale={{ emptyText: "区间内无包来源数据" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={12}>
                <ProCard title="登录活跃 · 按端" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.login_by_client}
                    columns={[
                      { title: "端", dataIndex: "name", ellipsis: true },
                      {
                        title: "活跃用户",
                        dataIndex: "count",
                        width: 100,
                      },
                    ]}
                    locale={{ emptyText: "区间内无登录事件" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={8}>
                <ProCard
                  title="用户语言"
                  subTitle="按 locale 主语言"
                  headerBordered
                >
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    scroll={{ y: 280 }}
                    dataSource={data.users_by_language}
                    columns={[
                      { title: "语言", dataIndex: "name", ellipsis: true },
                      { title: "用户", dataIndex: "count", width: 80 },
                    ]}
                    locale={{ emptyText: "区间内无语言数据" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={8}>
                <ProCard
                  title="用户 Locale"
                  subTitle="完整 locale 标签"
                  headerBordered
                >
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    scroll={{ y: 280 }}
                    dataSource={data.users_by_locale}
                    columns={[
                      { title: "Locale", dataIndex: "name", ellipsis: true },
                      { title: "用户", dataIndex: "count", width: 80 },
                    ]}
                    locale={{ emptyText: "区间内无 locale 数据" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={8}>
                <ProCard title="用户时区" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    scroll={{ y: 280 }}
                    dataSource={data.users_by_timezone}
                    columns={[
                      { title: "时区", dataIndex: "name", ellipsis: true },
                      { title: "用户", dataIndex: "count", width: 80 },
                    ]}
                    locale={{ emptyText: "区间内无时区数据" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={12}>
                <ProCard title="下单状态分布" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.orders_by_status}
                    columns={[
                      {
                        title: "状态",
                        dataIndex: "key",
                        render: (k: string) => (
                          <Tag>{STATUS_LABEL[k] || k}</Tag>
                        ),
                      },
                      { title: "单数", dataIndex: "count", width: 80 },
                      {
                        title: "金额 (元)",
                        dataIndex: "amount_cents",
                        width: 110,
                        render: (v?: number) => yuan(v || 0),
                      },
                    ]}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={12}>
                <ProCard title="充值 · 按支付渠道" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.revenue_by_provider}
                    columns={namedColumns(true)}
                    locale={{ emptyText: "区间内无成功充值" }}
                  />
                </ProCard>
              </Col>
              <Col xs={24} lg={12}>
                <ProCard title="购买 · 首购 / 续费" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.revenue_by_kind}
                    columns={namedColumns(true)}
                  />
                </ProCard>
              </Col>
              <Col xs={24}>
                <ProCard title="购买套餐 TOP" headerBordered>
                  <Table<NamedCount>
                    size="small"
                    rowKey="key"
                    pagination={false}
                    dataSource={data.revenue_by_plan}
                    columns={namedColumns(true)}
                    locale={{ emptyText: "区间内无套餐购买" }}
                  />
                </ProCard>
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </PageContainer>
  );
}
