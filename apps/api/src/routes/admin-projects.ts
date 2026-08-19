import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import {
  createProject,
  listProjects,
  updateProject,
} from "../services/project.js";
import { APP_COPY_LOCALES } from "@habibi/shared";
import { parseReleaseCopyInput, publicAdminRelease } from "../services/app-update.js";
import {
  deleteManagedArtifactIfAny,
  deleteReleaseArtifact,
  upsertReleaseWithArtifact,
} from "../services/storage/release-artifact.js";
import {
  createReleaseUploadKey,
  listReleaseUploadKeys,
  revokeReleaseUploadKey,
  touchReleaseUploadKey,
} from "../services/release-upload-key.js";
import { writeAudit } from "../lib/audit.js";

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  const message =
    (typeof err === "object" &&
      err &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string" &&
      (err as { message: string }).message.trim()) ||
    (err instanceof Error ? err.message : "internal_error");
  return reply.code(status).send({
    error: message,
    message,
    code: err instanceof Error ? err.message : "internal_error",
  });
}

function fieldString(
  fields: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = fields[key];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) {
    const inner = (v as { value: unknown }).value;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}

export const adminProjectsRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/projects`;
  app.addHook("preHandler", async (req, reply) => {
    if (req.routeOptions.url?.endsWith("/releases/upload")) {
      return app.requireAdminOrReleaseUploadKey(req, reply);
    }
    return app.requireAdmin(req, reply);
  });

  app.get(prefix, async () => ({ projects: await listProjects() }));

  app.get(`${prefix}/:projectId/upload-keys`, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    return { upload_keys: await listReleaseUploadKeys(projectId) };
  });

  app.post(`${prefix}/:projectId/upload-keys`, async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const parsed = z
      .object({ name: z.string().trim().min(1).max(64) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    const created = await createReleaseUploadKey({
      projectId,
      name: parsed.data.name,
      createdById: req.admin?.sub,
    });
    await writeAudit({
      actorType: "admin",
      actorId: req.admin?.sub,
      action: "release_upload_key.create",
      targetType: "release_upload_key",
      targetId: created.key.id,
      meta: { projectId, name: parsed.data.name },
      ip: req.ip,
    });
    return reply.code(201).send({
      upload_key: created.key,
      plaintext: created.plaintext,
    });
  });

  app.delete(`${prefix}/:projectId/upload-keys/:keyId`, async (req, reply) => {
    const { projectId, keyId } = req.params as {
      projectId: string;
      keyId: string;
    };
    const key = await revokeReleaseUploadKey(projectId, keyId);
    if (!key) {
      return reply.code(404).send({ error: "release_upload_key.not_found" });
    }
    await writeAudit({
      actorType: "admin",
      actorId: req.admin?.sub,
      action: "release_upload_key.revoke",
      targetType: "release_upload_key",
      targetId: keyId,
      meta: { projectId },
      ip: req.ip,
    });
    return { ok: true, upload_key: key };
  });

  app.post(prefix, async (req, reply) => {
    const parsed = z
      .object({
        code: z.string().min(2).max(32),
        name: z.string().min(1).max(128),
        remark: z.string().max(2000).nullable().optional(),
        /** null = 不复制；缺省或字符串 = 从该项目复制套餐（默认 habibi） */
        copyPlansFromProjectId: z.string().min(1).nullable().optional(),
        copy_plans_from_project_id: z.string().min(1).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    try {
      const copyFrom =
        parsed.data.copyPlansFromProjectId !== undefined
          ? parsed.data.copyPlansFromProjectId
          : parsed.data.copy_plans_from_project_id !== undefined
            ? parsed.data.copy_plans_from_project_id
            : "habibi";
      const project = await createProject({
        code: parsed.data.code,
        name: parsed.data.name,
        remark: parsed.data.remark,
        copyPlansFromProjectId: copyFrom,
      });
      return reply.code(201).send({ project });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().min(1).max(128).optional(),
        enabled: z.boolean().optional(),
        remark: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    try {
      const project = await updateProject(id, parsed.data);
      return { project };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  // ---- sites ----
  app.get(`${prefix}/:id/sites`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    const sites = await prisma.projectSite.findMany({
      where: { projectId: id },
      orderBy: { host: "asc" },
    });
    return { sites };
  });

  app.post(`${prefix}/:id/sites`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().min(1).max(128),
        host: z.string().min(1).max(191),
        enabled: z.boolean().optional(),
        remark: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    const host = parsed.data.host.trim().toLowerCase().replace(/^https?:\/\//, "").split(":")[0]!;
    try {
      const site = await prisma.projectSite.create({
        data: {
          projectId: id,
          name: parsed.data.name.trim(),
          host,
          enabled: parsed.data.enabled ?? true,
          remark: parsed.data.remark ?? null,
        },
      });
      return reply.code(201).send({ site });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "site.host_conflict" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:projectId/sites/:siteId`, async (req, reply) => {
    const { projectId, siteId } = req.params as { projectId: string; siteId: string };
    const parsed = z
      .object({
        name: z.string().min(1).max(128).optional(),
        host: z.string().min(1).max(191).optional(),
        enabled: z.boolean().optional(),
        remark: z.string().max(2000).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    const existing = await prisma.projectSite.findFirst({
      where: { id: siteId, projectId },
    });
    if (!existing) return reply.code(404).send({ error: "site.not_found" });
    try {
      const site = await prisma.projectSite.update({
        where: { id: siteId },
        data: {
          ...(parsed.data.name != null ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.host != null
            ? {
                host: parsed.data.host
                  .trim()
                  .toLowerCase()
                  .replace(/^https?:\/\//, "")
                  .split(":")[0]!,
              }
            : {}),
          ...(parsed.data.enabled != null ? { enabled: parsed.data.enabled } : {}),
          ...(parsed.data.remark !== undefined ? { remark: parsed.data.remark } : {}),
        },
      });
      return { site };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "site.host_conflict" });
      }
      throw err;
    }
  });

  app.delete(`${prefix}/:projectId/sites/:siteId`, async (req, reply) => {
    const { projectId, siteId } = req.params as { projectId: string; siteId: string };
    const existing = await prisma.projectSite.findFirst({
      where: { id: siteId, projectId },
    });
    if (!existing) return reply.code(404).send({ error: "site.not_found" });
    await prisma.projectSite.delete({ where: { id: siteId } });
    return { ok: true };
  });

  // ---- packages ----
  app.get(`${prefix}/:id/packages`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    const packages = await prisma.appPackage.findMany({
      where: { projectId: id },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return { packages, clients: CLIENT_CHANNELS };
  });

  app.post(`${prefix}/:id/packages`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().min(1).max(128),
        packageName: z.string().min(1).max(191),
        platform: z.enum(["ios", "android", "windows", "macos"]),
        client: z.enum([
          "ios_appstore",
          "ios_alt",
          "android_play",
          "android_direct",
          "h5",
          "windows",
          "macos",
        ]),
        isPrimary: z.boolean().optional(),
        enabled: z.boolean().optional(),
        listedOnWeb: z.boolean().optional(),
        minSupportVersionCode: z.number().int().nonnegative().nullable().optional(),
        storeUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
        remark: z.string().max(2000).nullable().optional(),
        clientConfig: z.unknown().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return reply.code(404).send({ error: "project.not_found" });
    try {
      const { normalizeClientConfig, clientConfigToPrismaJson } = await import(
        "../services/app-config.js"
      );
      const storeUrl =
        parsed.data.storeUrl === "" || parsed.data.storeUrl == null
          ? null
          : parsed.data.storeUrl;
      const clientConfig =
        parsed.data.clientConfig !== undefined
          ? clientConfigToPrismaJson(normalizeClientConfig(parsed.data.clientConfig))
          : undefined;
      const pkg = await prisma.$transaction(async (tx) => {
        if (parsed.data.listedOnWeb) {
          await tx.appPackage.updateMany({
            where: { projectId: id, platform: parsed.data.platform, listedOnWeb: true },
            data: { listedOnWeb: false },
          });
        }
        return tx.appPackage.create({
          data: {
            projectId: id,
            name: parsed.data.name.trim(),
            packageName: parsed.data.packageName.trim(),
            platform: parsed.data.platform,
            client: parsed.data.client,
            isPrimary: parsed.data.isPrimary ?? false,
            enabled: parsed.data.enabled ?? true,
            listedOnWeb: parsed.data.listedOnWeb ?? false,
            minSupportVersionCode: parsed.data.minSupportVersionCode ?? null,
            storeUrl,
            remark: parsed.data.remark ?? null,
            ...(clientConfig !== undefined ? { clientConfig } : {}),
          },
        });
      });
      return reply.code(201).send({ package: pkg });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "package.name_conflict" });
      }
      throw err;
    }
  });

  app.patch(`${prefix}/:projectId/packages/:packageId`, async (req, reply) => {
    const { projectId, packageId } = req.params as {
      projectId: string;
      packageId: string;
    };
    const parsed = z
      .object({
        name: z.string().min(1).max(128).optional(),
        packageName: z.string().min(1).max(191).optional(),
        platform: z.enum(["ios", "android", "windows", "macos"]).optional(),
        client: z
          .enum([
            "ios_appstore",
            "ios_alt",
            "android_play",
            "android_direct",
            "h5",
            "windows",
            "macos",
          ])
          .optional(),
        isPrimary: z.boolean().optional(),
        enabled: z.boolean().optional(),
        listedOnWeb: z.boolean().optional(),
        minSupportVersionCode: z.number().int().nonnegative().nullable().optional(),
        storeUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
        remark: z.string().max(2000).nullable().optional(),
        clientConfig: z.unknown().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation.failed" });
    }
    const existing = await prisma.appPackage.findFirst({
      where: { id: packageId, projectId },
    });
    if (!existing) return reply.code(404).send({ error: "package.not_found" });
    try {
      const { normalizeClientConfig, clientConfigToPrismaJson } = await import(
        "../services/app-config.js"
      );
      const storeUrl =
        parsed.data.storeUrl === undefined
          ? undefined
          : parsed.data.storeUrl === "" || parsed.data.storeUrl == null
            ? null
            : parsed.data.storeUrl;
      const clientConfig =
        parsed.data.clientConfig !== undefined
          ? clientConfigToPrismaJson(normalizeClientConfig(parsed.data.clientConfig))
          : undefined;
      const nextPlatform = parsed.data.platform ?? existing.platform;
      const nextListedOnWeb = parsed.data.listedOnWeb ?? existing.listedOnWeb;
      const pkg = await prisma.$transaction(async (tx) => {
        if (nextListedOnWeb) {
          await tx.appPackage.updateMany({
            where: {
              projectId,
              platform: nextPlatform,
              listedOnWeb: true,
              id: { not: packageId },
            },
            data: { listedOnWeb: false },
          });
        }
        return tx.appPackage.update({
          where: { id: packageId },
          data: {
            ...(parsed.data.name != null ? { name: parsed.data.name.trim() } : {}),
            ...(parsed.data.packageName != null
              ? { packageName: parsed.data.packageName.trim() }
              : {}),
            ...(parsed.data.platform != null ? { platform: parsed.data.platform } : {}),
            ...(parsed.data.client != null ? { client: parsed.data.client } : {}),
            ...(parsed.data.isPrimary != null ? { isPrimary: parsed.data.isPrimary } : {}),
            ...(parsed.data.enabled != null ? { enabled: parsed.data.enabled } : {}),
            ...(parsed.data.listedOnWeb != null
              ? { listedOnWeb: parsed.data.listedOnWeb }
              : {}),
            ...(parsed.data.minSupportVersionCode !== undefined
              ? { minSupportVersionCode: parsed.data.minSupportVersionCode }
              : {}),
            ...(storeUrl !== undefined ? { storeUrl } : {}),
            ...(parsed.data.remark !== undefined ? { remark: parsed.data.remark } : {}),
            ...(clientConfig !== undefined ? { clientConfig } : {}),
          },
        });
      });
      return { package: pkg };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "package.name_conflict" });
      }
      throw err;
    }
  });

  app.delete(`${prefix}/:projectId/packages/:packageId`, async (req, reply) => {
    const { projectId, packageId } = req.params as {
      projectId: string;
      packageId: string;
    };
    const existing = await prisma.appPackage.findFirst({
      where: { id: packageId, projectId },
    });
    if (!existing) return reply.code(404).send({ error: "package.not_found" });
    await prisma.appPackage.delete({ where: { id: packageId } });
    return { ok: true };
  });

  const optionalUrl = z.union([z.string().url().max(2000), z.literal(""), z.null()]);
  const i18nMap = z.record(z.string().max(8000)).optional();
  const releaseBody = z.object({
    versionName: z.string().min(1).max(64),
    versionCode: z.number().int().positive(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    forceUpdate: z.boolean().optional(),
    title_i18n: i18nMap,
    changelog_i18n: i18nMap,
    /** @deprecated use title_i18n */
    title: z.string().max(500).nullable().optional(),
    /** @deprecated use changelog_i18n */
    changelog: z.string().max(8000).nullable().optional(),
    downloadUrl: optionalUrl.optional(),
    storeUrl: optionalUrl.optional(),
    fileSize: z.number().int().nonnegative().nullable().optional(),
    checksum: z.string().max(128).nullable().optional(),
    remark: z.string().max(2000).nullable().optional(),
  });

  function normalizeUrl(v: string | null | undefined) {
    if (v === undefined) return undefined;
    if (v === "" || v == null) return null;
    return v;
  }

  app.get(
    `${prefix}/:projectId/packages/:packageId/releases`,
    async (req, reply) => {
      const { projectId, packageId } = req.params as {
        projectId: string;
        packageId: string;
      };
      const pkg = await prisma.appPackage.findFirst({
        where: { id: packageId, projectId },
      });
      if (!pkg) return reply.code(404).send({ error: "package.not_found" });
      const releases = await prisma.appPackageRelease.findMany({
        where: { packageId },
        orderBy: { versionCode: "desc" },
      });
      const latest = releases.find((r) => r.status === "published") || null;
      return {
        package: {
          id: pkg.id,
          name: pkg.name,
          packageName: pkg.packageName,
          client: pkg.client,
          minSupportVersionCode: pkg.minSupportVersionCode,
          storeUrl: pkg.storeUrl,
        },
        latest_version_code: latest?.versionCode ?? null,
        locales: APP_COPY_LOCALES,
        releases: releases.map(publicAdminRelease),
      };
    },
  );

  app.post(
    `${prefix}/:projectId/packages/:packageId/releases`,
    async (req, reply) => {
      const { projectId, packageId } = req.params as {
        projectId: string;
        packageId: string;
      };
      const parsed = releaseBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      const pkg = await prisma.appPackage.findFirst({
        where: { id: packageId, projectId },
      });
      if (!pkg) return reply.code(404).send({ error: "package.not_found" });
      const status = parsed.data.status ?? "draft";
      const copy = parseReleaseCopyInput(parsed.data);
      try {
        const release = await prisma.appPackageRelease.create({
          data: {
            packageId,
            versionName: parsed.data.versionName.trim(),
            versionCode: parsed.data.versionCode,
            status,
            forceUpdate: parsed.data.forceUpdate ?? false,
            titleI18n: copy.titleI18n,
            changelogI18n: copy.changelogI18n,
            downloadUrl: normalizeUrl(parsed.data.downloadUrl) ?? null,
            storeUrl: normalizeUrl(parsed.data.storeUrl) ?? null,
            fileSize:
              parsed.data.fileSize != null ? BigInt(parsed.data.fileSize) : null,
            checksum: parsed.data.checksum ?? null,
            remark: parsed.data.remark ?? null,
            publishedAt: status === "published" ? new Date() : null,
          },
        });
        return reply.code(201).send({ release: publicAdminRelease(release) });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return reply.code(409).send({ error: "release.version_conflict" });
        }
        throw err;
      }
    },
  );

  app.patch(
    `${prefix}/:projectId/packages/:packageId/releases/:releaseId`,
    async (req, reply) => {
      const { projectId, packageId, releaseId } = req.params as {
        projectId: string;
        packageId: string;
        releaseId: string;
      };
      const parsed = releaseBody.partial().safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      const pkg = await prisma.appPackage.findFirst({
        where: { id: packageId, projectId },
      });
      if (!pkg) return reply.code(404).send({ error: "package.not_found" });
      const existing = await prisma.appPackageRelease.findFirst({
        where: { id: releaseId, packageId },
      });
      if (!existing) return reply.code(404).send({ error: "release.not_found" });

      const nextStatus = parsed.data.status ?? existing.status;
      const becomingPublished =
        nextStatus === "published" && existing.status !== "published";

      const touchTitle =
        parsed.data.title_i18n !== undefined || parsed.data.title !== undefined;
      const touchChangelog =
        parsed.data.changelog_i18n !== undefined ||
        parsed.data.changelog !== undefined;
      const copy =
        touchTitle || touchChangelog
          ? parseReleaseCopyInput({
              title_i18n: touchTitle ? parsed.data.title_i18n : undefined,
              changelog_i18n: touchChangelog
                ? parsed.data.changelog_i18n
                : undefined,
              title: touchTitle ? parsed.data.title : undefined,
              changelog: touchChangelog ? parsed.data.changelog : undefined,
            })
          : null;

      try {
        const release = await prisma.appPackageRelease.update({
          where: { id: releaseId },
          data: {
            ...(parsed.data.versionName != null
              ? { versionName: parsed.data.versionName.trim() }
              : {}),
            ...(parsed.data.versionCode != null
              ? { versionCode: parsed.data.versionCode }
              : {}),
            ...(parsed.data.status != null ? { status: parsed.data.status } : {}),
            ...(parsed.data.forceUpdate != null
              ? { forceUpdate: parsed.data.forceUpdate }
              : {}),
            ...(copy && touchTitle ? { titleI18n: copy.titleI18n } : {}),
            ...(copy && touchChangelog
              ? { changelogI18n: copy.changelogI18n }
              : {}),
            ...(parsed.data.downloadUrl !== undefined
              ? { downloadUrl: normalizeUrl(parsed.data.downloadUrl) ?? null }
              : {}),
            ...(parsed.data.storeUrl !== undefined
              ? { storeUrl: normalizeUrl(parsed.data.storeUrl) ?? null }
              : {}),
            ...(parsed.data.fileSize !== undefined
              ? {
                  fileSize:
                    parsed.data.fileSize != null
                      ? BigInt(parsed.data.fileSize)
                      : null,
                }
              : {}),
            ...(parsed.data.checksum !== undefined
              ? { checksum: parsed.data.checksum }
              : {}),
            ...(parsed.data.remark !== undefined ? { remark: parsed.data.remark } : {}),
            ...(becomingPublished
              ? { publishedAt: existing.publishedAt ?? new Date() }
              : {}),
          },
        });
        return { release: publicAdminRelease(release) };
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return reply.code(409).send({ error: "release.version_conflict" });
        }
        throw err;
      }
    },
  );

  app.delete(
    `${prefix}/:projectId/packages/:packageId/releases/:releaseId`,
    async (req, reply) => {
      const { projectId, packageId, releaseId } = req.params as {
        projectId: string;
        packageId: string;
        releaseId: string;
      };
      const pkg = await prisma.appPackage.findFirst({
        where: { id: packageId, projectId },
      });
      if (!pkg) return reply.code(404).send({ error: "package.not_found" });
      const existing = await prisma.appPackageRelease.findFirst({
        where: { id: releaseId, packageId },
      });
      if (!existing) return reply.code(404).send({ error: "release.not_found" });
      await deleteManagedArtifactIfAny(projectId, existing);
      await prisma.appPackageRelease.delete({ where: { id: releaseId } });
      return { ok: true };
    },
  );

  /**
   * Create/update a release by versionCode and upload install package to app_dist buckets.
   * multipart fields: file + versionName + versionCode + optional meta.
   */
  app.post(
    `${prefix}/:projectId/packages/:packageId/releases/upload`,
    async (req, reply) => {
      const { projectId, packageId } = req.params as {
        projectId: string;
        packageId: string;
      };
      try {
        if (!req.isMultipart()) {
          return reply.code(400).send({
            error: "expected multipart/form-data",
            message: "请使用 multipart 上传安装包",
          });
        }

        let fileBuffer: Buffer | null = null;
        let filename = "artifact.bin";
        const fields: Record<string, unknown> = {};

        for await (const part of req.parts()) {
          if (part.type === "file") {
            if (part.fieldname !== "file" && fileBuffer) continue;
            filename = part.filename || filename;
            fileBuffer = await part.toBuffer();
          } else {
            fields[part.fieldname] = part.value;
          }
        }

        if (!fileBuffer) {
          return reply.code(400).send({
            error: "release.artifact_required",
            message: "缺少 file 字段",
          });
        }

        const versionName = fieldString(fields, "versionName")?.trim();
        const versionCodeRaw = fieldString(fields, "versionCode");
        const versionCode = versionCodeRaw ? Number(versionCodeRaw) : NaN;
        if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
          return reply.code(400).send({
            error: "validation.failed",
            message: "versionName / versionCode 必填",
          });
        }

        const replaceRaw = fieldString(fields, "replace");
        const forceRaw = fieldString(fields, "forceUpdate");
        const statusRaw = fieldString(fields, "status");
        const status =
          req.releaseUploadKey
            ? "draft"
            : statusRaw === "draft" ||
                statusRaw === "published" ||
                statusRaw === "archived"
            ? statusRaw
            : undefined;

        let titleI18n: unknown;
        let changelogI18n: unknown;
        const titleI18nRaw = fieldString(fields, "title_i18n");
        const changelogI18nRaw = fieldString(fields, "changelog_i18n");
        if (titleI18nRaw) {
          try {
            titleI18n = JSON.parse(titleI18nRaw);
          } catch {
            /* ignore */
          }
        }
        if (changelogI18nRaw) {
          try {
            changelogI18n = JSON.parse(changelogI18nRaw);
          } catch {
            /* ignore */
          }
        }

        const storeUrl = fieldString(fields, "storeUrl");
        const remark = fieldString(fields, "remark");

        const result = await upsertReleaseWithArtifact({
          projectId,
          packageId,
          buffer: fileBuffer,
          filename,
          versionName,
          versionCode,
          replace:
            !req.releaseUploadKey &&
            (replaceRaw === "1" ||
              replaceRaw === "true" ||
              replaceRaw === "yes"),
          forceUpdate:
            req.releaseUploadKey
              ? false
              : forceRaw === undefined
              ? undefined
              : forceRaw === "1" || forceRaw === "true",
          status,
          storeUrl:
            storeUrl === undefined
              ? undefined
              : storeUrl.trim()
                ? storeUrl.trim()
                : null,
          remark:
            remark === undefined
              ? undefined
              : remark.trim()
                ? remark.trim()
                : null,
          title_i18n: titleI18n,
          changelog_i18n: changelogI18n,
          title: fieldString(fields, "title"),
          changelog: fieldString(fields, "changelog"),
        });

        if (req.releaseUploadKey) {
          await touchReleaseUploadKey(req.releaseUploadKey.id);
        }
        return result;
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );

  app.delete(
    `${prefix}/:projectId/packages/:packageId/releases/:releaseId/artifact`,
    async (req, reply) => {
      const { projectId, packageId, releaseId } = req.params as {
        projectId: string;
        packageId: string;
        releaseId: string;
      };
      try {
        return await deleteReleaseArtifact({
          projectId,
          packageId,
          releaseId,
        });
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );
};
