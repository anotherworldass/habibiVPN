import { randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getStorageS3ProfilesBundle,
  normalizePublicBaseUrl,
  normalizeStorageKeyPrefix,
  type StorageS3Profile,
  type StorageS3Value,
} from "../system-settings.js";

export type StorageS3ProbeStep = {
  step: "upload" | "head" | "public_get" | "delete";
  ok: boolean;
  ms: number;
  detail?: string | null;
};

export type StorageS3ProbeResult = {
  ok: boolean;
  profile_id: string;
  profile_name: string;
  bucket: string;
  key: string;
  public_url: string;
  steps: StorageS3ProbeStep[];
  error?: string | null;
};

function s3ClientFor(cfg: StorageS3Value): S3Client {
  return new S3Client({
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
}

function toCreds(profile: StorageS3Profile): StorageS3Value {
  return {
    region: profile.region,
    bucket: profile.bucket,
    accessKeyId: profile.accessKeyId,
    secretAccessKey: profile.secretAccessKey,
    publicBaseUrl: profile.publicBaseUrl,
    endpoint: profile.endpoint ?? null,
    forcePathStyle: profile.forcePathStyle === true,
    keyPrefix: normalizeStorageKeyPrefix(profile.keyPrefix),
  };
}

function buildProbeKey(cfg: StorageS3Value, projectId: string): string {
  const prefix = normalizeStorageKeyPrefix(cfg.keyPrefix);
  const stamp = Date.now().toString(36);
  const rand = randomBytes(6).toString("hex");
  return `${prefix}__habibi_probe__/${projectId}/${stamp}_${rand}.txt`;
}

function publicUrlForKey(cfg: StorageS3Value, key: string): string {
  const base = normalizePublicBaseUrl(cfg.publicBaseUrl);
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function errDetail(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "object" && err) {
    const e = err as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name : "";
    const msg = typeof e.message === "string" ? e.message : "";
    const code =
      (typeof e.Code === "string" && e.Code) ||
      (typeof e.code === "string" && e.code) ||
      "";
    return [name, code, msg].filter(Boolean).join(" — ") || String(err);
  }
  return String(err);
}

async function timedStep(
  step: StorageS3ProbeStep["step"],
  fn: () => Promise<string | void>,
): Promise<StorageS3ProbeStep> {
  const started = Date.now();
  try {
    const detail = await fn();
    return {
      step,
      ok: true,
      ms: Date.now() - started,
      detail: detail || null,
    };
  } catch (err) {
    return {
      step,
      ok: false,
      ms: Date.now() - started,
      detail: errDetail(err),
    };
  }
}

/**
 * Upload a tiny probe object, verify via HeadObject (+ optional public GET), then delete.
 */
export async function probeStorageS3Profile(input: {
  projectId: string;
  profileId: string;
  /** Also try HTTP GET against publicBaseUrl (may fail if private bucket / CDN delay). */
  checkPublic?: boolean;
}): Promise<StorageS3ProbeResult> {
  const bundle = await getStorageS3ProfilesBundle(input.projectId);
  const profile = bundle.profiles.find((p) => p.id === input.profileId);
  if (!profile) {
    throw Object.assign(new Error("storage.s3.not_found"), { statusCode: 404 });
  }
  if (!profile.secretAccessKey?.trim()) {
    throw Object.assign(new Error("storage.s3.secret_missing"), {
      statusCode: 400,
      message: "缺少 Secret Access Key，请先保存密钥后再测试",
    });
  }

  const cfg = toCreds(profile);
  const key = buildProbeKey(cfg, input.projectId);
  const publicUrl = publicUrlForKey(cfg, key);
  const body = `habibi-s3-probe ${input.projectId} ${profile.id} ${new Date().toISOString()}\n`;
  const client = s3ClientFor(cfg);
  const steps: StorageS3ProbeStep[] = [];

  const upload = await timedStep("upload", async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: Buffer.from(body, "utf8"),
        ContentType: "text/plain; charset=utf-8",
        CacheControl: "no-store",
      }),
    );
    return `uploaded ${Buffer.byteLength(body)} bytes`;
  });
  steps.push(upload);

  if (upload.ok) {
    steps.push(
      await timedStep("head", async () => {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
        );
        return `etag=${head.ETag || "-"} size=${head.ContentLength ?? "-"}`;
      }),
    );

    if (input.checkPublic !== false) {
      steps.push(
        await timedStep("public_get", async () => {
          const res = await fetch(publicUrl, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(12_000),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
          }
          const text = await res.text();
          if (!text.includes("habibi-s3-probe")) {
            throw new Error("public body mismatch");
          }
          return `HTTP ${res.status}, ${text.length} bytes`;
        }),
      );
    }

    steps.push(
      await timedStep("delete", async () => {
        await client.send(
          new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
        );
        return "deleted";
      }),
    );
  }

  const ok = steps.length > 0 && steps.every((s) => s.ok);
  const failed = steps.find((s) => !s.ok);
  return {
    ok,
    profile_id: profile.id,
    profile_name: profile.name,
    bucket: cfg.bucket,
    key,
    public_url: publicUrl,
    steps,
    error: failed?.detail || null,
  };
}
