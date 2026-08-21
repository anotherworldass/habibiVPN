/** Public site links — override via NEXT_PUBLIC_* in env if needed */
export const site = {
  brand: "TiTiVPN",
  slogan: "稳定在线，始终可靠",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@tizi.work",
  supportTelegram:
    process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM || "https://t.me/titivpn_app_bot",
  twitterUrl: process.env.NEXT_PUBLIC_TWITTER_URL || "https://x.com/titivpn_com",
  website: process.env.NEXT_PUBLIC_WEBSITE_URL || "",
  /** App downloads — placeholder until store / installer URLs are ready */
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL || "#",
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL || "#",
  androidApkUrl: process.env.NEXT_PUBLIC_ANDROID_APK_URL || "#",
  windowsUrl: process.env.NEXT_PUBLIC_WINDOWS_URL || "#",
  macosUrl: process.env.NEXT_PUBLIC_MACOS_URL || "#",
};

export function isPlaceholderUrl(url: string) {
  return !url || url === "#";
}

/** Telegram 客服链接（env：NEXT_PUBLIC_SUPPORT_TELEGRAM） */
export function supportTelegramUrl(): string {
  return (site.supportTelegram || "").trim();
}

/** Download page platform entries */
export const downloadPlatforms = [
  {
    id: "ios",
    label: "iOS",
    hint: "App Store",
    cta: "前往 App Store",
    url: () => site.appStoreUrl,
  },
  {
    id: "android",
    label: "Android",
    hint: "APK / Google Play",
    cta: "下载 Android 版",
    url: () =>
      isPlaceholderUrl(site.androidApkUrl)
        ? site.playStoreUrl
        : site.androidApkUrl,
  },
  {
    id: "windows",
    label: "Windows",
    hint: "桌面安装包",
    cta: "下载 Windows 版",
    url: () => site.windowsUrl,
  },
  {
    id: "macos",
    label: "macOS",
    hint: "桌面安装包",
    cta: "下载 macOS 版",
    url: () => site.macosUrl,
  },
] as const;

/** Actionable help (教程 / 客服) — used by HelpLinks */
export const helpActionLinks = [
  { href: "/download", label: "下载 App", desc: "iOS / Android / Windows / macOS" },
  { href: "/guide", label: "使用教程", desc: "官方 App 一键连接，或导入第三方客户端" },
  { href: "/support", label: "联系客服", desc: "账号与订阅问题咨询" },
] as const;

/** Site footer — 节点 / 关于 / 隐私 / 协议 */
export const legalFooterLinks = [
  { href: "/nodes", label: "节点" },
  { href: "/about", label: "关于" },
  { href: "/privacy", label: "隐私" },
  { href: "/terms", label: "协议" },
] as const;

/** Full help catalog (legacy / other pages) */
export const helpLinks = [
  ...helpActionLinks,
  { href: "/about", label: "关于我们", desc: "产品介绍与服务说明" },
  { href: "/privacy", label: "隐私条款", desc: "我们如何处理你的信息" },
  { href: "/terms", label: "用户协议", desc: "使用服务的基本约定" },
] as const;
