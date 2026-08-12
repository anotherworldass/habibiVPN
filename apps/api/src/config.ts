import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load repo-root .env then apps/api/.env
loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(3001),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:8000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  JWT_USER_SECRET: z.string().min(8),
  JWT_ADMIN_SECRET: z.string().min(8),
  WIRERAW_HOST: z.string().url(),
  WIRERAW_SUB_HOST: z.string().optional(),
  WIRERAW_KEY_ID: z.string().min(1),
  WIRERAW_KEY_SECRET: z.string().min(1),
  WIRERAW_MERCHANT_ID: z.string().optional(),
  /**
   * Optional HTTP(S) proxy for WireRaw outbound calls (e.g. local Clash).
   * Leave unset in production so the API dials WireRaw directly.
   */
  WIRERAW_HTTP_PROXY: z.string().url().optional(),
  ADMIN_BOOTSTRAP_USERNAME: z.string().default("admin"),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default("admin123"),
  /** Public H5 origin for invite links */
  WEB_PUBLIC_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public API origin used to build asynchronous payment callback URLs */
  API_PUBLIC_ORIGIN: z.string().url().default("http://localhost:3001"),
  /** Optional dedicated key; JWT admin secret is used when omitted. */
  PAYMENT_CONFIG_ENCRYPTION_KEY: z.string().min(16).optional(),
  /** Apple IAP: mock skips real JWS verify (local smoke). */
  APPLE_IAP_MODE: z.enum(["live", "mock"]).default("mock"),
  APPLE_IAP_BUNDLE_ID: z.string().optional(),
  APPLE_IAP_ISSUER_ID: z.string().optional(),
  APPLE_IAP_KEY_ID: z.string().optional(),
  APPLE_IAP_PRIVATE_KEY: z.string().optional(),
  APPLE_IAP_ENV: z.enum(["Sandbox", "Production"]).default("Sandbox"),
  /** Google Play Billing: mock skips Publisher API (local smoke). */
  GOOGLE_IAP_MODE: z.enum(["live", "mock"]).default("mock"),
  GOOGLE_IAP_PACKAGE_NAME: z.string().optional(),
  /** Service account JSON string (Android Publisher scope). */
  GOOGLE_IAP_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /**
   * When true (default in development), forgot-password response includes reset_code
   * so clients can test without an email provider.
   */
  PASSWORD_RESET_DEV_RETURN_CODE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v == null ? undefined : v === "true")),
  /** bootstrap: max requests per IP per minute (in-memory). */
  BOOTSTRAP_IP_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  /** bootstrap: max *new* anonymous users per device_id per 24h. */
  BOOTSTRAP_DEVICE_NEW_PER_DAY: z.coerce.number().int().positive().default(2),
  /** When true, reject bootstrap without client_meta.device_id / x-habibi-device-id. */
  BOOTSTRAP_REQUIRE_DEVICE_ID: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type AppConfig = z.infer<typeof schema>;

export const env: AppConfig = schema.parse(process.env);

export const paymentConfigEncryptionKey =
  env.PAYMENT_CONFIG_ENCRYPTION_KEY || env.JWT_ADMIN_SECRET;

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
