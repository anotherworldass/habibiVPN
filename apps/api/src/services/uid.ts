import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const COUNTER_ID = 1;
/** First public UID shown to users. */
export const UID_START = 160_003;

/**
 * Allocate next numeric display UID inside a transaction.
 * Counter row is upserted then incremented atomically.
 */
export async function allocateUid(tx: Tx): Promise<number> {
  await tx.uidCounter.upsert({
    where: { id: COUNTER_ID },
    create: { id: COUNTER_ID, nextUid: UID_START },
    update: {},
  });

  const updated = await tx.uidCounter.update({
    where: { id: COUNTER_ID },
    data: { nextUid: { increment: 1 } },
  });

  // update returns the value AFTER increment; allocated id is previous next
  return updated.nextUid - 1;
}
