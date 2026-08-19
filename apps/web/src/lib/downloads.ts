import { apiFetch } from "./api";
import type { downloadPlatforms } from "./site";

export type DownloadPlatformId = (typeof downloadPlatforms)[number]["id"];

export type DownloadItem = {
  id: string;
  name: string;
  package_name: string;
  platform: DownloadPlatformId;
  client: string;
  version_name: string | null;
  action_url: string | null;
  store: boolean;
};

export function downloadActionHref(item: Pick<DownloadItem, "package_name" | "platform">): string {
  return `/api/v1/app/dl?package=${encodeURIComponent(item.package_name)}&platform=${encodeURIComponent(item.platform)}`;
}

export async function fetchPublicDownloads(opts?: {
  packageName?: string;
  platform?: string;
}): Promise<DownloadItem[]> {
  const query = new URLSearchParams();
  const packageName = opts?.packageName?.trim() || "";
  const platform = opts?.platform?.trim() || "";
  if (packageName) query.set("package", packageName);
  if (platform) query.set("platform", platform);
  const result = await apiFetch<{ items: DownloadItem[] }>(
    `/api/v1/app/downloads${query.size ? `?${query.toString()}` : ""}`,
  );
  return result.items || [];
}
