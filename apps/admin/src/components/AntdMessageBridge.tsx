import { useEffect, type ReactNode } from "react";
import { App } from "antd";
import { attachMessageApi } from "../lib/antd-message";

/** Keeps static-style `message` calls wired to App.useApp(). */
export default function AntdMessageBridge({ children }: { children: ReactNode }) {
  const { message } = App.useApp();
  useEffect(() => {
    attachMessageApi(message);
  }, [message]);
  return <>{children}</>;
}
