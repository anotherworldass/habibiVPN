import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import JsonLd from "../components/JsonLd";
import { LocaleProvider } from "../components/LocaleProvider";
import SupportChatWidget from "../components/SupportChatWidget";
import ThemeBoot from "../components/ThemeBoot";
import { htmlLang } from "../lib/locale";
import { getRequestLocale, getRequestPath } from "../lib/request-locale";
import { buildPageMetadata, siteOrigin } from "../lib/seo";
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const path = await getRequestPath();
  return {
    ...buildPageMetadata(path, locale),
    metadataBase: new URL(siteOrigin()),
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
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef0f3",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const path = await getRequestPath();

  return (
    <html lang={htmlLang(locale)} data-theme="gray">
      <body className={`${syne.variable} ${dmSans.variable} antialiased`}>
        <LocaleProvider locale={locale}>
          <ThemeBoot />
          <JsonLd locale={locale} path={path} />
          {children}
          <SupportChatWidget />
        </LocaleProvider>
      </body>
    </html>
  );
}
