import dayjs from "dayjs";

/** Same instant as ProTable `valueType: "dateTime"`: ISO → browser local. */
export function formatDateTime(
  value?: string | Date | null,
  empty = "—",
): string {
  if (value == null || value === "") return empty;
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss") : empty;
}
