import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  normalizePublicBaseUrl,
  normalizeStorageKeyPrefix,
  type StorageS3Value,
} from "../system-settings.js";

const clients = new Map<string, S3Client>();

export function s3ClientFor(cfg: StorageS3Value): S3Client {
  const cacheKey = [
    cfg.region,
    cfg.endpoint || "",
    cfg.accessKeyId,
    cfg.forcePathStyle ? "1" : "0",
  ].join("|");
  const hit = clients.get(cacheKey);
  if (hit) return hit;
  const client = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    ...(cfg.endpoint
      ? {
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle !== false,
        }
      : cfg.forcePathStyle
        ? { forcePathStyle: true }
        : {}),
  });
  clients.set(cacheKey, client);
  return client;
}

export function publicUrlForKey(cfg: StorageS3Value, key: string): string {
  const base = normalizePublicBaseUrl(cfg.publicBaseUrl);
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function withKeyPrefix(cfg: StorageS3Value, relativeKey: string): string {
  const prefix = normalizeStorageKeyPrefix(cfg.keyPrefix);
  const rel = relativeKey.replace(/^\/+/, "");
  return `${prefix}${rel}`;
}

export async function putObjectToTargets(input: {
  targets: StorageS3Value[];
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ primaryUrl: string; uploaded: number }> {
  if (!input.targets.length) {
    throw Object.assign(new Error("storage.s3.app_dist_unbound"), {
      statusCode: 400,
      message: "请先在对象存储中绑定 App 分发桶",
    });
  }
  let primaryUrl = "";
  let uploaded = 0;
  const errors: string[] = [];
  for (const cfg of input.targets) {
    try {
      const client = s3ClientFor(cfg);
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      uploaded += 1;
      if (!primaryUrl) primaryUrl = publicUrlForKey(cfg, input.key);
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
  return { primaryUrl, uploaded };
}

export async function deleteObjectFromTargets(input: {
  targets: StorageS3Value[];
  key: string;
}): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0;
  const errors: string[] = [];
  for (const cfg of input.targets) {
    try {
      const client = s3ClientFor(cfg);
      await client.send(
        new DeleteObjectCommand({
          Bucket: cfg.bucket,
          Key: input.key,
        }),
      );
      deleted += 1;
    } catch (err) {
      errors.push(
        `${cfg.bucket}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { deleted, errors };
}
