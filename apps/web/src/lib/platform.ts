import type { DownloadPlatformId } from "./downloads";
import { downloadPlatforms } from "./site";

export type { DownloadPlatformId };

/** Best-effort client platform from user agent (browser only). */
export function detectDownloadPlatform(): DownloadPlatformId | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "macos";
  return null;
}

/** Put the visitor's platform first when known. */
export function orderDownloadPlatforms(current: DownloadPlatformId | null): DownloadPlatformId[] {
  const ids = downloadPlatforms.map((p) => p.id);
  if (!current || !ids.includes(current)) return [...ids];
  return [current, ...ids.filter((id) => id !== current)];
}
