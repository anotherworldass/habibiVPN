import type { FastifyPluginAsync } from "fastify";
import type { EntitlementReason, Prisma } from "@prisma/client";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";
import { toAdminEntitlementLedgerView } from "../services/entitlement-ledger.js";

const REASONS = new Set<EntitlementReason>([
  "order_paid",
  "iap",
  "redeem",
  "campaign",
  "free_claim",
  "admin_provision",
  "refund_clawback",
  "signup_trial",
]);

function mapErr(
  err: unknown,
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

async function loadPlanMap(planIds: string[]) {
  const ids = [...new Set(planIds.filter(Boolean))];
  if (!ids.length) return new Map<string, { id: string; code: string; name: string }>();
  const plans = await prisma.plan.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true },
  });
  return new Map(plans.map((p) => [p.id, p]));
}

export const adminEntitlementLedgerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", app.requireAdmin);

  app.get(`${ADMIN_API_PREFIX}/entitlement-ledgers`, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as {
        limit?: string;
        offset?: string;
        user_id?: string;
        uid?: string;
        slot_id?: string;
        reason?: string;
        ref_type?: string;
        ref_id?: string;
        q?: string;
        from?: string;
        to?: string;
      };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const userId = q.user_id?.trim() || "";
      const slotId = q.slot_id?.trim() || "";
      const reasonRaw = q.reason?.trim() || "";
      const reason =
        reasonRaw && REASONS.has(reasonRaw as EntitlementReason)
          ? (reasonRaw as EntitlementReason)
          : undefined;
      const refType = q.ref_type?.trim() || "";
      const refId = q.ref_id?.trim() || "";
      const qTrim = q.q?.trim() || "";
      const qAsUid =
        (q.uid?.trim() && /^\d+$/.test(q.uid.trim())
          ? Number(q.uid.trim())
          : null) ??
        (qTrim && /^\d+$/.test(qTrim) ? Number(qTrim) : null);
      const from = q.from?.trim() ? new Date(q.from.trim()) : null;
      const to = q.to?.trim() ? new Date(q.to.trim()) : null;

      const where: Prisma.EntitlementLedgerWhereInput = {
        projectId,
        ...(userId ? { userId } : {}),
        ...(slotId ? { slotId } : {}),
        ...(reason ? { reason } : {}),
        ...(refType ? { refType } : {}),
        ...(refId ? { refId } : {}),
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
                { slotId: { contains: qTrim } },
                { refId: { contains: qTrim } },
                { user: { email: { contains: qTrim } } },
                { user: { id: { contains: qTrim } } },
                ...(qAsUid != null && Number.isSafeInteger(qAsUid)
                  ? [{ user: { uid: qAsUid } }]
                  : []),
              ],
            }
          : qAsUid != null && Number.isSafeInteger(qAsUid)
            ? { user: { uid: qAsUid } }
            : {}),
      };

      const [total, items] = await Promise.all([
        prisma.entitlementLedger.count({ where }),
        prisma.entitlementLedger.findMany({
          where,
          include: {
            user: { select: { id: true, uid: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

      const planIds = items.flatMap((r) =>
        [r.planIdBefore, r.planIdAfter].filter((x): x is string => Boolean(x)),
      );
      const plans = await loadPlanMap(planIds);

      return {
        total,
        project_id: projectId,
        items: items.map((row) => toAdminEntitlementLedgerView(row, plans)),
      };
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get(
    `${ADMIN_API_PREFIX}/users/:id/entitlement-ledgers`,
    async (req, reply) => {
      try {
        const projectId = await resolveAdminProjectId(req);
        const { id } = req.params as { id: string };
        const q = req.query as { limit?: string; offset?: string };
        const limit = Math.min(Number(q.limit) || 50, 100);
        const offset = Number(q.offset) || 0;

        const user = await prisma.user.findFirst({
          where: { id, projectId },
          select: { id: true },
        });
        if (!user) {
          return reply.code(404).send({ error: "user.not_found" });
        }

        const where: Prisma.EntitlementLedgerWhereInput = {
          projectId,
          userId: user.id,
        };
        const [total, items] = await Promise.all([
          prisma.entitlementLedger.count({ where }),
          prisma.entitlementLedger.findMany({
            where,
            include: {
              user: { select: { id: true, uid: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
          }),
        ]);

        const planIds = items.flatMap((r) =>
          [r.planIdBefore, r.planIdAfter].filter((x): x is string => Boolean(x)),
        );
        const plans = await loadPlanMap(planIds);

        return {
          total,
          items: items.map((row) => toAdminEntitlementLedgerView(row, plans)),
        };
      } catch (err) {
        return mapErr(err, reply);
      }
    },
  );
};
