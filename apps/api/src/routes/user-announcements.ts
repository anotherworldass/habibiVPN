import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { USER_API_PREFIX } from "@habibi/shared";
import { parseClientChannel } from "../services/catalog.js";
import { listActiveAnnouncements } from "../services/announcements.js";
import { findPackageByName } from "../services/app-update.js";
import { resolveSource, sourceHintsFromRequest } from "../services/project.js";

export const userAnnouncementRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Public list of active announcements for current App / H5 audience.
   * Scoped by project (from package/site/project header) + client/package/site filters.
   */
  app.get(`${USER_API_PREFIX}/announcements`, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    try {
      const hints = sourceHintsFromRequest(req);
      const source = await resolveSource(hints);
      const clientRaw =
        q.client ||
        source.sourceClient ||
        (req.headers["x-habibi-client"] as string | undefined) ||
        null;
      const client = clientRaw ? parseClientChannel(clientRaw) : null;

      let packageId =
        q.package_id?.trim() ||
        (req.headers["x-habibi-package-id"] as string | undefined)?.trim() ||
        source.sourcePackageId ||
        null;
      if (!packageId && hints.packageName) {
        const pkg = await findPackageByName(hints.packageName, {
          client,
          platform: hints.platform,
        });
        packageId = pkg?.id ?? null;
      }

      const siteId = source.sourceSiteId;

      const typeParsed = z
        .enum(["modal", "banner", "top_bar"])
        .optional()
        .safeParse(q.type || undefined);

      const locale =
        q.locale ||
        q.lang ||
        (Array.isArray(req.headers["accept-language"])
          ? req.headers["accept-language"][0]
          : req.headers["accept-language"]) ||
        null;

      const announcements = await listActiveAnnouncements({
        projectId: source.projectId,
        client,
        packageId,
        siteId,
        type: typeParsed.success ? typeParsed.data : null,
        locale,
      });

      return {
        project_id: source.projectId,
        project_code: source.projectCode,
        client,
        package_id: packageId,
        site_id: siteId,
        announcements,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      return reply.code(status).send({
        error: err instanceof Error ? err.message : "internal_error",
      });
    }
  });
};
