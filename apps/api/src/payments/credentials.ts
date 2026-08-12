import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { paymentConfigEncryptionKey } from "../config.js";
import type { PaymentCredentials } from "./types.js";

const key = createHash("sha256").update(paymentConfigEncryptionKey, "utf8").digest();

export function encryptCredentials(credentials: PaymentCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptCredentials(value: string | null): PaymentCredentials {
  if (!value) throw Object.assign(new Error("payment.credentials_missing"), { statusCode: 503 });
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("payment.credentials_invalid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as PaymentCredentials;
}
