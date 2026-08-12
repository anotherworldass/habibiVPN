import type { FastifyPluginAsync } from "fastify";
import type { OrderStatus, Prisma } from "@prisma/client";
import { ADMIN_API_PREFIX } from "@habibi/shared";
import { resolveAdminProjectId } from "../lib/admin-project.js";
import { prisma } from "../lib/prisma.js";

const ORDER_STATUSES = new Set<OrderStatus>([
  "pending",
  "paid",
  "provisioning",
  "provisioned",
  "failed",
  "refunded",
  "cancelled",
]);

function mapErr(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const status = (err as { statusCode?: number }).statusCode || 500;
  return reply.code(status).send({
    error: err instanceof Error ? err.message : "internal_error",
  });
}

export const adminOrderRoutes: FastifyPluginAsync = async (app) => {
  const prefix = `${ADMIN_API_PREFIX}/orders`;
  app.addHook("preHandler", app.requireAdmin);

  app.get(prefix, async (req, reply) => {
    try {
      const projectId = await resolveAdminProjectId(req);
      const q = req.query as {
        limit?: string;
        offset?: string;
        status?: string;
        q?: string;
        provider?: string;
        user_id?: string;
        paid_only?: string;
      };
      const limit = Math.min(Number(q.limit) || 20, 100);
      const offset = Number(q.offset) || 0;
      const statusRaw = q.status?.trim() || "";
      const status =
        statusRaw && ORDER_STATUSES.has(statusRaw as OrderStatus)
          ? (statusRaw as OrderStatus)
          : undefined;
      const qTrim = q.q?.trim() || "";
      const qAsUid = qTrim && /^\d+$/.test(qTrim) ? Number(qTrim) : null;
      const provider = q.provider?.trim() || "";
      const userId = q.user_id?.trim() || "";
      const paidOnly = q.paid_only === "1" || q.paid_only === "true";

      const where: Prisma.OrderWhereInput = {
        user: { projectId },
        ...(userId ? { userId } : {}),
        ...(provider ? { provider: { contains: provider } } : {}),
        ...(paidOnly ? { amountCents: { gt: 0 } } : {}),
        ...(status
          ? { status }
          : paidOnly
            ? {
                status: {
                  in: ["paid", "provisioning", "provisioned", "refunded"],
                },
              }
            : {}),
        ...(qTrim
          ? {
              OR: [
                { id: { contains: qTrim } },
                { providerRef: { contains: qTrim } },
                { couponCode: { contains: qTrim } },
                { user: { email: { contains: qTrim } } },
                { user: { id: { contains: qTrim } } },
                ...(qAsUid != null ? [{ user: { uid: qAsUid } }] : []),
              ],
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          include: {
            user: { select: { id: true, email: true, uid: true } },
            plan: { select: { id: true, code: true, name: true } },
            paymentChannel: { select: { id: true, code: true, name: true } },
            _count: { select: { commissions: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

      return { total, items, project_id: projectId };
    } catch (err) {
      return mapErr(err, reply);
    }
  });
};
