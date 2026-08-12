import type {
  Announcement,
  AnnouncementClient,
  AnnouncementPackage,
  AnnouncementSite,
  ClientChannel,
  Prisma,
} from "@prisma/client";
import {
  normalizeAppCopyI18n,
  pickAppCopy,
  resolveAppCopyLocale,
  type AppCopyI18n,
} from "@habibi/shared";
import { prisma } from "../lib/prisma.js";

export type AnnouncementFull = Announcement & {
  clients: AnnouncementClient[];
  packages: AnnouncementPackage[];
  sites: AnnouncementSite[];
};

/** e.g. ann_20260727_233045_a1b2 */
export function generateAnnouncementCode(at = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `_${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `ann_${stamp}_${suffix}`;
}

function asCopyMap(raw: unknown): AppCopyI18n {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as AppCopyI18n;
}

export function serializeAnnouncementAdmin(a: AnnouncementFull) {
  return {
    id: a.id,
    project_id: a.projectId,
    code: a.code,
    type: a.type,
    status: a.status,
    title_i18n: asCopyMap(a.titleI18n),
    body_i18n: asCopyMap(a.bodyI18n),
    action_url: a.actionUrl,
    priority: a.priority,
    start_at: a.startAt,
    end_at: a.endAt,
    dismissible: a.dismissible,
    repeat: a.repeat,
    remark: a.remark,
    clients: a.clients.map((c) => ({ client: c.client, enabled: c.enabled })),
    package_ids: a.packages.map((p) => p.packageId),
    site_ids: a.sites.map((s) => s.siteId),
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export function serializeAnnouncementPublic(
  a: AnnouncementFull,
  locale: string | null | undefined,
) {
  const titleI18n = asCopyMap(a.titleI18n);
  const bodyI18n = asCopyMap(a.bodyI18n);
  const title = pickAppCopy(titleI18n, locale);
  const body = pickAppCopy(bodyI18n, locale);
  return {
    id: a.id,
    code: a.code,
    type: a.type,
    locale: resolveAppCopyLocale(locale),
    title: title.text,
    body: body.text,
    title_i18n: titleI18n,
    body_i18n: bodyI18n,
    action_url: a.actionUrl,
    priority: a.priority,
    dismissible: a.dismissible,
    repeat: a.repeat,
    start_at: a.startAt,
    end_at: a.endAt,
  };
}

export function parseAnnouncementCopy(input: {
  title_i18n?: unknown;
  body_i18n?: unknown;
}): {
  titleI18n: Prisma.InputJsonValue;
  bodyI18n: Prisma.InputJsonValue;
} {
  return {
    titleI18n: normalizeAppCopyI18n(input.title_i18n, 500) as Prisma.InputJsonValue,
    bodyI18n: normalizeAppCopyI18n(input.body_i18n, 8000) as Prisma.InputJsonValue,
  };
}

export async function loadAnnouncement(id: string, projectId?: string) {
  return prisma.announcement.findFirst({
    where: { id, ...(projectId ? { projectId } : {}) },
    include: {
      clients: { orderBy: { client: "asc" } },
      packages: true,
      sites: true,
    },
  });
}

export async function replaceAnnouncementAudience(
  announcementId: string,
  input: {
    clients?: Array<{ client: ClientChannel; enabled?: boolean }>;
    packageIds?: string[];
    siteIds?: string[];
  },
) {
  await prisma.$transaction(async (tx) => {
    if (input.clients) {
      await tx.announcementClient.deleteMany({ where: { announcementId } });
      if (input.clients.length) {
        await tx.announcementClient.createMany({
          data: input.clients.map((c) => ({
            announcementId,
            client: c.client,
            enabled: c.enabled ?? true,
          })),
        });
      }
    }
    if (input.packageIds) {
      await tx.announcementPackage.deleteMany({ where: { announcementId } });
      if (input.packageIds.length) {
        await tx.announcementPackage.createMany({
          data: input.packageIds.map((packageId) => ({
            announcementId,
            packageId,
          })),
        });
      }
    }
    if (input.siteIds) {
      await tx.announcementSite.deleteMany({ where: { announcementId } });
      if (input.siteIds.length) {
        await tx.announcementSite.createMany({
          data: input.siteIds.map((siteId) => ({
            announcementId,
            siteId,
          })),
        });
      }
    }
  });
}

function matchesAudience(
  a: AnnouncementFull,
  input: {
    client: ClientChannel | null;
    packageId: string | null;
    siteId: string | null;
  },
): boolean {
  const enabledClients = a.clients.filter((c) => c.enabled);
  if (enabledClients.length > 0) {
    if (!input.client) return false;
    if (!enabledClients.some((c) => c.client === input.client)) return false;
  }

  if (a.packages.length > 0) {
    // Package-scoped: require matching package when list is non-empty
    if (!input.packageId) return false;
    if (!a.packages.some((p) => p.packageId === input.packageId)) return false;
  }

  if (a.sites.length > 0) {
    if (!input.siteId) return false;
    if (!a.sites.some((s) => s.siteId === input.siteId)) return false;
  }

  return true;
}

/**
 * Active published announcements for a resolved audience.
 * Empty clients/packages/sites on a row means "no restriction" for that dimension.
 */
export async function listActiveAnnouncements(input: {
  projectId: string;
  client?: ClientChannel | null;
  packageId?: string | null;
  siteId?: string | null;
  type?: Announcement["type"] | null;
  locale?: string | null;
}) {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      projectId: input.projectId,
      status: "published",
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ...(input.type ? [{ type: input.type }] : []),
      ],
    },
    include: {
      clients: true,
      packages: true,
      sites: true,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const filtered = rows.filter((a) =>
    matchesAudience(a, {
      client: input.client ?? null,
      packageId: input.packageId ?? null,
      siteId: input.siteId ?? null,
    }),
  );

  return filtered.map((a) => serializeAnnouncementPublic(a, input.locale));
}
