import { prisma } from "../lib/prisma.js";
import { ensurePlanCatalogOffers } from "./catalog.js";

/**
 * Deep-copy sellable plans (+ catalog offers) from one project to another.
 * Store product IDs are skipped (globally unique / App Store specific).
 */
export async function copyPlansBetweenProjects(
  fromProjectId: string,
  toProjectId: string,
): Promise<{ copied: number }> {
  if (fromProjectId === toProjectId) return { copied: 0 };

  const source = await prisma.plan.findMany({
    where: { projectId: fromProjectId },
    include: { catalogOffers: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  let copied = 0;
  for (const plan of source) {
    const exists = await prisma.plan.findUnique({
      where: {
        projectId_code: { projectId: toProjectId, code: plan.code },
      },
    });
    if (exists) continue;

    const created = await prisma.plan.create({
      data: {
        projectId: toProjectId,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        nameI18n: plan.nameI18n ?? {},
        descriptionI18n: plan.descriptionI18n ?? {},
        priceCents: plan.priceCents,
        currency: plan.currency,
        upstreamPlanRef: plan.upstreamPlanRef,
        validitySeconds: plan.validitySeconds,
        billingPeriodSeconds: plan.billingPeriodSeconds,
        dataLimitBytes: plan.dataLimitBytes,
        fupTiers: plan.fupTiers ?? undefined,
        deviceSlots: plan.deviceSlots,
        billingType: plan.billingType,
        isFreeClaimable: plan.isFreeClaimable,
        enabled: plan.enabled,
        sortOrder: plan.sortOrder,
      },
    });

    if (plan.catalogOffers.length) {
      await prisma.planCatalogOffer.createMany({
        data: plan.catalogOffers.map((o) => ({
          planId: created.id,
          client: o.client,
          enabled: o.enabled,
          sortOrder: o.sortOrder,
          paymentMode: o.paymentMode,
        })),
      });
    } else {
      await ensurePlanCatalogOffers(created.id);
    }
    copied += 1;
  }

  return { copied };
}
