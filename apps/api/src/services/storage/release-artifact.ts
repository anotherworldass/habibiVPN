import { createHash } from "node:crypto";
import type { AppPackage, AppPackageRelease, Project } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { parseReleaseCopyInput, publicAdminRelease } from "../app-update.js";
import { getActiveStorageS3ListFor } from "../system-settings.js";
import {
  deleteObjectFromTargets,
  publicUrlForKey,
  putObjectToTargets,
  withKeyPrefix,
} from "./s3-client.js";

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024; // 512MB

const SAFE_FILENAME = /^[A-Za-z0-9._+-]+$/;

function sanitizePathSegment(raw: string): string {
  return raw
    .trim()
    .replace(/[^A-Za-z0-9._+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128) || "x";
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop()?.trim() || "artifact.bin";
  const cleaned = base.replace(/[^A-Za-z0-9._+-]+/g, "_").slice(0, 180);
  if (!SAFE_FILENAME.test(cleaned) || cleaned === "." || cleaned === "..") {
    return "artifact.bin";
  }
  return cleaned;
}

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (lower.endsWith(".ipa")) return "application/octet-stream";
  if (lower.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (lower.endsWith(".msi")) return "application/x-msi";
  if (lower.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (lower.endsWith(".pkg")) return "application/octet-stream";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".msix") || lower.endsWith(".appx")) {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

/**
 * Relative key under the profile's keyPrefix (e.g. download/).
 * Full object key: {keyPrefix}{project}/{pkg}/{platform}/{ver}-{code}/{file}
 */
export function buildReleaseArtifactRelativeKey(input: {
  projectCode: string;
  packageName: string;
  platform: string;
  versionName: string;
  versionCode: number;
  filename: string;
}): string {
  const file = sanitizeFilename(input.filename);
  return [
    sanitizePathSegment(input.projectCode),
    sanitizePathSegment(input.packageName),
    sanitizePathSegment(input.platform),
    `${sanitizePathSegment(input.versionName)}-${input.versionCode}`,
    file,
  ].join("/");
}

async function deleteRelativeKey(projectId: string, relativeKey: string) {
  const targets = await getActiveStorageS3ListFor(projectId, "app_dist");
  if (!targets.length || !relativeKey) return { deleted: 0, errors: [] as string[] };
  // Delete under each target's own prefix.
  let deleted = 0;
  const errors: string[] = [];
  for (const cfg of targets) {
    const key = withKeyPrefix(cfg, relativeKey);
    const result = await deleteObjectFromTargets({ targets: [cfg], key });
    deleted += result.deleted;
    errors.push(...result.errors);
  }
  return { deleted, errors };
}

async function uploadRelativeKey(input: {
  projectId: string;
  relativeKey: string;
  body: Buffer;
  contentType: string;
}) {
  const targets = await getActiveStorageS3ListFor(input.projectId, "app_dist");
  if (!targets.length) {
    throw Object.assign(new Error("storage.s3.app_dist_unbound"), {
      statusCode: 400,
      message: "请先在对象存储中绑定 App 分发桶",
    });
  }
  let primaryUrl = "";
  let uploaded = 0;
  const errors: string[] = [];
  for (const cfg of targets) {
    const key = withKeyPrefix(cfg, input.relativeKey);
    try {
      const result = await putObjectToTargets({
        targets: [cfg],
        key,
        body: input.body,
        contentType: input.contentType,
      });
      uploaded += result.uploaded;
      if (!primaryUrl) primaryUrl = publicUrlForKey(cfg, key);
    } catch (err) {
      errors.push(
        `${cfg.bucket}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (!uploaded) {
    throw Object.assign(new Error("storage.s3.upload_failed"), {
      statusCode: 502,
      message: `上传失败：${errors.join(" | ") || "unknown"}`,
    });
  }
  return { primaryUrl, uploaded, mirrored: targets.length };
}

export async function upsertReleaseWithArtifact(input: {
  projectId: string;
  packageId: string;
  buffer: Buffer;
  filename: string;
  versionName: string;
  versionCode: number;
  replace?: boolean;
  forceUpdate?: boolean;
  status?: "draft" | "published" | "archived";
  storeUrl?: string | null;
  remark?: string | null;
  title_i18n?: unknown;
  changelog_i18n?: unknown;
  title?: unknown;
  changelog?: unknown;
}) {
  if (!input.buffer.length) {
    throw Object.assign(new Error("release.artifact_empty"), {
      statusCode: 400,
      message: "安装包文件为空",
    });
  }
  if (input.buffer.length > MAX_ARTIFACT_BYTES) {
    throw Object.assign(new Error("release.artifact_too_large"), {
      statusCode: 413,
      message: `安装包超过 ${MAX_ARTIFACT_BYTES} 字节上限`,
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, code: true },
  });
  if (!project) {
    throw Object.assign(new Error("project.not_found"), { statusCode: 404 });
  }
  const pkg = await prisma.appPackage.findFirst({
    where: { id: input.packageId, projectId: input.projectId },
  });
  if (!pkg) {
    throw Object.assign(new Error("package.not_found"), { statusCode: 404 });
  }

  const existing = await prisma.appPackageRelease.findUnique({
    where: {
      packageId_versionCode: {
        packageId: input.packageId,
        versionCode: input.versionCode,
      },
    },
  });

  if (existing?.status === "published" && !input.replace) {
    throw Object.assign(new Error("release.published_replace_required"), {
      statusCode: 409,
      message: "已发布版本重传需 replace=true",
    });
  }

  const filename = sanitizeFilename(input.filename);
  const relativeKey = buildReleaseArtifactRelativeKey({
    projectCode: project.code,
    packageName: pkg.packageName || pkg.name,
    platform: pkg.platform,
    versionName: input.versionName,
    versionCode: input.versionCode,
    filename,
  });

  // Drop previous object if key changed or re-upload.
  if (existing?.artifactKey && existing.artifactKey !== relativeKey) {
    await deleteRelativeKey(input.projectId, existing.artifactKey);
  } else if (existing?.artifactKey) {
    // Same key: still delete first for multi-bucket consistency.
    await deleteRelativeKey(input.projectId, existing.artifactKey);
  }

  const checksum =
    "sha256:" + createHash("sha256").update(input.buffer).digest("hex");
  const contentType = guessContentType(filename);
  const uploaded = await uploadRelativeKey({
    projectId: input.projectId,
    relativeKey,
    body: input.buffer,
    contentType,
  });

  const touchCopy =
    input.title_i18n !== undefined ||
    input.changelog_i18n !== undefined ||
    input.title !== undefined ||
    input.changelog !== undefined;
  const copy = touchCopy
    ? parseReleaseCopyInput({
        title_i18n: input.title_i18n,
        changelog_i18n: input.changelog_i18n,
        title: input.title,
        changelog: input.changelog,
      })
    : null;
  const status = input.status ?? existing?.status ?? "draft";
  const becomingPublished =
    status === "published" && existing?.status !== "published";

  const data = {
    versionName: input.versionName.trim(),
    versionCode: input.versionCode,
    status,
    forceUpdate: input.forceUpdate ?? existing?.forceUpdate ?? false,
    ...(copy
      ? { titleI18n: copy.titleI18n, changelogI18n: copy.changelogI18n }
      : {}),
    downloadUrl: uploaded.primaryUrl,
    storeUrl:
      input.storeUrl !== undefined
        ? input.storeUrl
        : (existing?.storeUrl ?? null),
    fileSize: BigInt(input.buffer.length),
    checksum,
    artifactKey: relativeKey,
    remark:
      input.remark !== undefined ? input.remark : (existing?.remark ?? null),
    publishedAt: becomingPublished
      ? new Date()
      : status === "published"
        ? (existing?.publishedAt ?? new Date())
        : existing?.publishedAt ?? null,
  };

  const release = existing
    ? await prisma.appPackageRelease.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.appPackageRelease.create({
        data: {
          packageId: input.packageId,
          ...data,
        },
      });

  return {
    release: publicAdminRelease(release),
    upload: {
      artifact_key: relativeKey,
      uploaded_buckets: uploaded.uploaded,
      mirrored_targets: uploaded.mirrored,
      file_size: input.buffer.length,
      checksum,
      download_url: uploaded.primaryUrl,
    },
  };
}

export async function deleteReleaseArtifact(input: {
  projectId: string;
  packageId: string;
  releaseId: string;
}) {
  const existing = await prisma.appPackageRelease.findFirst({
    where: { id: input.releaseId, packageId: input.packageId },
    include: {
      package: { select: { projectId: true } },
    },
  });
  if (!existing || existing.package.projectId !== input.projectId) {
    throw Object.assign(new Error("release.not_found"), { statusCode: 404 });
  }
  if (!existing.artifactKey) {
    throw Object.assign(new Error("release.artifact_not_managed"), {
      statusCode: 400,
      message: "该版本安装包非系统上传（外链），无法删桶内对象",
    });
  }

  const del = await deleteRelativeKey(input.projectId, existing.artifactKey);
  const release = await prisma.appPackageRelease.update({
    where: { id: existing.id },
    data: {
      downloadUrl: null,
      fileSize: null,
      checksum: null,
      artifactKey: null,
    },
  });

  return {
    release: publicAdminRelease(release),
    deleted_buckets: del.deleted,
    errors: del.errors,
  };
}

/** Best-effort remove managed object when deleting a release row. */
export async function deleteManagedArtifactIfAny(
  projectId: string,
  release: Pick<AppPackageRelease, "artifactKey">,
) {
  if (!release.artifactKey) return;
  try {
    await deleteRelativeKey(projectId, release.artifactKey);
  } catch {
    // ignore — row delete should still proceed
  }
}

export type { AppPackage, Project };
