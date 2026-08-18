import type { ClientChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export {
  matchAppleBundle,
  rejectForgedTicketIfLive,
  resolveAndroidPackage,
  type StorePackageRow,
} from "./store-package-match.js";

function err(code: string, status = 400) {
  return Object.assign(new Error(code), { statusCode: status });
}

export async function assertAppleBundleForProject(
  projectId: string,
  bundleId: string,
): Promise<{ id: string; packageName: string }> {
  const name = bundleId.trim();
  if (!name) {
    throw err("iap.bundle_mismatch");
  }
  const pkg = await prisma.appPackage.findFirst({
    where: {
      projectId,
      enabled: true,
      packageName: name,
      OR: [{ platform: "ios" }, { client: "ios_appstore" satisfies ClientChannel }],
    },
    select: { id: true, packageName: true },
  });
  if (!pkg) {
    throw err("iap.bundle_mismatch");
  }
  return pkg;
}

/** Local mock tickets often omit bundleId; use the project's primary iOS 马甲. */
export async function resolveAppleBundleForMockProject(
  projectId: string,
): Promise<string | null> {
  const pkg = await prisma.appPackage.findFirst({
    where: {
      projectId,
      enabled: true,
      OR: [{ platform: "ios" }, { client: "ios_appstore" satisfies ClientChannel }],
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { packageName: true },
  });
  return pkg?.packageName ?? null;
}

/**
 * Play packageName: request body if it matches a project 马甲, otherwise the
 * primary Android / Play package. Env GOOGLE_IAP_PACKAGE_NAME is not used.
 */
export async function resolveAndroidPackageNameForProject(
  projectId: string,
  requested?: string | null,
): Promise<string> {
  const name = requested?.trim() || "";
  if (name) {
    const pkg = await prisma.appPackage.findFirst({
      where: {
        projectId,
        enabled: true,
        packageName: name,
        OR: [{ platform: "android" }, { client: "android_play" satisfies ClientChannel }],
      },
      select: { packageName: true },
    });
    if (!pkg) throw err("iap.package_mismatch");
    return pkg.packageName;
  }
  const fallback = await prisma.appPackage.findFirst({
    where: {
      projectId,
      enabled: true,
      OR: [{ platform: "android" }, { client: "android_play" satisfies ClientChannel }],
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { packageName: true },
  });
  if (!fallback) throw err("iap.package_name_required");
  return fallback.packageName;
}
