import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { prisma } from "../lib/prisma.js";

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

type ActorView =
  | { kind: "admin"; id: string; username: string }
  | { kind: "user"; id: string; uid: number; email: string | null }
  | null;

type TargetView =
  | { kind: "user"; id: string; uid: number; email: string | null }
  | { kind: "project"; id: string; code: string; name: string }
  | null;

function serializeAudit(
  row: {
    id: string;
    actorType: string;
    actorId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: Prisma.JsonValue | null;
    ip: string | null;
    createdAt: Date;
  },
  actors: Map<string, ActorView>,
  targets: Map<string, TargetView>,
) {
  const actorKey =
    row.actorId && (row.actorType === "admin" || row.actorType === "user")
      ? `${row.actorType}:${row.actorId}`
      : "";
  const targetKey =
    row.targetId && (row.targetType === "user" || row.targetType === "project")
      ? `${row.targetType}:${row.targetId}`
      : "";
  return {
    id: row.id,
    actor_type: row.actorType,
    actor_id: row.actorId,
    actor: actorKey ? (actors.get(actorKey) ?? null) : null,
    action: row.action,
    target_type: row.targetType,
    target_id: row.targetId,
    target: targetKey ? (targets.get(targetKey) ?? null) : null,
    meta: row.meta ?? null,
    ip: row.ip,
    created_at: row.createdAt.toISOString(),
  };
}

export const adminAuditRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${ADMIN_API_PREFIX}/audit-logs`, async (req, reply) => {
    try {
      const q = req.query as {
        limit?: string;
        offset?: string;
        action?: string;
        actor_type?: string;
        actor_id?: string;
        target_type?: string;
        target_id?: string;
        q?: string;
        from?: string;
        to?: string;
      };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const action = q.action?.trim() || "";
      const actorType = q.actor_type?.trim() || "";
      const actorId = q.actor_id?.trim() || "";
      const targetType = q.target_type?.trim() || "";
      const targetId = q.target_id?.trim() || "";
      const qTrim = q.q?.trim() || "";
      const from = q.from?.trim() ? new Date(q.from.trim()) : null;
      const to = q.to?.trim() ? new Date(q.to.trim()) : null;

      const where: Prisma.AuditLogWhereInput = {
        ...(action ? { action } : {}),
        ...(actorType ? { actorType } : {}),
        ...(actorId ? { actorId } : {}),
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
                ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
              },
            }
          : {}),
        ...(qTrim
          ? {
              OR: [
                { action: { contains: qTrim } },
                { actorId: { contains: qTrim } },
                { targetId: { contains: qTrim } },
                { ip: { contains: qTrim } },
              ],
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

      const adminIds = [
        ...new Set(
          items
            .filter((r) => r.actorType === "admin" && r.actorId)
            .map((r) => r.actorId as string),
        ),
      ];
      const userIds = [
        ...new Set(
          items.flatMap((r) => {
            const ids: string[] = [];
            if (r.actorType === "user" && r.actorId) ids.push(r.actorId);
            if (r.targetType === "user" && r.targetId) ids.push(r.targetId);
            return ids;
          }),
        ),
      ];
      const projectIds = [
        ...new Set(
          items
            .filter((r) => r.targetType === "project" && r.targetId)
            .map((r) => r.targetId as string),
        ),
      ];

      const [admins, users, projects] = await Promise.all([
        adminIds.length
          ? prisma.adminUser.findMany({
              where: { id: { in: adminIds } },
              select: { id: true, username: true },
            })
          : Promise.resolve([]),
        userIds.length
          ? prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, uid: true, email: true },
            })
          : Promise.resolve([]),
        projectIds.length
          ? prisma.project.findMany({
              where: { id: { in: projectIds } },
              select: { id: true, code: true, name: true },
            })
          : Promise.resolve([]),
      ]);

      const actors = new Map<string, ActorView>();
      for (const a of admins) {
        actors.set(`admin:${a.id}`, {
          kind: "admin",
          id: a.id,
          username: a.username,
        });
      }
      for (const u of users) {
        const view: ActorView = {
          kind: "user",
          id: u.id,
          uid: u.uid,
          email: u.email,
        };
        actors.set(`user:${u.id}`, view);
      }

      const targets = new Map<string, TargetView>();
      for (const u of users) {
        targets.set(`user:${u.id}`, {
          kind: "user",
          id: u.id,
          uid: u.uid,
          email: u.email,
        });
      }
      for (const p of projects) {
        targets.set(`project:${p.id}`, {
          kind: "project",
          id: p.id,
          code: p.code,
          name: p.name,
        });
      }

      return {
        total,
        items: items.map((row) => serializeAudit(row, actors, targets)),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
