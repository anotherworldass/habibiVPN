import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ADMIN_API_PREFIX, APP_COPY_LOCALES } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { CLIENT_CHANNELS } from "../services/catalog.js";
import {
  generateAnnouncementCode,
  loadAnnouncement,
  parseAnnouncementCopy,
  replaceAnnouncementAudience,
  serializeAnnouncementAdmin,
} from "../services/announcements.js";

const clientEnum = z.enum([
  "ios_appstore",
  "ios_alt",
  "android_play",
  "android_direct",
  "h5",
  "windows",
  "macos",
]);

const bodySchema = z.object({
  code: z.string().min(1).max(64).nullable().optional(),
  type: z.enum(["modal", "banner", "top_bar"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  title_i18n: z.record(z.string().max(500)).optional(),
  body_i18n: z.record(z.string().max(8000)).optional(),
  actionUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  action_url: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  priority: z.number().int().optional(),
  startAt: z.string().min(1).nullable().optional(),
  endAt: z.string().min(1).nullable().optional(),
  start_at: z.string().min(1).nullable().optional(),
  end_at: z.string().min(1).nullable().optional(),
  dismissible: z.boolean().optional(),
  repeat: z.enum(["once", "every_launch"]).optional(),
  remark: z.string().max(2000).nullable().optional(),
  clients: z
    .array(z.object({ client: clientEnum, enabled: z.boolean().optional() }))
    .optional(),
  packageIds: z.array(z.string().min(1)).optional(),
  package_ids: z.array(z.string().min(1)).optional(),
  siteIds: z.array(z.string().min(1)).optional(),
  site_ids: z.array(z.string().min(1)).optional(),
});

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const adminAnnouncementRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/announcements`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${prefix}/meta`, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const [packages, sites] = await Promise.all([
      prisma.appPackage.findMany({
        where: { projectId },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          packageName: true,
          platform: true,
          client: true,
          enabled: true,
        },
      }),
      prisma.projectSite.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, host: true, enabled: true },
      }),
    ]);
    return {
      locales: APP_COPY_LOCALES,
      clients: CLIENT_CHANNELS,
      packages,
      sites,
      types: ["modal", "banner", "top_bar"],
      statuses: ["draft", "published", "archived"],
      repeats: ["once", "every_launch"],
    };
  });

  app.get(prefix, async (req) => {
    const projectId = await resolveAdminProjectId(req);
    const q = req.query as { status?: string; type?: string };
    const rows = await prisma.announcement.findMany({
      where: {
        projectId,
        ...(q.status
          ? { status: q.status as "draft" | "published" | "archived" }
          : {}),
        ...(q.type ? { type: q.type as "modal" | "banner" | "top_bar" } : {}),
      },
      include: {
        clients: { orderBy: { client: "asc" } },
        packages: true,
        sites: true,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });
    return { announcements: rows.map(serializeAnnouncementAdmin) };
  });

  app.get(`${prefix}/:id`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const row = await loadAnnouncement(id, projectId);
      if (!row) return reply.code(404).send({ error: "announcement.not_found" });
      return { announcement: serializeAnnouncementAdmin(row) };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post(prefix, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed", details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const copy = parseAnnouncementCopy(d);
      const actionUrl = d.actionUrl !== undefined ? d.actionUrl : d.action_url;
      const startAt = d.startAt !== undefined ? d.startAt : d.start_at;
      const endAt = d.endAt !== undefined ? d.endAt : d.end_at;
      const packageIds = d.packageIds ?? d.package_ids;
      const siteIds = d.siteIds ?? d.site_ids;

      const created = await prisma.announcement.create({
        data: {
          projectId,
          code: d.code?.trim() || generateAnnouncementCode(),
          type: d.type ?? "banner",
          status: d.status ?? "draft",
          titleI18n: copy.titleI18n,
          bodyI18n: copy.bodyI18n,
          actionUrl: actionUrl === "" || actionUrl == null ? null : actionUrl,
          priority: d.priority ?? 0,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          dismissible: d.dismissible ?? true,
          repeat: d.repeat ?? "once",
          remark: d.remark ?? null,
        },
      });

      await replaceAnnouncementAudience(created.id, {
        clients: d.clients,
        packageIds,
        siteIds,
      });

      const row = await loadAnnouncement(created.id, projectId);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "announcement.create",
        targetType: "announcement",
        targetId: created.id,
      });
      return reply.code(201).send({ announcement: serializeAnnouncementAdmin(row!) });
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "announcement.code_conflict" });
      }
      return mapErr(err, reply);
    }
  });

  app.patch(`${prefix}/:id`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const existing = await loadAnnouncement(id, projectId);
      if (!existing) return reply.code(404).send({ error: "announcement.not_found" });

      const parsed = bodySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation.failed" });
      }
      const d = parsed.data;
      const actionUrl = d.actionUrl !== undefined ? d.actionUrl : d.action_url;
      const startAt = d.startAt !== undefined ? d.startAt : d.start_at;
      const endAt = d.endAt !== undefined ? d.endAt : d.end_at;
      const packageIds = d.packageIds ?? d.package_ids;
      const siteIds = d.siteIds ?? d.site_ids;

      const touchTitle = d.title_i18n !== undefined;
      const touchBody = d.body_i18n !== undefined;
      const copy =
        touchTitle || touchBody
          ? parseAnnouncementCopy({
              title_i18n: touchTitle ? d.title_i18n : undefined,
              body_i18n: touchBody ? d.body_i18n : undefined,
            })
          : null;

      await prisma.announcement.update({
        where: { id },
        data: {
          // code is auto-generated on create; ignore client overrides on update
          ...(d.type != null ? { type: d.type } : {}),
          ...(d.status != null ? { status: d.status } : {}),
          ...(copy && touchTitle ? { titleI18n: copy.titleI18n } : {}),
          ...(copy && touchBody ? { bodyI18n: copy.bodyI18n } : {}),
          ...(actionUrl !== undefined
            ? { actionUrl: actionUrl === "" || actionUrl == null ? null : actionUrl }
            : {}),
          ...(d.priority != null ? { priority: d.priority } : {}),
          ...(startAt !== undefined
            ? { startAt: startAt ? new Date(startAt) : null }
            : {}),
          ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
          ...(d.dismissible != null ? { dismissible: d.dismissible } : {}),
          ...(d.repeat != null ? { repeat: d.repeat } : {}),
          ...(d.remark !== undefined ? { remark: d.remark } : {}),
        },
      });

      if (d.clients || packageIds || siteIds) {
        await replaceAnnouncementAudience(id, {
          clients: d.clients,
          packageIds,
          siteIds,
        });
      }

      const row = await loadAnnouncement(id, projectId);
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "announcement.update",
        targetType: "announcement",
        targetId: id,
      });
      return { announcement: serializeAnnouncementAdmin(row!) };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return reply.code(409).send({ error: "announcement.code_conflict" });
      }
      return mapErr(err, reply);
    }
  });

  app.delete(`${prefix}/:id`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const { id } = req.params as { id: string };
      const existing = await loadAnnouncement(id, projectId);
      if (!existing) return reply.code(404).send({ error: "announcement.not_found" });
      await prisma.announcement.delete({ where: { id } });
      await writeAudit({
        actorType: "admin",
        actorId: req.admin?.sub,
        action: "announcement.delete",
        targetType: "announcement",
        targetId: id,
      });
      return { ok: true };
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
