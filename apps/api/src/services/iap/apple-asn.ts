import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../lib/audit.js";
import { refundOrderAndInvalidate } from "../orders.js";
import { APP_STORE_PROVIDER, parseAppleNotification } from "./apple.js";
import { fulfillAppleRenewal } from "./fulfill.js";

const RENEWAL_TYPES = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "OFFER_REDEEMED",
  "ONE_TIME_CHARGE",
]);

const REFUND_TYPES = new Set(["REFUND", "REVOKE", "REFUND_REVERSED"]);

export async function handleAppleNotification(body: unknown): Promise<{
  ok: boolean;
  duplicate?: boolean;
  action?: string;
  order_id?: string | null;
  skipped?: string;
}> {
  const note = await parseAppleNotification(body);

  const dup = await prisma.iapNotificationLog.findUnique({
    where: { notificationUuid: note.notificationUUID },
  });
  if (dup) {
    return { ok: true, duplicate: true, action: "ignored_duplicate" };
  }

  let action = "logged";
  let orderId: string | null = null;
  let skipped: string | undefined;

  try {
    if (REFUND_TYPES.has(note.notificationType) && note.transaction) {
      const order = await prisma.order.findUnique({
        where: {
          provider_providerRef: {
            provider: APP_STORE_PROVIDER,
            providerRef: note.transaction.transactionId,
          },
        },
      });
      if (order && order.status !== "refunded") {
        await refundOrderAndInvalidate(order.id, `apple_asn:${note.notificationType}`);
        orderId = order.id;
        action = "refunded";
      } else if (!order && note.transaction.originalTransactionId) {
        // Refund may reference original; try latest paid order with that original as providerRef prefix
        const alt = await prisma.order.findFirst({
          where: {
            provider: APP_STORE_PROVIDER,
            providerRef: note.transaction.originalTransactionId,
            status: { not: "refunded" },
          },
          orderBy: { createdAt: "desc" },
        });
        if (alt) {
          await refundOrderAndInvalidate(alt.id, `apple_asn:${note.notificationType}`);
          orderId = alt.id;
          action = "refunded";
        } else {
          skipped = "iap.refund_order_not_found";
          action = "skipped";
        }
      } else {
        skipped = "iap.refund_order_not_found";
        action = "skipped";
      }
    } else if (RENEWAL_TYPES.has(note.notificationType) && note.transaction) {
      const result = await fulfillAppleRenewal(note.transaction);
      orderId = result.orderId;
      action = result.created ? "fulfilled" : result.skipped ? "skipped" : "idempotent";
      skipped = result.skipped;
    } else {
      action = "ignored_type";
    }

    await prisma.iapNotificationLog.create({
      data: {
        notificationUuid: note.notificationUUID,
        notificationType: note.notificationType,
        subtype: note.subtype,
        transactionId: note.transaction?.transactionId ?? null,
        payload: note.raw as object,
      },
    });

    await writeAudit({
      actorType: "system",
      action: "iap.apple.asn",
      targetType: "order",
      targetId: orderId || undefined,
      meta: {
        notificationUUID: note.notificationUUID,
        notificationType: note.notificationType,
        subtype: note.subtype,
        action,
        skipped,
      },
    });

    return { ok: true, action, order_id: orderId, skipped };
  } catch (e) {
    // Still log failed attempts with uuid to avoid infinite Apple retries for poison payloads?
    // Prefer not logging on failure so Apple retries. Re-throw.
    throw e;
  }
}
