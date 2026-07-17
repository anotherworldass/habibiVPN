/**
 * Ensure a free-claimable trial plan exists (maps to 7-day validity if no upstream plan).
 * Usage: pnpm --filter @habibi/api exec tsx scripts/seed-free-plan.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const code = "free_trial";
  const existing = await prisma.plan.findUnique({ where: { code } });
  if (existing) {
    const updated = await prisma.plan.update({
      where: { code },
      data: {
        isFreeClaimable: true,
        enabled: true,
        priceCents: 0,
        validitySeconds: existing.validitySeconds ?? 7 * 86400,
        name: existing.name || "免费试用",
      },
    });
    console.log("updated free plan:", updated.id, updated.code);
    return;
  }

  const created = await prisma.plan.create({
    data: {
      code,
      name: "免费试用",
      description: "注册后免费领取，开通上游订阅链接（默认 7 天）",
      priceCents: 0,
      currency: "USD",
      validitySeconds: 7 * 86400,
      isFreeClaimable: true,
      enabled: true,
      sortOrder: 0,
    },
  });
  console.log("created free plan:", created.id, created.code);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
