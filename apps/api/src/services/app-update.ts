import type { AppPackage, AppPackageRelease, ClientChannel, Prisma } from "@prisma/client";
import {
  normalizeAppCopyI18n,
  pickAppCopy,
  resolveAppCopyLocale,
  type AppCopyI18n,
} from "@habibi/shared";
import { prisma } from "../lib/prisma.js";

export type UpdateKind = "none" | "optional" | "force";

function asCopyMap(raw: unknown): AppCopyI18n {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as AppCopyI18n;
}

function publicRelease(
  release: AppPackageRelease,
  pkg: Pick<AppPackage, "storeUrl" | "client" | "platform" | "packageName">,
  locale: string | null | undefined,
) {
  const storeUrl = release.storeUrl || pkg.storeUrl || null;
  const preferStore =
    pkg.client === "ios_appstore" || pkg.client === "android_play";
  const titleI18n = asCopyMap(release.titleI18n);
  const changelogI18n = asCopyMap(release.changelogI18n);
  const title = pickAppCopy(titleI18n, locale);
  const changelog = pickAppCopy(changelogI18n, locale);
  const resolvedLocale = resolveAppCopyLocale(locale);

  return {
    version_name: release.versionName,
    version_code: release.versionCode,
    locale: resolvedLocale,
    title: title.text,
    changelog: changelog.text,
    title_i18n: titleI18n,
    changelog_i18n: changelogI18n,
    download_url: preferStore ? null : release.downloadUrl,
    store_url: storeUrl,
    /** Convenience: store clients use store_url; direct/sideload use download_url */
    action_url: preferStore ? storeUrl : release.downloadUrl || storeUrl,
    file_size: release.fileSize != null ? Number(release.fileSize) : null,
    checksum: release.checksum,
    force_update: release.forceUpdate,
    published_at: release.publishedAt,
  };
}

const APP_PLATFORMS = ["ios", "android", "windows", "macos"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** Map catalog client → AppPackage.platform */
export function platformFromClient(
  client: ClientChannel | null | undefined,
): AppPlatform | null {
  switch (client) {
    case "ios_appstore":
    case "ios_alt":
      return "ios";
    case "android_play":
    case "android_direct":
      return "android";
    case "windows":
      return "windows";
    case "macos":
      return "macos";
    default:
      return null;
  }
}

/** Normalize raw platform / OS hint (query, x-habibi-os, etc.). */
export function normalizeAppPlatform(
  raw: string | null | undefined,
): AppPlatform | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((APP_PLATFORMS as readonly string[]).includes(v)) return v as AppPlatform;
  if (v.includes("ios") || v === "iphone" || v === "ipad" || v === "iphone os") {
    return "ios";
  }
  if (v.includes("android")) return "android";
  if (v.includes("windows")) return "windows";
  if (v.includes("mac")) return "macos";
  return null;
}

/**
 * Resolve AppPackage by package name.
 * Unique key is (packageName, platform); pass client and/or platform when the
 * same bundle id / applicationId exists on multiple platforms.
 */
export async function findPackageByName(
  packageName: string,
  opts?: {
    client?: ClientChannel | null;
    platform?: string | null;
  },
) {
  const name = packageName.trim();
  if (!name) return null;

  const platform =
    normalizeAppPlatform(opts?.platform) ||
    platformFromClient(opts?.client);

  if (platform) {
    const byKey = await prisma.appPackage.findUnique({
      where: { packageName_platform: { packageName: name, platform } },
    });
    if (byKey) return byKey;
  }

  const matches = await prisma.appPackage.findMany({
    where: { packageName: name },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    take: 2,
  });
  if (matches.length === 1) return matches[0] ?? null;
  // Ambiguous without platform/client — do not guess across platforms
  return null;
}

export async function getLatestPublishedRelease(packageId: string) {
  return prisma.appPackageRelease.findFirst({
    where: { packageId, status: "published" },
    orderBy: { versionCode: "desc" },
  });
}

/**
 * Decide update policy:
 * - none: current >= latest
 * - force: current < package.minSupportVersionCode OR (latest.forceUpdate && current < latest)
 * - optional: current < latest otherwise
 */
export function decideUpdateKind(input: {
  currentVersionCode: number;
  latest: Pick<AppPackageRelease, "versionCode" | "forceUpdate"> | null;
  minSupportVersionCode: number | null;
}): UpdateKind {
  const { currentVersionCode, latest, minSupportVersionCode } = input;
  if (!latest || currentVersionCode >= latest.versionCode) return "none";
  if (
    minSupportVersionCode != null &&
    currentVersionCode < minSupportVersionCode
  ) {
    return "force";
  }
  if (latest.forceUpdate && currentVersionCode < latest.versionCode) {
    return "force";
  }
  return "optional";
}

export async function checkAppUpdate(input: {
  packageName: string;
  versionCode: number;
  client?: ClientChannel | null;
  platform?: string | null;
  locale?: string | null;
}) {
  const pkg = await findPackageByName(input.packageName, {
    client: input.client,
    platform: input.platform,
  });
  if (!pkg || !pkg.enabled) {
    throw Object.assign(new Error("package.unknown"), { statusCode: 404 });
  }

  const latest = await getLatestPublishedRelease(pkg.id);
  const update = decideUpdateKind({
    currentVersionCode: input.versionCode,
    latest,
    minSupportVersionCode: pkg.minSupportVersionCode,
  });

  return {
    update,
    package: {
      id: pkg.id,
      name: pkg.name,
      package_name: pkg.packageName,
      platform: pkg.platform,
      client: pkg.client,
      min_support_version_code: pkg.minSupportVersionCode,
    },
    current_version_code: input.versionCode,
    latest: latest ? publicRelease(latest, pkg, input.locale) : null,
  };
}

export function publicAdminRelease(r: AppPackageRelease) {
  return {
    id: r.id,
    package_id: r.packageId,
    version_name: r.versionName,
    version_code: r.versionCode,
    status: r.status,
    force_update: r.forceUpdate,
    title_i18n: asCopyMap(r.titleI18n),
    changelog_i18n: asCopyMap(r.changelogI18n),
    download_url: r.downloadUrl,
    store_url: r.storeUrl,
    file_size: r.fileSize != null ? Number(r.fileSize) : null,
    checksum: r.checksum,
    artifact_key: r.artifactKey ?? null,
    has_managed_artifact: Boolean(r.artifactKey),
    published_at: r.publishedAt,
    remark: r.remark,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export function parseReleaseCopyInput(body: {
  title_i18n?: unknown;
  changelog_i18n?: unknown;
  /** @deprecated prefer title_i18n */
  title?: unknown;
  /** @deprecated prefer changelog_i18n */
  changelog?: unknown;
}): {
  titleI18n: Prisma.InputJsonValue;
  changelogI18n: Prisma.InputJsonValue;
} {
  let titleI18n = normalizeAppCopyI18n(body.title_i18n, 500);
  let changelogI18n = normalizeAppCopyI18n(body.changelog_i18n, 8000);

  // Backward-compat: single string → zh
  if (!Object.keys(titleI18n).length && typeof body.title === "string" && body.title.trim()) {
    titleI18n = { zh: body.title.trim().slice(0, 500) };
  }
  if (
    !Object.keys(changelogI18n).length &&
    typeof body.changelog === "string" &&
    body.changelog.trim()
  ) {
    changelogI18n = { zh: body.changelog.trim().slice(0, 8000) };
  }

  return {
    titleI18n: titleI18n as Prisma.InputJsonValue,
    changelogI18n: changelogI18n as Prisma.InputJsonValue,
  };
}
