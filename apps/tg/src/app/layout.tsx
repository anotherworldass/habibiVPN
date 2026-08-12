import type { Metadata, Viewport } from "next";
import { DM_Sans, Noto_Sans_SC, Syne } from "next/font/google";
import Script from "next/script";
import TelegramBackButton from "../components/TelegramBackButton";
import TelegramBoot from "../components/TelegramBoot";
import { site } from "../lib/site";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700"],
  // Arial size-adjust fallback cascades to 宋体 on macOS for CJK glyphs
  adjustFontFallback: false,
});

const dmSans = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  adjustFontFallback: false,
});

/**
 * Variable CJK webfont (self-hosted). Mac Telegram Desktop WebView often cannot
 * resolve PingFang, and static multi-weight Noto explodes into hundreds of woff2
 * files that stall over tunnels — fallback then lands on 宋体.
 */
const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  weight: "variable",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: `${site.brand} Mini App`,
  description: site.slogan,
  applicationName: site.brand,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0b0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // telegram-web-app.js injects --tg-viewport-* on <html> before hydrate
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${syne.variable} ${dmSans.variable} ${notoSansSC.variable} ${notoSansSC.className} antialiased`}
        suppressHydrationWarning
      >
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TelegramBoot />
        <TelegramBackButton />
        {children}
      </body>
    </html>
  );
}
