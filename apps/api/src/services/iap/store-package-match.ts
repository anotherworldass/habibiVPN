function err(code: string, status = 400) {
  return Object.assign(new Error(code), { statusCode: status });
}

/** Process-level switch: live rejects forged mock tickets. Never per-package. */
export function rejectForgedTicketIfLive(
  mode: "live" | "mock",
  raw: string,
): void {
  if (mode === "live" && (raw.startsWith("mock:") || raw.startsWith("{"))) {
    throw err("iap.mock_not_allowed_in_live");
  }
}

export type StorePackageRow = {
  projectId: string;
  enabled: boolean;
  packageName: string;
  platform: string;
  client: string;
  isPrimary: boolean;
  createdAt: number;
};

function isAppleStorePackage(row: Pick<StorePackageRow, "platform" | "client">) {
  return row.platform === "ios" || row.client === "ios_appstore";
}

function isAndroidStorePackage(row: Pick<StorePackageRow, "platform" | "client">) {
  return row.platform === "android" || row.client === "android_play";
}

/** Same-project enabled iOS / App Store 马甲 whose packageName is the JWS bundleId. */
export function matchAppleBundle(
  packages: StorePackageRow[],
  projectId: string,
  bundleId: string,
): StorePackageRow | null {
  const name = bundleId.trim();
  if (!name) return null;
  return (
    packages.find(
      (p) =>
        p.projectId === projectId &&
        p.enabled &&
        p.packageName === name &&
        isAppleStorePackage(p),
    ) ?? null
  );
}

export function resolveAndroidPackage(
  packages: StorePackageRow[],
  projectId: string,
  requested?: string | null,
): { packageName: string } | { error: string } {
  const inProject = packages
    .filter(
      (p) =>
        p.projectId === projectId && p.enabled && isAndroidStorePackage(p),
    )
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt - b.createdAt,
    );
  const name = requested?.trim() || "";
  if (name) {
    const hit = inProject.find((p) => p.packageName === name);
    return hit
      ? { packageName: hit.packageName }
      : { error: "iap.package_mismatch" };
  }
  return inProject[0]
    ? { packageName: inProject[0].packageName }
    : { error: "iap.package_name_required" };
}
