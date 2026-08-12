import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { USER_API_PREFIX } from "@habibi/shared";
import { env } from "../../config.js";
import {
  getActiveStorageS3,
  listStorageS3PublicBaseUrls,
  type StorageS3Value,
} from "../system-settings.js";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const s3Clients = new Map<string, S3Client>();

function uploadRoot(): string {
  return resolve(process.cwd(), "data", "support-uploads");
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF89a") {
    return "image/gif";
  }
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF87a") {
    return "image/gif";
  }
  return null;
}

function localMediaPrefix(): string {
  return `${env.API_PUBLIC_ORIGIN.replace(/\/$/, "")}${USER_API_PREFIX}/support/media/`;
}

function s3ClientFor(cfg: StorageS3Value): S3Client {
  const cacheKey = [
    cfg.region,
    cfg.endpoint || "",
    cfg.accessKeyId,
    cfg.forcePathStyle ? "1" : "0",
  ].join("|");
  const hit = s3Clients.get(cacheKey);
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
  s3Clients.set(cacheKey, client);
  return client;
}

function buildObjectKey(cfg: StorageS3Value, projectId: string, fileName: string) {
  const prefix = (cfg.keyPrefix || "").replace(/^\/+/, "");
  const normalized = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  return `${normalized}${projectId}/${fileName}`;
}

function publicUrlForKey(cfg: StorageS3Value, key: string): string {
  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function parseImageDataUrlOrBase64(input: {
  data?: string;
  mime?: string | null;
}): { buffer: Buffer; mime: string } {
  const raw = (input.data || "").trim();
  if (!raw) {
    throw Object.assign(new Error("support.image_empty"), { statusCode: 400 });
  }

  let mime = input.mime?.trim().toLowerCase() || "";
  let b64 = raw;
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(raw);
  if (dataUrl) {
    mime = dataUrl[1].toLowerCase();
    b64 = dataUrl[2];
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    throw Object.assign(new Error("support.image_invalid"), { statusCode: 400 });
  }
  if (!buffer.length) {
    throw Object.assign(new Error("support.image_empty"), { statusCode: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error("support.image_too_large"), { statusCode: 413 });
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed || !MIME_EXT[sniffed]) {
    throw Object.assign(new Error("support.image_type_unsupported"), {
      statusCode: 400,
    });
  }
  if (mime && mime !== sniffed && !(mime === "image/jpg" && sniffed === "image/jpeg")) {
    if (!mime.startsWith("image/")) {
      throw Object.assign(new Error("support.image_type_unsupported"), {
        statusCode: 400,
      });
    }
  }
  return { buffer, mime: sniffed };
}

async function saveToLocal(input: {
  projectId: string;
  buffer: Buffer;
  mime: string;
  fileName: string;
}): Promise<string> {
  const dir = join(uploadRoot(), input.projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, input.fileName), input.buffer);
  return `${localMediaPrefix()}${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.fileName)}`;
}

async function saveToS3(input: {
  projectId: string;
  buffer: Buffer;
  mime: string;
  fileName: string;
  cfg: StorageS3Value;
}): Promise<string> {
  const key = buildObjectKey(input.cfg, input.projectId, input.fileName);
  const client = s3ClientFor(input.cfg);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: input.cfg.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (err) {
    throw Object.assign(
      new Error(
        err instanceof Error ? `support.s3_upload_failed: ${err.message}` : "support.s3_upload_failed",
      ),
      { statusCode: 502 },
    );
  }
  return publicUrlForKey(input.cfg, key);
}

export async function saveSupportImage(input: {
  projectId: string;
  buffer: Buffer;
  mime: string;
}): Promise<{ fileName: string; mediaUrl: string; mime: string; backend: "s3" | "local" }> {
  const ext = MIME_EXT[input.mime];
  if (!ext) {
    throw Object.assign(new Error("support.image_type_unsupported"), {
      statusCode: 400,
    });
  }
  const hash = createHash("sha256").update(input.buffer).digest("hex").slice(0, 16);
  const fileName = `${Date.now().toString(36)}_${randomBytes(8).toString("hex")}_${hash}.${ext}`;

  const s3 = await getActiveStorageS3(input.projectId);
  if (s3) {
    const mediaUrl = await saveToS3({
      projectId: input.projectId,
      buffer: input.buffer,
      mime: input.mime,
      fileName,
      cfg: s3,
    });
    return { fileName, mediaUrl, mime: input.mime, backend: "s3" };
  }

  const mediaUrl = await saveToLocal({
    projectId: input.projectId,
    buffer: input.buffer,
    mime: input.mime,
    fileName,
  });
  return { fileName, mediaUrl, mime: input.mime, backend: "local" };
}

export async function readSupportImage(projectId: string, fileName: string) {
  if (
    !projectId ||
    !fileName ||
    projectId.includes("..") ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    return null;
  }
  if (!/^[a-z0-9._-]+\.(jpg|png|webp|gif)$/i.test(fileName)) {
    return null;
  }
  const full = join(uploadRoot(), projectId, fileName);
  try {
    await access(full);
  } catch {
    return null;
  }
  const buffer = await readFile(full);
  const mime = sniffMime(buffer) || "application/octet-stream";
  return { buffer, mime };
}

/**
 * Allow local media endpoint or any of this project's S3 publicBaseUrls.
 */
export async function assertOwnSupportMediaUrl(
  projectId: string,
  url: string,
): Promise<string> {
  const u = url.trim();
  if (u.startsWith(localMediaPrefix())) return u;

  const bases = await listStorageS3PublicBaseUrls(projectId);
  for (const base of bases) {
    if (u.startsWith(base)) return u;
  }

  throw Object.assign(new Error("support.media_url_invalid"), {
    statusCode: 400,
  });
}
