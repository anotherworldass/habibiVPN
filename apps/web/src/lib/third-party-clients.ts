import { apiFetch } from "./api";

export const THIRD_PARTY_PLATFORMS = [
  "ios",
  "android",
  "windows",
  "macos",
  "linux",
] as const;

export type ThirdPartyPlatform = (typeof THIRD_PARTY_PLATFORMS)[number];

export type ThirdPartyChannel = "app_store" | "play" | "github" | "website";

export type ThirdPartyClient = {
  id: string;
  featured: boolean;
  paid: boolean;
  import_key: string | null;
  name: string;
  summary: string;
  tip: string;
  urls: Partial<
    Record<ThirdPartyPlatform, { url: string; channel: ThirdPartyChannel }>
  >;
};

export function detectThirdPartyPlatform(): ThirdPartyPlatform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return null;
}

export function platformsForClients(
  items: ThirdPartyClient[],
): ThirdPartyPlatform[] {
  return THIRD_PARTY_PLATFORMS.filter((platform) =>
    items.some((item) => item.urls[platform]),
  );
}

export async function fetchThirdPartyClients(): Promise<ThirdPartyClient[]> {
  const result = await apiFetch<{ items: ThirdPartyClient[] }>(
    "/api/v1/app/third-party-clients",
  );
  return result.items || [];
}
