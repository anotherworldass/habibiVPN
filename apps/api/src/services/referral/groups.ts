import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { DEFAULT_PROJECT_ID } from "../project.js";
import { DEFAULT_LEVELS, seedReferralConfigForProject } from "./config.js";

export const DEFAULT_PROMO_GROUP_ID = "bronze";

export type PromoGroupView = {
  id: string;
  projectId: string;
  name: string;
  code: string;
  isDefault: boolean;
  enabled: boolean;
  maxLevel: number | null;
  sort: number;
  remark: string | null;
  userCount: number;
  levels: { level: number; rateBps: number }[];
};

const SEED_GROUPS = [
  {
    code: "bronze",
    name: "铜牌",
    isDefault: true,
    sort: 30,
    remark: "默认档位",
  },
  {
    code: "silver",
    name: "银牌",
    isDefault: false,
    sort: 20,
    remark: null as string | null,
  },
  {
    code: "gold",
    name: "金牌",
    isDefault: false,
    sort: 10,
    remark: null as string | null,
  },
];

function groupIdFor(projectId: string, code: string) {
  // Keep legacy ids for default project
  if (projectId === DEFAULT_PROJECT_ID) return code;
  return `${projectId}_${code}`;
}

function validateLevels(levels: { level: number; rateBps: number }[]) {
  if (levels.length === 0) {
    throw Object.assign(new Error("promo_group.levels_required"), { statusCode: 400 });
  }
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.level !== i + 1) {
      throw Object.assign(new Error("promo_group.levels_must_be_contiguous"), {
        statusCode: 400,
      });
    }
    if (sorted[i]!.rateBps < 0 || sorted[i]!.rateBps > 10000) {
      throw Object.assign(new Error("promo_group.rate_out_of_range"), { statusCode: 400 });
    }
  }
  if (sorted.length > 10) {
    throw Object.assign(new Error("promo_group.max_level_exceeded"), { statusCode: 400 });
  }
  return sorted;
}

async function resolveSeedLevels() {
  const globalRates = await prisma.referralLevelRate.findMany({
    orderBy: { level: "asc" },
  });
  if (globalRates.length > 0) {
    return globalRates.map((r) => ({ level: r.level, rateBps: r.rateBps }));
  }
  const habibiBronze = await prisma.promoGroup.findUnique({
    where: { id: DEFAULT_PROMO_GROUP_ID },
    include: { levels: { orderBy: { level: "asc" } } },
  });
  if (habibiBronze?.levels.length) {
    return habibiBronze.levels.map((l) => ({ level: l.level, rateBps: l.rateBps }));
  }
  return DEFAULT_LEVELS;
}

/** Ensure bronze/silver/gold exist for a project. */
export async function seedPromoGroupsForProject(projectId: string): Promise<void> {
  await seedReferralConfigForProject(projectId);
  const count = await prisma.promoGroup.count({ where: { projectId } });
  if (count > 0) return;

  const levels = await resolveSeedLevels();
  await prisma.$transaction(async (tx) => {
    for (const g of SEED_GROUPS) {
      await tx.promoGroup.create({
        data: {
          id: groupIdFor(projectId, g.code),
          projectId,
          name: g.name,
          code: g.code,
          isDefault: g.isDefault,
          enabled: true,
          maxLevel: null,
          sort: g.sort,
          remark: g.remark,
          levels: {
            create: levels.map((l) => ({
              level: l.level,
              rateBps: l.rateBps,
            })),
          },
        },
      });
    }
  });
}

/** Ensure default project groups exist (legacy bronze/silver/gold). */
export async function seedPromoGroupsIfNeeded(): Promise<void> {
  await seedPromoGroupsForProject(DEFAULT_PROJECT_ID);
}

export async function getDefaultPromoGroupId(
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<string> {
  await seedPromoGroupsForProject(projectId);
  const def = await prisma.promoGroup.findFirst({
    where: { projectId, isDefault: true },
    select: { id: true },
  });
  return def?.id || groupIdFor(projectId, "bronze");
}

export async function listPromoGroups(
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<PromoGroupView[]> {
  await seedPromoGroupsForProject(projectId);
  const groups = await prisma.promoGroup.findMany({
    where: { projectId },
    include: {
      levels: { orderBy: { level: "asc" } },
      _count: { select: { users: true } },
    },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  return groups.map((g) => ({
    id: g.id,
    projectId: g.projectId,
    name: g.name,
    code: g.code,
    isDefault: g.isDefault,
    enabled: g.enabled,
    maxLevel: g.maxLevel,
    sort: g.sort,
    remark: g.remark,
    userCount: g._count.users,
    levels: g.levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
  }));
}

export async function getPromoGroup(id: string): Promise<PromoGroupView> {
  const g = await prisma.promoGroup.findUnique({
    where: { id },
    include: {
      levels: { orderBy: { level: "asc" } },
      _count: { select: { users: true } },
    },
  });
  if (!g) {
    throw Object.assign(new Error("promo_group.not_found"), { statusCode: 404 });
  }
  return {
    id: g.id,
    projectId: g.projectId,
    name: g.name,
    code: g.code,
    isDefault: g.isDefault,
    enabled: g.enabled,
    maxLevel: g.maxLevel,
    sort: g.sort,
    remark: g.remark,
    userCount: g._count.users,
    levels: g.levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
  };
}

export type UpdatePromoGroupInput = {
  name?: string;
  enabled?: boolean;
  maxLevel?: number | null;
  sort?: number;
  remark?: string | null;
  levels?: { level: number; rateBps: number }[];
};

export async function updatePromoGroup(
  id: string,
  input: UpdatePromoGroupInput,
): Promise<PromoGroupView> {
  const existing = await prisma.promoGroup.findUnique({ where: { id } });
  if (!existing) {
    throw Object.assign(new Error("promo_group.not_found"), { statusCode: 404 });
  }

  if (input.maxLevel != null && (input.maxLevel < 1 || input.maxLevel > 10)) {
    throw Object.assign(new Error("promo_group.max_level_invalid"), { statusCode: 400 });
  }

  const levels = input.levels ? validateLevels(input.levels) : null;

  await prisma.$transaction(async (tx) => {
    await tx.promoGroup.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.enabled != null ? { enabled: input.enabled } : {}),
        ...(input.maxLevel !== undefined ? { maxLevel: input.maxLevel } : {}),
        ...(input.sort != null ? { sort: input.sort } : {}),
        ...(input.remark !== undefined ? { remark: input.remark } : {}),
      },
    });

    if (levels) {
      await tx.promoGroupLevelRate.deleteMany({ where: { groupId: id } });
      await tx.promoGroupLevelRate.createMany({
        data: levels.map((l) => ({
          groupId: id,
          level: l.level,
          rateBps: l.rateBps,
        })),
      });

      // Keep legacy seed rates + project maxLevel in sync when editing default group
      if (existing.isDefault) {
        if (existing.projectId === DEFAULT_PROJECT_ID) {
          await tx.referralLevelRate.deleteMany();
          await tx.referralLevelRate.createMany({
            data: levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
          });
        }
        const newMax = Math.max(...levels.map((l) => l.level));
        await tx.referralConfig.updateMany({
          where: { projectId: existing.projectId },
          data: { maxLevel: newMax },
        });
      }
    }
  });

  return getPromoGroup(id);
}

export async function setUserPromoGroup(
  userId: string,
  groupId: string,
  adminId: string,
): Promise<{ userId: string; promoGroupId: string }> {
  const [user, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, promoGroupId: true, projectId: true },
    }),
    prisma.promoGroup.findUnique({ where: { id: groupId } }),
  ]);
  if (!user) {
    throw Object.assign(new Error("user.not_found"), { statusCode: 404 });
  }
  if (!group) {
    throw Object.assign(new Error("promo_group.not_found"), { statusCode: 404 });
  }
  if (group.projectId !== user.projectId) {
    throw Object.assign(new Error("promo_group.project_mismatch"), { statusCode: 400 });
  }
  if (!group.enabled) {
    throw Object.assign(new Error("promo_group.disabled"), { statusCode: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { promoGroupId: groupId },
  });

  await writeAudit({
    actorType: "admin",
    actorId: adminId,
    action: "promo_group.assign",
    targetType: "user",
    targetId: userId,
    meta: { from: user.promoGroupId, to: groupId },
  });

  return { userId, promoGroupId: groupId };
}

/** Sync a project's default promo group rates (optional config PUT levels). */
export async function syncDefaultGroupLevels(
  projectId: string,
  levels: { level: number; rateBps: number }[],
): Promise<void> {
  await seedPromoGroupsForProject(projectId);
  const sorted = validateLevels(levels);
  const defId = await getDefaultPromoGroupId(projectId);
  await prisma.$transaction(async (tx) => {
    await tx.promoGroupLevelRate.deleteMany({ where: { groupId: defId } });
    await tx.promoGroupLevelRate.createMany({
      data: sorted.map((l) => ({
        groupId: defId,
        level: l.level,
        rateBps: l.rateBps,
      })),
    });
  });
}

/** @deprecated use syncDefaultGroupLevels */
export async function syncDefaultGroupLevelsFromGlobal(
  levels: { level: number; rateBps: number }[],
): Promise<void> {
  return syncDefaultGroupLevels(DEFAULT_PROJECT_ID, levels);
}
