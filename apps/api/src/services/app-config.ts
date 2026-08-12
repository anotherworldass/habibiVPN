import { z } from "zod";
import type { AppPackage, ClientChannel, Prisma } from "@prisma/client";
import {
  DEFAULT_APP_CLIENT_FEATURE_FLAGS,
  DEFAULT_APP_CLIENT_SUPPORT,
  emptyAppClientConfigBody,
  normalizeHttpBaseList,
  type AppClientConfigBody,
} from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { findPackageByName } from "./app-update.js";

const supportSchema = z
  .object({
    telegram: z.string().max(500).nullable().optional(),
    email: z.string().max(320).nullable().optional(),
  })
  .passthrough()
  .optional();

const flagsSchema = z
  .object({
    iap_enabled: z.boolean().optional(),
    promo_enabled: z.boolean().optional(),
  })
  .passthrough()
  .optional();

/** Admin write / stored JSON shape (snake_case). */
export const appClientConfigWriteSchema = z
  .object({
    api_bases: z.array(z.string()).max(32).optional(),
    h5_bases: z.array(z.string()).max(32).optional(),
    support: supportSchema,
    feature_flags: flagsSchema,
    extras: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export function normalizeClientConfig(raw: unknown): AppClientConfigBody {
  const base = emptyAppClientConfigBody();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const parsed = appClientConfigWriteSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : (raw as Record<string, unknown>);

  const supportIn =
    data.support && typeof data.support === "object" && !Array.isArray(data.support)
      ? (data.support as Record<string, unknown>)
      : {};
  const flagsIn =
    data.feature_flags &&
    typeof data.feature_flags === "object" &&
    !Array.isArray(data.feature_flags)
      ? (data.feature_flags as Record<string, unknown>)
      : {};

  const extrasRaw =
    data.extras && typeof data.extras === "object" && !Array.isArray(data.extras)
      ? (data.extras as Record<string, unknown>)
      : {};

  return {
    api_bases: normalizeHttpBaseList(data.api_bases),
    h5_bases: normalizeHttpBaseList(data.h5_bases),
    support: {
      telegram:
        typeof supportIn.telegram === "string" && supportIn.telegram.trim()
          ? supportIn.telegram.trim().slice(0, 500)
          : supportIn.telegram === null
            ? null
            : DEFAULT_APP_CLIENT_SUPPORT.telegram,
      email:
        typeof supportIn.email === "string" && supportIn.email.trim()
          ? supportIn.email.trim().slice(0, 320)
          : supportIn.email === null
            ? null
            : DEFAULT_APP_CLIENT_SUPPORT.email,
    },
    feature_flags: {
      iap_enabled:
        typeof flagsIn.iap_enabled === "boolean"
          ? flagsIn.iap_enabled
          : DEFAULT_APP_CLIENT_FEATURE_FLAGS.iap_enabled,
      promo_enabled:
        typeof flagsIn.promo_enabled === "boolean"
          ? flagsIn.promo_enabled
          : DEFAULT_APP_CLIENT_FEATURE_FLAGS.promo_enabled,
    },
    extras: extrasRaw,
  };
}

export function clientConfigToPrismaJson(
  body: AppClientConfigBody,
): Prisma.InputJsonValue {
  return body as unknown as Prisma.InputJsonValue;
}

export function publicAppConfig(pkg: AppPackage) {
  const cfg = normalizeClientConfig(pkg.clientConfig);
  return {
    package: {
      package_name: pkg.packageName,
      client: pkg.client,
      platform: pkg.platform,
    },
    api_bases: cfg.api_bases,
    h5_bases: cfg.h5_bases,
    support: cfg.support,
    feature_flags: cfg.feature_flags,
    extras: cfg.extras,
  };
}

export async function getAppConfigByPackageName(
  packageName: string,
  opts?: {
    client?: ClientChannel | null;
    platform?: string | null;
  },
) {
  const pkg = await findPackageByName(packageName, opts);
  if (!pkg || !pkg.enabled) {
    throw Object.assign(new Error("package.unknown"), { statusCode: 404 });
  }
  return publicAppConfig(pkg);
}

export async function updatePackageClientConfig(
  packageId: string,
  raw: unknown,
) {
  const cfg = normalizeClientConfig(raw);
  return prisma.appPackage.update({
    where: { id: packageId },
    data: { clientConfig: clientConfigToPrismaJson(cfg) },
  });
}
