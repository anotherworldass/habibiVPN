import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ProLayout } from "@ant-design/pro-components";
import { useEffect, useState } from "react";
import {
  AppstoreOutlined,
  AuditOutlined,
  CloudServerOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  EyeOutlined,
  FolderOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MoneyCollectOutlined,
  ShareAltOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WalletOutlined,
  GiftOutlined,
  TagOutlined,
  PercentageOutlined,
  ShoppingCartOutlined,
  NotificationOutlined,
  MessageOutlined,
  SendOutlined,
  CustomerServiceOutlined,
  RobotOutlined,
  RadarChartOutlined,
  SettingOutlined,
  MailOutlined,
  CloudUploadOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { Dropdown, Select, Space } from "antd";
import DashboardPage from "./pages/Dashboard";
import CustomersPage from "./pages/Customers";
import PlansPage from "./pages/Plans";
import SellPlansPage from "./pages/SellPlans";
import PlanGroupsPage from "./pages/PlanGroups";
import CatalogPreviewPage from "./pages/CatalogPreview";
import ProjectsPage from "./pages/Projects";
import BandwidthPlansPage from "./pages/BandwidthPlans";
import NodesPage from "./pages/Nodes";
import NodeProbePage from "./pages/NodeProbe";
import TrafficPage from "./pages/Traffic";
import HabibiUsersPage from "./pages/HabibiUsers";
import EntitlementLedgerPage from "./pages/EntitlementLedger";
import ReferralConfigPage from "./pages/ReferralConfig";
import ReferralGroupsPage from "./pages/ReferralGroups";
import ReferralCommissionsPage from "./pages/ReferralCommissions";
import ReferralWithdrawalsPage from "./pages/ReferralWithdrawals";
import ReferralRelationsPage from "./pages/ReferralRelations";
import ReferralOrdersPage from "./pages/ReferralOrders";
import WalletCatalogPage from "./pages/WalletCatalog";
import WalletSpendsPage from "./pages/WalletSpends";
import LoginPage from "./pages/Login";
import PaymentSettingsPage from "./pages/PaymentSettings";
import PaymentOrderGuardSettingsPage from "./pages/PaymentOrderGuardSettings";
import OrdersPage from "./pages/Orders";
import OpsStatsPage from "./pages/OpsStats";
import CampaignsPage from "./pages/Campaigns";
import RedeemCodesPage from "./pages/RedeemCodes";
import CouponsPage from "./pages/Coupons";
import AnnouncementsPage from "./pages/Announcements";
import TelegramBotPage from "./pages/TelegramBot";
import TelegramBroadcastPage from "./pages/TelegramBroadcast";
import TelegramAutoReplyPage from "./pages/TelegramAutoReply";
import SupportInboxPage from "./pages/SupportInbox";
import SupportSettingsPage from "./pages/SupportSettings";
import MailSettingsPage from "./pages/MailSettings";
import AuditLogsPage from "./pages/AuditLogs";
import AuthEmailSettingsPage from "./pages/AuthEmailSettings";
import SignupTrialSettingsPage from "./pages/SignupTrialSettings";
import StorageSettingsPage from "./pages/StorageSettings";
import SubscriptionNoticeSettingsPage from "./pages/SubscriptionNoticeSettings";
import LlmSettingsPage from "./pages/LlmSettings";
import { adminFetch } from "./lib/api";
import { clearSession, getAdmin, getToken } from "./lib/auth";
import { getProjectId, setProjectId } from "./lib/project";

/** Old bookmark: /referral/relations?user=… → /users/detail?user=… */
function LegacyRelationsRedirect() {
  const [sp] = useSearchParams();
  const q = sp.toString();
  return <Navigate to={q ? `/users/detail?${q}` : "/users/detail"} replace />;
}

function ProtectedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const admin = getAdmin();
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>(
    [],
  );
  const [projectId, setProjectIdState] = useState(getProjectId());

  useEffect(() => {
    void adminFetch<{ projects: Array<{ id: string; name: string; code: string }> }>(
      "/admin/v1/projects",
    )
      .then((res) => setProjects(res.projects || []))
      .catch(() => setProjects([]));
  }, []);

  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <ProLayout
      title="TiTiVPN"
      layout="mix"
      location={{ pathname: location.pathname }}
      footerRender={() => (
        <div
          style={{
            textAlign: "center",
            color: "rgba(0,0,0,0.35)",
            fontSize: 12,
            padding: "8px 0",
          }}
        >
          {__APP_VERSION__}
        </div>
      )}
      route={{
        path: "/",
        routes: [
          { path: "/", name: "总览", icon: <DashboardOutlined /> },
          {
            path: "/ops",
            name: "运营统计",
            icon: <LineChartOutlined />,
          },
          { path: "/projects", name: "项目管理", icon: <AppstoreOutlined /> },
          {
            path: "/settings",
            name: "系统设置",
            icon: <SettingOutlined />,
            routes: [
              {
                path: "/settings/mail",
                name: "邮件 SES",
                icon: <MailOutlined />,
              },
              {
                path: "/settings/storage",
                name: "对象存储 S3",
                icon: <CloudUploadOutlined />,
              },
              {
                path: "/settings/auth-email",
                name: "账号与邮箱",
                icon: <SafetyCertificateOutlined />,
              },
              {
                path: "/settings/signup-trial",
                name: "注册赠送",
                icon: <GiftOutlined />,
              },
              {
                path: "/settings/support",
                name: "客服",
                icon: <CustomerServiceOutlined />,
              },
              {
                path: "/settings/subscription-notice",
                name: "订阅转换",
                icon: <FileTextOutlined />,
              },
              {
                path: "/settings/llm",
                name: "大模型",
                icon: <RobotOutlined />,
              },
              {
                path: "/settings/audit-logs",
                name: "操作日志",
                icon: <HistoryOutlined />,
              },
            ],
          },
          {
            path: "/sell-plans",
            name: "售卖套餐",
            icon: <ShoppingOutlined />,
            routes: [
              { path: "/sell-plans", name: "套餐管理", icon: <ShoppingOutlined /> },
              {
                path: "/sell-plans/groups",
                name: "套餐分组",
                icon: <FolderOutlined />,
              },
              {
                path: "/sell-plans/preview",
                name: "端侧预览",
                icon: <EyeOutlined />,
              },
            ],
          },
          {
            path: "/payment",
            name: "支付与订单",
            icon: <CreditCardOutlined />,
            routes: [
              { path: "/payment", name: "支付配置", icon: <CreditCardOutlined /> },
              {
                path: "/payment/order-guard",
                name: "下单风控",
                icon: <SafetyCertificateOutlined />,
              },
              {
                path: "/orders",
                name: "订单流水",
                icon: <MoneyCollectOutlined />,
              },
              {
                path: "/entitlement-ledgers",
                name: "权益流水",
                icon: <AuditOutlined />,
              },
            ],
          },
          {
            path: "/campaigns",
            name: "运营活动",
            icon: <GiftOutlined />,
            routes: [
              { path: "/campaigns", name: "运营活动", icon: <GiftOutlined /> },
              { path: "/announcements", name: "公告", icon: <NotificationOutlined /> },
              { path: "/redeem", name: "兑换码", icon: <TagOutlined /> },
              { path: "/coupons", name: "优惠券", icon: <PercentageOutlined /> },
            ],
          },
          {
            path: "/support/inbox",
            name: "客服台",
            icon: <CustomerServiceOutlined />,
          },
          {
            path: "/telegram",
            name: "Telegram",
            icon: <MessageOutlined />,
            routes: [
              { path: "/telegram", name: "Bot 配置", icon: <MessageOutlined /> },
              {
                path: "/telegram/auto-reply",
                name: "自动回复",
                icon: <RobotOutlined />,
              },
              {
                path: "/telegram/broadcast",
                name: "群发",
                icon: <SendOutlined />,
              },
            ],
          },
          { path: "/users", name: "用户列表", icon: <UserOutlined /> },
          {
            path: "/customers",
            name: "上游相关",
            icon: <CloudServerOutlined />,
            routes: [
              { path: "/customers", name: "上游顾客", icon: <TeamOutlined /> },
              { path: "/upstream-plans", name: "上游套餐(只读)", icon: <CloudServerOutlined /> },
              { path: "/bandwidth-plans", name: "上游限速档", icon: <ThunderboltOutlined /> },
              { path: "/nodes", name: "节点", icon: <CloudServerOutlined /> },
              { path: "/node-probe", name: "节点探测", icon: <RadarChartOutlined /> },
              { path: "/traffic", name: "流量对账", icon: <LineChartOutlined /> },
            ],
          },
          {
            path: "/referral",
            name: "分销",
            icon: <ShareAltOutlined />,
            routes: [
              { path: "/referral/config", name: "分销配置", icon: <AuditOutlined /> },
              { path: "/referral/groups", name: "用户组", icon: <TeamOutlined /> },
              { path: "/referral/commissions", name: "佣金流水", icon: <MoneyCollectOutlined /> },
              { path: "/referral/withdrawals", name: "提现审核", icon: <WalletOutlined /> },
              {
                path: "/referral/catalog",
                name: "兑换商品",
                icon: <ShoppingCartOutlined />,
              },
              {
                path: "/referral/spends",
                name: "兑换审核",
                icon: <GiftOutlined />,
              },
              { path: "/referral/orders", name: "补记订单", icon: <ShoppingOutlined /> },
            ],
          },
        ],
      }}
      menuItemRender={(item, dom) => <Link to={item.path || "/"}>{dom}</Link>}
      actionsRender={() => [
        <Space key="project" style={{ marginRight: 8 }}>
          <span style={{ color: "rgba(0,0,0,0.45)", fontSize: 12 }}>项目</span>
          <Select
            size="small"
            style={{ width: 180 }}
            value={projectId}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.code})`,
            }))}
            onChange={(id) => {
              setProjectId(id);
              setProjectIdState(id);
              // Force remount data pages
              navigate(location.pathname, { replace: true });
              window.location.reload();
            }}
          />
        </Space>,
      ]}
      avatarProps={{
        title: admin?.username || "admin",
        render: (_props, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "退出登录",
                  onClick: () => {
                    clearSession();
                    navigate("/login", { replace: true });
                  },
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/ops" element={<OpsStatsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings/mail" element={<MailSettingsPage />} />
        <Route path="/settings/storage" element={<StorageSettingsPage />} />
        <Route path="/settings/auth-email" element={<AuthEmailSettingsPage />} />
        <Route path="/settings/signup-trial" element={<SignupTrialSettingsPage />} />
        <Route path="/settings/support" element={<SupportSettingsPage />} />
        <Route
          path="/settings/subscription-notice"
          element={<SubscriptionNoticeSettingsPage />}
        />
        <Route path="/settings/llm" element={<LlmSettingsPage />} />
        <Route path="/settings/audit-logs" element={<AuditLogsPage />} />
        <Route path="/sell-plans" element={<SellPlansPage />} />
        <Route path="/sell-plans/groups" element={<PlanGroupsPage />} />
        <Route path="/sell-plans/preview" element={<CatalogPreviewPage />} />
        <Route path="/payment" element={<PaymentSettingsPage />} />
        <Route
          path="/payment/order-guard"
          element={<PaymentOrderGuardSettingsPage />}
        />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/entitlement-ledgers" element={<EntitlementLedgerPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/support/inbox" element={<SupportInboxPage />} />
        <Route path="/telegram" element={<TelegramBotPage />} />
        <Route path="/telegram/auto-reply" element={<TelegramAutoReplyPage />} />
        <Route path="/telegram/broadcast" element={<TelegramBroadcastPage />} />
        <Route path="/redeem" element={<RedeemCodesPage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/users" element={<HabibiUsersPage />} />
        <Route path="/users/detail" element={<ReferralRelationsPage />} />
        <Route
          path="/referral/relations"
          element={<LegacyRelationsRedirect />}
        />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/online" element={<Navigate to="/customers" replace />} />
        <Route path="/upstream-plans" element={<PlansPage />} />
        <Route path="/plans" element={<Navigate to="/upstream-plans" replace />} />
        <Route path="/bandwidth-plans" element={<BandwidthPlansPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/node-probe" element={<NodeProbePage />} />
        <Route path="/dial" element={<Navigate to="/" replace />} />
        <Route path="/traffic" element={<TrafficPage />} />
        <Route path="/referral/config" element={<ReferralConfigPage />} />
        <Route path="/referral/groups" element={<ReferralGroupsPage />} />
        <Route path="/referral/commissions" element={<ReferralCommissionsPage />} />
        <Route path="/referral/withdrawals" element={<ReferralWithdrawalsPage />} />
        <Route path="/referral/catalog" element={<WalletCatalogPage />} />
        <Route path="/referral/spends" element={<WalletSpendsPage />} />
        <Route path="/referral/orders" element={<ReferralOrdersPage />} />
        <Route path="/referral" element={<Navigate to="/referral/config" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}
