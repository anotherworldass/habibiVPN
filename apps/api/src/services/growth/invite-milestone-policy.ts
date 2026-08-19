export function nextPerInviteGrants(input: {
  qualifiedIds: string[];
  requiredCount: number;
  existing: Array<{ inviteeId: string; attemptIndex: number }>;
}): Array<{ inviteeId: string; attemptIndex: number }> {
  const cap = Math.max(0, Math.floor(input.requiredCount) - 1);
  if (cap < 1) return [];
  const eligible = input.qualifiedIds.slice(0, cap);
  const granted = new Set(input.existing.map((e) => e.inviteeId));
  const usedAttempts = new Set(input.existing.map((e) => e.attemptIndex));
  let nextAttempt = 1;
  const out: Array<{ inviteeId: string; attemptIndex: number }> = [];
  for (const inviteeId of eligible) {
    if (granted.has(inviteeId)) continue;
    while (usedAttempts.has(nextAttempt) && nextAttempt <= cap) {
      nextAttempt += 1;
    }
    if (nextAttempt > cap) break;
    out.push({ inviteeId, attemptIndex: nextAttempt });
    usedAttempts.add(nextAttempt);
    nextAttempt += 1;
  }
  return out;
}
