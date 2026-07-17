import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProLayout } from "@ant-design/pro-components";
import {
  AuditOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MoneyCollectOutlined,
  ShareAltOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { Dropdown } from "antd";
import DashboardPage from "./pages/Dashboard";
import CustomersPage from "./pages/Customers";
import PlansPage from "./pages/Plans";
import SellPlansPage from "./pages/SellPlans";
import BandwidthPlansPage from "./pages/BandwidthPlans";
import NodesPage from "./pages/Nodes";
import TrafficPage from "./pages/Traffic";
import HabibiUsersPage from "./pages/HabibiUsers";
import ReferralConfigPage from "./pages/ReferralConfig";
import ReferralCommissionsPage from "./pages/ReferralCommissions";
import ReferralWithdrawalsPage from "./pages/ReferralWithdrawals";
import ReferralRelationsPage from "./pages/ReferralRelations";
import ReferralOrdersPage from "./pages/ReferralOrders";
import LoginPage from "./pages/Login";
import { clearSession, getAdmin, getToken } from "./lib/auth";

function ProtectedLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const admin = getAdmin();

  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <ProLayout
      title="HabibiVPN"
      layout="mix"
      location={{ pathname: location.pathname }}
      route={{
        path: "/",
        routes: [
          { path: "/", name: "总览", icon: <DashboardOutlined /> },
          { path: "/sell-plans", name: "售卖套餐", icon: <ShoppingOutlined /> },
          { path: "/users", name: "Habibi 用户", icon: <UserOutlined /> },
          { path: "/customers", name: "上游顾客", icon: <TeamOutlined /> },
          { path: "/upstream-plans", name: "上游套餐(只读)", icon: <CloudServerOutlined /> },
          { path: "/bandwidth-plans", name: "上游限速档", icon: <ThunderboltOutlined /> },
          { path: "/nodes", name: "节点", icon: <CloudServerOutlined /> },
          { path: "/traffic", name: "流量对账", icon: <LineChartOutlined /> },
          {
            path: "/referral",
            name: "分销",
            icon: <ShareAltOutlined />,
            routes: [
              { path: "/referral/config", name: "分销配置", icon: <AuditOutlined /> },
              { path: "/referral/relations", name: "邀请关系", icon: <TeamOutlined /> },
              { path: "/referral/commissions", name: "佣金流水", icon: <MoneyCollectOutlined /> },
              { path: "/referral/withdrawals", name: "提现审核", icon: <WalletOutlined /> },
              { path: "/referral/orders", name: "补记订单", icon: <ShoppingOutlined /> },
            ],
          },
        ],
      }}
      menuItemRender={(item, dom) => <Link to={item.path || "/"}>{dom}</Link>}
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
        <Route path="/sell-plans" element={<SellPlansPage />} />
        <Route path="/users" element={<HabibiUsersPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/online" element={<Navigate to="/customers" replace />} />
        <Route path="/upstream-plans" element={<PlansPage />} />
        <Route path="/plans" element={<Navigate to="/upstream-plans" replace />} />
        <Route path="/bandwidth-plans" element={<BandwidthPlansPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/dial" element={<Navigate to="/" replace />} />
        <Route path="/traffic" element={<TrafficPage />} />
        <Route path="/referral/config" element={<ReferralConfigPage />} />
        <Route path="/referral/relations" element={<ReferralRelationsPage />} />
        <Route path="/referral/commissions" element={<ReferralCommissionsPage />} />
        <Route path="/referral/withdrawals" element={<ReferralWithdrawalsPage />} />
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
