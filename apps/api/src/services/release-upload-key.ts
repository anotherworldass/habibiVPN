import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const KEY_PREFIX = "hb_upload_";

export function hashReleaseUploadKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newReleaseUploadKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
}

export function publicReleaseUploadKey(key: {
  id: string;
  name: string;
  enabled: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    enabled: key.enabled,
    revoked_at: key.revokedAt?.toISOString() ?? null,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    created_by_id: key.createdById,
    created_at: key.createdAt.toISOString(),
  };
}

export async function listReleaseUploadKeys(projectId: string) {
  const keys = await prisma.releaseUploadKey.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map(publicReleaseUploadKey);
}

export async function createReleaseUploadKey(input: {
  projectId: string;
  name: string;
  createdById?: string | null;
}) {
  const plaintext = newReleaseUploadKey();
  const key = await prisma.releaseUploadKey.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      keyHash: hashReleaseUploadKey(plaintext),
      createdById: input.createdById ?? null,
    },
  });
  return { key: publicReleaseUploadKey(key), plaintext };
}

export async function revokeReleaseUploadKey(projectId: string, id: string) {
  const existing = await prisma.releaseUploadKey.findFirst({
    where: { id, projectId },
  });
  if (!existing) return null;
  const key = await prisma.releaseUploadKey.update({
    where: { id },
    data: { enabled: false, revokedAt: new Date() },
  });
  return publicReleaseUploadKey(key);
}

export async function findActiveReleaseUploadKey(input: {
  projectId: string;
  packageId: string;
  plaintext: string;
}) {
  const token = input.plaintext.trim();
  if (!token.startsWith(KEY_PREFIX)) return null;
  const key = await prisma.releaseUploadKey.findFirst({
    where: {
      projectId: input.projectId,
      keyHash: hashReleaseUploadKey(token),
      enabled: true,
      revokedAt: null,
    },
  });
  if (!key) return null;

  const pkg = await prisma.appPackage.findFirst({
    where: { id: input.packageId, projectId: input.projectId },
    select: { id: true },
  });
  return pkg ? key : null;
}

export async function touchReleaseUploadKey(id: string) {
  await prisma.releaseUploadKey.updateMany({
    where: { id, enabled: true, revokedAt: null },
    data: { lastUsedAt: new Date() },
  });
}
