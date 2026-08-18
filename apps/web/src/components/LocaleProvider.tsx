"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { persistSiteLocale, type SiteLocale } from "../lib/locale";

type LocaleContextValue = {
  locale: SiteLocale;
  setLocale: (next: SiteLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: SiteLocale;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<SiteLocale>(locale);

  useEffect(() => {
    setCurrent(locale);
    persistSiteLocale(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale: current,
      setLocale: (next) => {
        persistSiteLocale(next);
        setCurrent(next);
      },
    }),
    [current],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): SiteLocale {
  return useContext(LocaleContext)?.locale ?? "zh";
}

export function useSetLocale() {
  return useContext(LocaleContext)?.setLocale ?? (() => {});
}
