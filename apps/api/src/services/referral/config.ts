import { prisma } from "../../lib/prisma.js";
import { DEFAULT_PROJECT_ID } from "../project.js";

export type ReferralConfigView = {
  id: string;
  projectId: string;
  enabled: boolean;
  maxLevel: number;
  settleDays: number;
  minWithdrawCents: number;
  withdrawFeeBps: number;
  maxTotalRateBps: number;
  /** App Store: commission base = floor(order.amountCents * iapCommissionBaseBps / 10000) */
  iapCommissionBaseBps: number;
  /** Google Play: same pattern for provider=google_play */
  playCommissionBaseBps: number;
  /** First-charge base multiplier after store factor */
  firstCommissionBaseBps: number;
  /** Renewal base multiplier after IAP factor */
  renewCommissionBaseBps: number;
  withdrawMethods: string[];
  /** Master switch for phone credit / gift card catalog spends */
  catalogSpendEnabled: boolean;
  /** Legacy/default-group rates (for display / seed); live rates are on PromoGroup */
  levels: { level: number; rateBps: number }[];
};

export const DEFAULT_LEVELS = [
  { level: 1, rateBps: 1400 },
  { level: 2, rateBps: 300 },
  { level: 3, rateBps: 150 },
  { level: 4, rateBps: 100 },
  { level: 5, rateBps: 50 },
];

function parseMethods(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* ignore */
    }
  }
  return ["usdt", "bank"];
}

async function loadTemplateConfig() {
  return prisma.referralConfig.findUnique({ where: { id: DEFAULT_PROJECT_ID } });
}

/** Ensure config row exists for a project (copy from habibi when possible). */
export async function seedReferralConfigForProject(projectId: string): Promise<void> {
  const existing = await prisma.referralConfig.findUnique({
    where: { projectId },
  });
  if (existing) return;

  const template = projectId === DEFAULT_PROJECT_ID ? null : await loadTemplateConfig();
  await prisma.referralConfig.create({
    data: {
      id: projectId,
      projectId,
      enabled: template?.enabled ?? true,
      maxLevel: template?.maxLevel ?? 5,
      settleDays: template?.settleDays ?? 7,
      minWithdrawCents: template?.minWithdrawCents ?? 10000,
      withdrawFeeBps: template?.withdrawFeeBps ?? 300,
      maxTotalRateBps: template?.maxTotalRateBps ?? 2000,
      iapCommissionBaseBps: template?.iapCommissionBaseBps ?? 10000,
      playCommissionBaseBps: template?.playCommissionBaseBps ?? 10000,
      firstCommissionBaseBps: template?.firstCommissionBaseBps ?? 10000,
      renewCommissionBaseBps: template?.renewCommissionBaseBps ?? 10000,
      withdrawMethods: template
        ? parseMethods(template.withdrawMethods)
        : ["usdt", "bank"],
      catalogSpendEnabled: template?.catalogSpendEnabled ?? false,
    },
  });

  // Legacy global rate table: only seed once for habibi template
  if (projectId === DEFAULT_PROJECT_ID) {
    const rateCount = await prisma.referralLevelRate.count();
    if (rateCount === 0) {
      await prisma.referralLevelRate.createMany({
        data: DEFAULT_LEVELS.map((l) => ({
          level: l.level,
          rateBps: l.rateBps,
        })),
      });
    }
  }
}

/** Ensure default project config + legacy level rates exist. */
export async function seedReferralConfigIfNeeded(): Promise<void> {
  await seedReferralConfigForProject(DEFAULT_PROJECT_ID);
}

async function levelsForProject(projectId: string): Promise<{ level: number; rateBps: number }[]> {
  const defGroup = await prisma.promoGroup.findFirst({
    where: { projectId, isDefault: true },
    include: { levels: { orderBy: { level: "asc" } } },
  });
  if (defGroup?.levels.length) {
    return defGroup.levels.map((l) => ({ level: l.level, rateBps: l.rateBps }));
  }
  if (projectId === DEFAULT_PROJECT_ID) {
    const legacy = await prisma.referralLevelRate.findMany({ orderBy: { level: "asc" } });
    if (legacy.length) {
      return legacy.map((l) => ({ level: l.level, rateBps: l.rateBps }));
    }
  }
  return DEFAULT_LEVELS;
}

export async function getReferralConfig(
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<ReferralConfigView> {
  await seedReferralConfigForProject(projectId);
  const [config, levels] = await Promise.all([
    prisma.referralConfig.findUniqueOrThrow({ where: { projectId } }),
    levelsForProject(projectId),
  ]);
  return {
    id: config.id,
    projectId: config.projectId,
    enabled: config.enabled,
    maxLevel: config.maxLevel,
    settleDays: config.settleDays,
    minWithdrawCents: config.minWithdrawCents,
    withdrawFeeBps: config.withdrawFeeBps,
    maxTotalRateBps: config.maxTotalRateBps,
    iapCommissionBaseBps: config.iapCommissionBaseBps,
    playCommissionBaseBps: config.playCommissionBaseBps,
    firstCommissionBaseBps: config.firstCommissionBaseBps,
    renewCommissionBaseBps: config.renewCommissionBaseBps,
    withdrawMethods: parseMethods(config.withdrawMethods),
    catalogSpendEnabled: config.catalogSpendEnabled,
    levels,
  };
}

export type UpdateReferralConfigInput = {
  enabled?: boolean;
  maxLevel?: number;
  settleDays?: number;
  minWithdrawCents?: number;
  withdrawFeeBps?: number;
  maxTotalRateBps?: number;
  iapCommissionBaseBps?: number;
  playCommissionBaseBps?: number;
  firstCommissionBaseBps?: number;
  renewCommissionBaseBps?: number;
  withdrawMethods?: string[];
  catalogSpendEnabled?: boolean;
  levels?: { level: number; rateBps: number }[];
};

export async function updateReferralConfig(
  projectId: string,
  input: UpdateReferralConfigInput,
): Promise<ReferralConfigView> {
  await seedReferralConfigForProject(projectId);

  const maxLevel =
    input.maxLevel ??
    (await prisma.referralConfig.findUniqueOrThrow({ where: { projectId } })).maxLevel;
  const levels = input.levels;

  if (levels) {
    if (levels.length === 0) {
      throw Object.assign(new Error("referral.levels_required"), { statusCode: 400 });
    }
    const sorted = [...levels].sort((a, b) => a.level - b.level);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i]!.level !== i + 1) {
        throw Object.assign(new Error("referral.levels_must_be_contiguous"), { statusCode: 400 });
      }
      if (sorted[i]!.rateBps < 0 || sorted[i]!.rateBps > 10000) {
        throw Object.assign(new Error("referral.rate_out_of_range"), { statusCode: 400 });
      }
    }
    if (sorted.length > 10) {
      throw Object.assign(new Error("referral.max_level_exceeded"), { statusCode: 400 });
    }
    const total = sorted.reduce((s, l) => s + l.rateBps, 0);
    const cfg = await prisma.referralConfig.findUniqueOrThrow({ where: { projectId } });
    const budget = input.maxTotalRateBps ?? cfg.maxTotalRateBps;
    if (total > budget) {
      throw Object.assign(new Error("referral.total_rate_exceeded"), { statusCode: 400 });
    }
  }

  if (input.maxLevel != null && (input.maxLevel < 1 || input.maxLevel > 10)) {
    throw Object.assign(new Error("referral.max_level_invalid"), { statusCode: 400 });
  }
  for (const [key, val] of [
    ["iapCommissionBaseBps", input.iapCommissionBaseBps],
    ["playCommissionBaseBps", input.playCommissionBaseBps],
    ["firstCommissionBaseBps", input.firstCommissionBaseBps],
    ["renewCommissionBaseBps", input.renewCommissionBaseBps],
  ] as const) {
    if (val != null && (val < 0 || val > 10000)) {
      throw Object.assign(new Error(`referral.${key}_out_of_range`), { statusCode: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.referralConfig.update({
      where: { projectId },
      data: {
        ...(input.enabled != null ? { enabled: input.enabled } : {}),
        ...(input.maxLevel != null ? { maxLevel: input.maxLevel } : {}),
        ...(input.settleDays != null ? { settleDays: input.settleDays } : {}),
        ...(input.minWithdrawCents != null ? { minWithdrawCents: input.minWithdrawCents } : {}),
        ...(input.withdrawFeeBps != null ? { withdrawFeeBps: input.withdrawFeeBps } : {}),
        ...(input.maxTotalRateBps != null ? { maxTotalRateBps: input.maxTotalRateBps } : {}),
        ...(input.iapCommissionBaseBps != null
          ? { iapCommissionBaseBps: input.iapCommissionBaseBps }
          : {}),
        ...(input.playCommissionBaseBps != null
          ? { playCommissionBaseBps: input.playCommissionBaseBps }
          : {}),
        ...(input.firstCommissionBaseBps != null
          ? { firstCommissionBaseBps: input.firstCommissionBaseBps }
          : {}),
        ...(input.renewCommissionBaseBps != null
          ? { renewCommissionBaseBps: input.renewCommissionBaseBps }
          : {}),
        ...(input.withdrawMethods != null ? { withdrawMethods: input.withdrawMethods } : {}),
        ...(input.catalogSpendEnabled != null
          ? { catalogSpendEnabled: input.catalogSpendEnabled }
          : {}),
      },
    });

    if (levels) {
      // Keep legacy global rates as habibi seed template
      if (projectId === DEFAULT_PROJECT_ID) {
        await tx.referralLevelRate.deleteMany();
        await tx.referralLevelRate.createMany({
          data: levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
        });
      }
      const newMax = Math.max(...levels.map((l) => l.level), maxLevel);
      await tx.referralConfig.update({
        where: { projectId },
        data: { maxLevel: input.maxLevel ?? newMax },
      });
    }
  });

  if (levels) {
    const { syncDefaultGroupLevels } = await import("./groups.js");
    await syncDefaultGroupLevels(projectId, levels);
  }

  return getReferralConfig(projectId);
}
