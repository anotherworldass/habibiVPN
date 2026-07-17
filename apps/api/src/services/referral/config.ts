import { prisma } from "../../lib/prisma.js";

export type ReferralConfigView = {
  id: string;
  enabled: boolean;
  maxLevel: number;
  settleDays: number;
  minWithdrawCents: number;
  withdrawFeeBps: number;
  maxTotalRateBps: number;
  withdrawMethods: string[];
  levels: { level: number; rateBps: number }[];
};

const DEFAULT_LEVELS = [
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

/** Ensure default config + 5-level rates exist. */
export async function seedReferralConfigIfNeeded(): Promise<void> {
  const existing = await prisma.referralConfig.findUnique({ where: { id: "default" } });
  if (!existing) {
    await prisma.referralConfig.create({
      data: {
        id: "default",
        enabled: true,
        maxLevel: 5,
        settleDays: 7,
        minWithdrawCents: 10000,
        withdrawFeeBps: 300,
        maxTotalRateBps: 2000,
        withdrawMethods: ["usdt", "bank"],
      },
    });
  }

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

export async function getReferralConfig(): Promise<ReferralConfigView> {
  await seedReferralConfigIfNeeded();
  const [config, levels] = await Promise.all([
    prisma.referralConfig.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.referralLevelRate.findMany({ orderBy: { level: "asc" } }),
  ]);
  return {
    id: config.id,
    enabled: config.enabled,
    maxLevel: config.maxLevel,
    settleDays: config.settleDays,
    minWithdrawCents: config.minWithdrawCents,
    withdrawFeeBps: config.withdrawFeeBps,
    maxTotalRateBps: config.maxTotalRateBps,
    withdrawMethods: parseMethods(config.withdrawMethods),
    levels: levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
  };
}

export type UpdateReferralConfigInput = {
  enabled?: boolean;
  maxLevel?: number;
  settleDays?: number;
  minWithdrawCents?: number;
  withdrawFeeBps?: number;
  maxTotalRateBps?: number;
  withdrawMethods?: string[];
  levels?: { level: number; rateBps: number }[];
};

export async function updateReferralConfig(
  input: UpdateReferralConfigInput,
): Promise<ReferralConfigView> {
  await seedReferralConfigIfNeeded();

  const maxLevel = input.maxLevel ?? (await prisma.referralConfig.findUniqueOrThrow({ where: { id: "default" } })).maxLevel;
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
    const cfg = await prisma.referralConfig.findUniqueOrThrow({ where: { id: "default" } });
    const budget = input.maxTotalRateBps ?? cfg.maxTotalRateBps;
    if (total > budget) {
      throw Object.assign(new Error("referral.total_rate_exceeded"), { statusCode: 400 });
    }
  }

  if (input.maxLevel != null && (input.maxLevel < 1 || input.maxLevel > 10)) {
    throw Object.assign(new Error("referral.max_level_invalid"), { statusCode: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.referralConfig.update({
      where: { id: "default" },
      data: {
        ...(input.enabled != null ? { enabled: input.enabled } : {}),
        ...(input.maxLevel != null ? { maxLevel: input.maxLevel } : {}),
        ...(input.settleDays != null ? { settleDays: input.settleDays } : {}),
        ...(input.minWithdrawCents != null ? { minWithdrawCents: input.minWithdrawCents } : {}),
        ...(input.withdrawFeeBps != null ? { withdrawFeeBps: input.withdrawFeeBps } : {}),
        ...(input.maxTotalRateBps != null ? { maxTotalRateBps: input.maxTotalRateBps } : {}),
        ...(input.withdrawMethods != null ? { withdrawMethods: input.withdrawMethods } : {}),
      },
    });

    if (levels) {
      await tx.referralLevelRate.deleteMany();
      await tx.referralLevelRate.createMany({
        data: levels.map((l) => ({ level: l.level, rateBps: l.rateBps })),
      });
      const newMax = Math.max(...levels.map((l) => l.level), maxLevel);
      await tx.referralConfig.update({
        where: { id: "default" },
        data: { maxLevel: input.maxLevel ?? newMax },
      });
    }
  });

  return getReferralConfig();
}
