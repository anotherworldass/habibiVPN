import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import AntdMessageBridge from "./components/AntdMessageBridge";
import App from "./App";
import "antd/dist/reset.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <AntdMessageBridge>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntdMessageBridge>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
