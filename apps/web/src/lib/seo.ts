import type { Metadata } from "next";
import {
  DEFAULT_LOCALE,
  htmlLang,
  isInvitePath,
  localePath,
  type SiteLocale,
} from "./locale";
import { site } from "./site";

export const PUBLIC_SEO_PATHS = [
  "/",
  "/about",
  "/guide",
  "/download",
  "/privacy",
  "/terms",
  "/nodes",
  "/plans",
  "/support",
  "/register",
] as const;

export type PublicSeoPath = (typeof PUBLIC_SEO_PATHS)[number];

type PageSeo = {
  title: string;
  description: string;
};

const pages: Record<PublicSeoPath, Record<SiteLocale, PageSeo>> = {
  "/": {
    zh: {
      title: `${site.brand} · 随时连上，快速访问`,
      description: "注册领取套餐，复制订阅链接，导入客户端即可安全上网。多地区节点，一用户多套餐。",
    },
    en: {
      title: `${site.brand} · Connect anytime, browse faster`,
      description:
        "Create an account, claim a plan, copy your subscription link, and import it into a client. Multi-region nodes with independent plans per user.",
    },
  },
  "/about": {
    zh: {
      title: `关于我们 · ${site.brand}`,
      description: `${site.brand} 面向需要稳定跨境访问的用户，提供注册、套餐、订阅管理与节点概览。`,
    },
    en: {
      title: `About · ${site.brand}`,
      description: `${site.brand} is a personal VPN service with account signup, plans, subscription management, and a node overview.`,
    },
  },
  "/guide": {
    zh: {
      title: `使用教程 · ${site.brand}`,
      description: "注册开通套餐后，用官方 App 一键连接，或把订阅导入第三方客户端。含平台说明与常见问题。",
    },
    en: {
      title: `Setup guide · ${site.brand}`,
      description: `After signup, connect with the official app or import your subscription into a third-party client. Includes platform notes and FAQ.`,
    },
  },
  "/download": {
    zh: {
      title: `下载 App · ${site.brand}`,
      description: `下载 ${site.brand} iOS、Android、Windows 与 macOS 客户端，或先用网页管理套餐。`,
    },
    en: {
      title: `Download · ${site.brand}`,
      description: `Download ${site.brand} for iOS, Android, Windows, and macOS, or manage plans in the browser first.`,
    },
  },
  "/privacy": {
    zh: {
      title: `隐私条款 · ${site.brand}`,
      description: `${site.brand} 如何收集、使用与保护你的账号与订阅信息。`,
    },
    en: {
      title: `Privacy · ${site.brand}`,
      description: `How ${site.brand} collects, uses, and protects your account and subscription information.`,
    },
  },
  "/terms": {
    zh: {
      title: `用户协议 · ${site.brand}`,
      description: `使用 ${site.brand} 网站、App 与订阅服务的基本约定。`,
    },
    en: {
      title: `Terms · ${site.brand}`,
      description: `Terms of service for the ${site.brand} website, apps, and subscriptions.`,
    },
  },
  "/nodes": {
    zh: {
      title: `节点 · ${site.brand}`,
      description: "查看各地区节点池数量与在线状态，支持列表和地图。",
    },
    en: {
      title: `Nodes · ${site.brand}`,
      description: "See regional node pools, counts, and online status in a list or map.",
    },
  },
  "/plans": {
    zh: {
      title: `选择套餐 · ${site.brand}`,
      description: "浏览免费试用与付费套餐，领取或购买后即可生成订阅链接。",
    },
    en: {
      title: `Select plan · ${site.brand}`,
      description: "Browse free trials and paid plans. Claiming or purchasing a plan creates your subscription link.",
    },
  },
  "/support": {
    zh: {
      title: `联系客服 · ${site.brand}`,
      description: "账号、套餐与订阅问题可通过在线客服、邮箱或 Telegram 咨询。",
    },
    en: {
      title: `Support · ${site.brand}`,
      description: "Get help with your account, plans, and subscription via chat, email, or Telegram.",
    },
  },
  "/register": {
    zh: {
      title: `注册 · ${site.brand}`,
      description: `用邮箱创建 ${site.brand} 账号，领取套餐并导入客户端。`,
    },
    en: {
      title: `Sign up · ${site.brand}`,
      description: `Create a ${site.brand} account with your email, claim a plan, and import a client.`,
    },
  },
};

export function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_WEBSITE_URL ||
    process.env.WEB_PUBLIC_ORIGIN ||
    site.website;
  if (raw && raw.trim()) return raw.replace(/\/$/, "");
  return "https://www.tizi.work";
}

export function absoluteUrl(path: string): string {
  const origin = siteOrigin();
  if (!path || path === "/") return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function isPublicSeoPath(path: string): path is PublicSeoPath {
  return (PUBLIC_SEO_PATHS as readonly string[]).includes(path);
}

function inviteSeo(locale: SiteLocale): PageSeo {
  if (locale === "en") {
    return {
      title: `You're invited · ${site.brand}`,
      description: `A friend invited you to ${site.brand}. Sign up or download the app to claim a plan.`,
    };
  }
  return {
    title: `好友邀请你加入 · ${site.brand}`,
    description: `好友邀请你加入 ${site.brand}。注册或下载 App，即可领取套餐。`,
  };
}

export function pageSeo(path: string, locale: SiteLocale): PageSeo {
  if (isInvitePath(path)) return inviteSeo(locale);
  if (isPublicSeoPath(path)) return pages[path][locale];
  if (locale === "en") {
    return {
      title: site.brand,
      description: `${site.brand} account and subscription.`,
    };
  }
  return {
    title: site.brand,
    description: `${site.brand} 账号与订阅。`,
  };
}

export function shouldIndexPath(path: string): boolean {
  return isPublicSeoPath(path) && !isInvitePath(path);
}

export function languageAlternates(path: string): Record<string, string> {
  if (isInvitePath(path)) {
    return {};
  }
  const target = path;
  return {
    "zh-CN": localePath(target, "zh"),
    en: localePath(target, "en"),
    "x-default": localePath(target, DEFAULT_LOCALE),
  };
}

export function buildPageMetadata(path: string, locale: SiteLocale): Metadata {
  const seo = pageSeo(path, locale);
  const index = shouldIndexPath(path);
  const canonicalPath = isInvitePath(path) ? path : localePath(path, locale);
  const languages = index ? languageAlternates(path) : undefined;

  return {
    title: seo.title,
    description: seo.description,
    applicationName: site.brand,
    metadataBase: new URL(siteOrigin()),
    alternates: {
      canonical: canonicalPath,
      languages,
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: isInvitePath(path) },
    openGraph: {
      type: "website",
      locale: htmlLang(locale),
      siteName: site.brand,
      title: seo.title,
      description: seo.description,
      url: absoluteUrl(canonicalPath),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}
