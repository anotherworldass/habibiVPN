import type { FastifyPluginAsync } from "fastify";
import type { ClientChannel } from "@prisma/client";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import { getAppConfigByPackageName } from "../services/app-config.js";
import { checkAppUpdate } from "../services/app-update.js";
import {
  listPublicDownloads,
  recordDownloadAndResolve,
} from "../services/app-downloads.js";
import { listPublicThirdPartyClients } from "../services/third-party-clients.js";
import { sourceHintsFromRequest } from "../services/project.js";

function softParseClient(raw: string | null | undefined): ClientChannel | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((CLIENT_CHANNELS as string[]).includes(v)) return v as ClientChannel;
  return null;
}

export const userAppRoutes: FastifyPluginAsync = async (app) => {
  /** Website download catalog. Host selects the project; package enables a private 马甲 landing. */
  app.get(`${USER_API_PREFIX}/app/downloads`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const hints = sourceHintsFromRequest(req);
    try {
      return await listPublicDownloads({
        projectCode: q.project || q.project_code || hints.projectCode,
        siteHost: hints.siteHost,
        packageName: q.package || q.package_name || null,
        platform: q.platform || null,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  app.get(`${USER_API_PREFIX}/app/third-party-clients`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const hints = sourceHintsFromRequest(req);
    const locale =
      q.locale ||
      q.lang ||
      (typeof req.headers["x-habibi-locale"] === "string"
        ? req.headers["x-habibi-locale"]
        : Array.isArray(req.headers["accept-language"])
          ? req.headers["accept-language"][0]
          : req.headers["accept-language"]) ||
      null;
    try {
      return await listPublicThirdPartyClients({
        projectCode: q.project || q.project_code || hints.projectCode,
        siteHost: hints.siteHost,
        locale,
        platform: q.platform || null,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /** Count one download click and redirect to the package's current store/artifact URL. */
  app.get(`${USER_API_PREFIX}/app/dl`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const parsed = z
      .object({
        package: z.string().trim().min(1).max(191),
        platform: z.enum(["ios", "android", "windows", "macos"]),
      })
      .safeParse({
        package: q.package || q.package_name,
        platform: q.platform?.trim().toLowerCase(),
      });
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const url = await recordDownloadAndResolve({
        packageName: parsed.data.package,
        platform: parsed.data.platform,
      });
      return reply.code(302).header("Cache-Control", "no-store").redirect(url);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /**
   * Per-package remote client config (api bases, flags, extras). No auth.
   * Requires package name (query/header). Same name on iOS/Android needs client/platform.
   */
  app.get(`${USER_API_PREFIX}/app/config`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const hints = sourceHintsFromRequest(req);
    const packageName =
      q.package?.trim() ||
      q.package_name?.trim() ||
      hints.packageName?.trim() ||
      null;
    if (!packageName) {
      return reply.code(404).send({ error: "package.unknown" });
    }
    try {
      const client = softParseClient(q.client || hints.client);
      return await getAppConfigByPackageName(packageName, {
        client,
        platform: q.platform || hints.platform,
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });

  /**
   * App version check. No auth required.
   * Requires package name (query/header) — no silent default project package.
   */
  app.get(`${USER_API_PREFIX}/app/update-check`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const hints = sourceHintsFromRequest(req);
    const packageName =
      q.package?.trim() ||
      q.package_name?.trim() ||
      hints.packageName?.trim() ||
      null;
    const versionCodeRaw = q.version_code ?? q.versionCode;
    const parsed = z
      .object({
        version_code: z.coerce.number().int().nonnegative(),
      })
      .safeParse({ version_code: versionCodeRaw });

    if (!packageName) {
      return reply.code(404).send({ error: "package.unknown" });
    }
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }

    try {
      const client = softParseClient(q.client || hints.client);
      const locale =
        q.locale ||
        q.lang ||
        (Array.isArray(req.headers["accept-language"])
          ? req.headers["accept-language"][0]
          : req.headers["accept-language"]) ||
        null;
      const result = await checkAppUpdate({
        packageName,
        versionCode: parsed.data.version_code,
        client,
        platform: q.platform || hints.platform,
        locale,
      });
      return result;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
