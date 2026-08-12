"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getTelegramWebApp } from "../lib/telegram";

/** Bottom-tab roots: only show Telegram close; nested pages get BackButton. */
const TAB_ROOTS = new Set(["/", "/plans", "/invite", "/account"]);

function isTabRoot(pathname: string) {
  return TAB_ROOTS.has(pathname);
}

function fallbackParent(pathname: string) {
  if (pathname.startsWith("/checkout")) return "/plans";
  if (pathname.startsWith("/connect")) return "/";
  return "/";
}

/**
 * Sync Telegram native BackButton with Next.js navigation.
 * On nested routes (连接 / 结账等) show ←；tab 首页只保留关闭。
 */
export default function TelegramBackButton() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const app = getTelegramWebApp();
    const back = app?.BackButton;
    if (!back) return;

    const onBack = () => {
      // Prefer in-app history; fall back to a sensible parent for deep links.
      if (typeof window !== "undefined" && window.history.length > 2) {
        router.back();
        return;
      }
      router.replace(fallbackParent(pathname));
    };

    try {
      back.onClick(onBack);
    } catch {
      app?.onEvent?.("backButtonClicked", onBack);
    }

    if (isTabRoot(pathname)) {
      back.hide();
    } else {
      back.show();
    }

    return () => {
      try {
        back.offClick(onBack);
      } catch {
        app?.offEvent?.("backButtonClicked", onBack);
      }
    };
  }, [pathname, router]);

  return null;
}
