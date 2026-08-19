type PackageTarget = {
  client: string;
  storeUrl: string | null;
};

type ReleaseTarget = {
  downloadUrl: string | null;
  storeUrl: string | null;
} | null;

export function resolveDownloadActionUrl(
  pkg: PackageTarget,
  release: ReleaseTarget,
): string | null {
  const storeUrl = release?.storeUrl || pkg.storeUrl || null;
  const preferStore = pkg.client === "ios_appstore" || pkg.client === "android_play";
  if (preferStore) return storeUrl;
  return release?.downloadUrl || storeUrl;
}

export function uniquePackagesByPlatform<T extends { platform: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.platform)) return false;
    seen.add(row.platform);
    return true;
  });
}

export function downloadVersionBucket(
  release: { id: string; versionName: string; versionCode: number } | null,
) {
  return {
    releaseId: release?.id ?? null,
    versionKey: release?.id ?? "unversioned",
    versionName: release?.versionName ?? null,
    versionCode: release?.versionCode ?? null,
  };
}

export function shanghaiDay(now = new Date()): Date {
  const day = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}
