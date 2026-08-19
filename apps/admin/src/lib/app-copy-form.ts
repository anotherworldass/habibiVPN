import { APP_COPY_LOCALES } from "@habibi/shared";

export type AppCopyFormMode = "sparse" | "full";

export function formValuesToI18n(
  values: Record<string, unknown>,
  field: string,
  mode: AppCopyFormMode = "sparse",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const locale of APP_COPY_LOCALES) {
    const value = values[`${field}_${locale.code}`];
    const text = typeof value === "string" ? value.trim() : "";
    if (mode === "full" || text) result[locale.code] = text;
  }
  return result;
}

export function i18nToFormValues(
  field: string,
  value: Record<string, string> | null | undefined,
  fallbackZh = "",
): Record<string, string> {
  return Object.fromEntries(
    APP_COPY_LOCALES.map((locale) => [
      `${field}_${locale.code}`,
      value?.[locale.code] || (locale.code === "zh" ? fallbackZh : ""),
    ]),
  );
}
