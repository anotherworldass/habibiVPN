import type { AppPackage, AppPackageRelease } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getLatestPublishedRelease } from "./app-update.js";
import {
  downloadVersionBucket,
  resolveDownloadActionUrl,
  shanghaiDay,
  uniquePackagesByPlatform,
} from "./app-download-policy.js";
import { resolveSource, type ResolvedSource } from "./project.js";

type DownloadPackage = AppPackage & { releases: AppPackageRelease[] };

function releaseActionUrl(pkg: AppPackage, release: AppPackageRelease | null): string | null {
  return resolveDownloadActionUrl(pkg, release);
}

function publicDownload(pkg: DownloadPackage) {
  const release = pkg.releases[0] ?? null;
  const actionUrl = releaseActionUrl(pkg, release);
  return {
    id: pkg.id,
    name: pkg.name,
    package_name: pkg.packageName,
    platform: pkg.platform,
    client: pkg.client,
    version_name: release?.versionName ?? null,
    action_url: actionUrl,
    store: pkg.client === "ios_appstore" || pkg.client === "android_play",
  };
}

export async function listPublicDownloads(input: {
  projectCode?: string | null;
  siteHost?: string | null;
  packageName?: string | null;
  platform?: string | null;
}) {
  const source: ResolvedSource = await resolveSource({
    siteHost: input.siteHost,
    projectCode: input.projectCode,
  });

  const rows = await prisma.appPackage.findMany({
    where: {
      projectId: source.projectId,
      enabled: true,
      ...(input.packageName
        ? {
            packageName: input.packageName.trim(),
            ...(input.platform ? { platform: input.platform.trim().toLowerCase() } : {}),
          }
        : { listedOnWeb: true }),
    },
    include: {
      releases: {
        where: { status: "published" },
        orderBy: { versionCode: "desc" },
        take: 1,
      },
    },
    orderBy: [{ platform: "asc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
  });

  // Application-level uniqueness protects old data that may have several primaries per platform.
  const packages = input.packageName
    ? rows
    : uniquePackagesByPlatform(rows);

  return {
    project: { id: source.projectId, code: source.projectCode },
    items: packages.map(publicDownload),
  };
}

export async function recordDownloadAndResolve(input: {
  packageName: string;
  platform: string;
}): Promise<string> {
  const pkg = await prisma.appPackage.findUnique({
    where: {
      packageName_platform: {
        packageName: input.packageName.trim(),
        platform: input.platform.trim().toLowerCase(),
      },
    },
  });
  if (!pkg || !pkg.enabled) {
    throw Object.assign(new Error("package.unknown"), { statusCode: 404 });
  }

  const release = await getLatestPublishedRelease(pkg.id);
  const actionUrl = releaseActionUrl(pkg, release);
  if (!actionUrl) {
    throw Object.assign(new Error("download.unavailable"), { statusCode: 404 });
  }

  const day = shanghaiDay();
  const version = downloadVersionBucket(release);
  await prisma.$transaction([
    prisma.appPackage.update({
      where: { id: pkg.id },
      data: { downloadCount: { increment: 1 } },
    }),
    prisma.appDownloadDaily.upsert({
      where: {
        packageId_versionKey_day: {
          packageId: pkg.id,
          versionKey: version.versionKey,
          day,
        },
      },
      create: {
        packageId: pkg.id,
        ...version,
        day,
        count: 1,
      },
      update: { count: { increment: 1 } },
    }),
  ]);
  return actionUrl;
}
