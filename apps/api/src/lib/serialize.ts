/** JSON-safe plan row (BigInt → number | null) */
export function serializePlan<
  T extends { dataLimitBytes?: bigint | null; isFreeClaimable?: boolean },
>(plan: T) {
  return {
    ...plan,
    dataLimitBytes:
      plan.dataLimitBytes == null ? null : Number(plan.dataLimitBytes),
    isFreeClaimable: !!plan.isFreeClaimable,
  };
}
