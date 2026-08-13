import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import SupportChatWidget from "../components/SupportChatWidget";
import ThemeBoot from "../components/ThemeBoot";
import { site } from "../lib/site";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: site.brand,
  description: "注册领取套餐，获取订阅链接，导入客户端即可安全上网。",
  applicationName: site.brand,
  appleWebApp: {
    capable: true,
    title: site.brand,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#eef0f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="gray">
      <body className={`${syne.variable} ${dmSans.variable} antialiased`}>
        <ThemeBoot />
        {children}
        <SupportChatWidget />
      </body>
    </html>
  );
}
