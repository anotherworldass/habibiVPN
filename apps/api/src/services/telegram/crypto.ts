import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { paymentConfigEncryptionKey } from "../../config.js";

const key = createHash("sha256").update(paymentConfigEncryptionKey, "utf8").digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw Object.assign(new Error("telegram.token_invalid"), { statusCode: 500 });
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString("base64url");
}

/** Validate Telegram WebApp initData (HMAC-SHA256). */
export function validateWebAppInitData(
  initData: string,
  botToken: string,
  opts?: { maxAgeSec?: number },
): Record<string, string> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw Object.assign(new Error("telegram.init_data_missing_hash"), { statusCode: 401 });
  }
  params.delete("hash");

  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(calculated, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Object.assign(new Error("telegram.init_data_invalid"), { statusCode: 401 });
  }

  const authDate = Number(params.get("auth_date") || 0);
  const maxAge = opts?.maxAgeSec ?? 86400;
  if (!authDate || Date.now() / 1000 - authDate > maxAge) {
    throw Object.assign(new Error("telegram.init_data_expired"), { statusCode: 401 });
  }

  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
};

export function parseWebAppUser(raw: string | undefined): TelegramWebAppUser {
  if (!raw) {
    throw Object.assign(new Error("telegram.user_missing"), { statusCode: 401 });
  }
  try {
    const u = JSON.parse(raw) as TelegramWebAppUser;
    if (!u?.id) throw new Error("no id");
    return u;
  } catch {
    throw Object.assign(new Error("telegram.user_invalid"), { statusCode: 401 });
  }
}
