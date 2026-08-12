import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { LoginForm, ProFormText } from "@ant-design/pro-components";
import { message } from "../lib/antd-message";
import { useNavigate } from "react-router-dom";
import { adminFetch } from "../lib/api";
import { setSession, type AdminUser } from "../lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #0f172a 0%, #134e4a 55%, #042f2e 100%)",
      }}
    >
      <LoginForm
        title="HabibiVPN"
        subTitle="运营管理后台"
        onFinish={async (values) => {
          try {
            const res = await adminFetch<{ token: string; admin: AdminUser }>(
              "/admin/v1/auth/login",
              {
                method: "POST",
                body: JSON.stringify(values),
              },
            );
            setSession(res.token, res.admin);
            message.success("登录成功");
            navigate("/", { replace: true });
          } catch (e) {
            message.error(e instanceof Error ? e.message : "登录失败");
          }
        }}
      >
        <ProFormText
          name="username"
          fieldProps={{ size: "large", prefix: <UserOutlined /> }}
          placeholder="用户名"
          rules={[{ required: true, message: "请输入用户名" }]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{ size: "large", prefix: <LockOutlined /> }}
          placeholder="密码"
          rules={[{ required: true, message: "请输入密码" }]}
        />
      </LoginForm>
    </div>
  );
}
