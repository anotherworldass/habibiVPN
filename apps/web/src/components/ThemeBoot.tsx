"use client";

import { useEffect } from "react";
import { applySiteTheme, resolveSiteTheme } from "../lib/theme";

/** Syncs `data-theme` from ?theme= / localStorage (default gray). */
export default function ThemeBoot() {
  useEffect(() => {
    applySiteTheme(resolveSiteTheme());
  }, []);
  return null;
}
