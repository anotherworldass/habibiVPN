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
  ADMIN_BOOTSTRAP_USERNAME: z.string().default("admin"),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default("admin123"),
  /** Public H5 origin for invite links */
  WEB_PUBLIC_ORIGIN: z.string().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof schema>;

export const env: AppConfig = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
