"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { localePath } from "../lib/locale";
import { useLocale } from "./LocaleProvider";

export function useLocaleRouter() {
  const router = useRouter();
  const locale = useLocale();

  const push = useCallback(
    (href: string) => router.push(localePath(href, locale)),
    [locale, router],
  );
  const replace = useCallback(
    (href: string, opts?: { scroll?: boolean }) =>
      router.replace(localePath(href, locale), opts),
    [locale, router],
  );

  return { push, replace };
}
