import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function writeAudit(input: {
  actorType: string;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}
