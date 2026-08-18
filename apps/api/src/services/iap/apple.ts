import { X509Certificate } from "node:crypto";
import {
  compactVerify,
  decodeProtectedHeader,
  importX509,
  type JWTPayload,
} from "jose";
import { env } from "../../config.js";
import { rejectForgedTicketIfLive } from "./store-package-match.js";

export const APP_STORE_PROVIDER = "app_store";

export type AppleTransactionInfo = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  purchaseDate: Date;
  expiresDate: Date | null;
  type: string | null;
  environment: string | null;
  /** Apple JWS price: currency units × 1000 */
  priceMillis: number | null;
  currency: string | null;
  /** 1=introductory, 2=promotional, 3=offer code, 4=win-back (stringified) */
  offerType: string | null;
  /** FREE_TRIAL | PAY_AS_YOU_GO | PAY_UP_FRONT */
  offerDiscountType: string | null;
  offerIdentifier: string | null;
  /** ISO 8601 duration when present */
  offerPeriod: string | null;
  raw: Record<string, unknown>;
};

function err(code: string, status = 400) {
  return Object.assign(new Error(code), { statusCode: status });
}

function msToDate(v: unknown): Date | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}

function optionalString(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function optionalNonNegInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function payloadToTxn(payload: Record<string, unknown>): AppleTransactionInfo {
  const transactionId = String(payload.transactionId || "");
  const productId = String(payload.productId || "");
  const bundleId = String(payload.bundleId || "");
  if (!transactionId || !productId) {
    throw err("iap.transaction_incomplete");
  }
  return {
    transactionId,
    originalTransactionId: String(payload.originalTransactionId || transactionId),
    productId,
    bundleId,
    purchaseDate: msToDate(payload.purchaseDate) || new Date(),
    expiresDate: msToDate(payload.expiresDate),
    type: payload.type != null ? String(payload.type) : null,
    environment: payload.environment != null ? String(payload.environment) : null,
    priceMillis: optionalNonNegInt(payload.price),
    currency: optionalString(payload.currency),
    offerType: optionalString(payload.offerType),
    offerDiscountType: optionalString(payload.offerDiscountType),
    offerIdentifier: optionalString(payload.offerIdentifier),
    offerPeriod: optionalString(payload.offerPeriod),
    raw: payload,
  };
}

/** mock:<productId>:<transactionId>[:bundleId] or JSON mock payload */
function parseMockTransaction(raw: string): AppleTransactionInfo {
  if (raw.startsWith("mock:")) {
    const parts = raw.split(":");
    const productId = parts[1] || "";
    const transactionId = parts[2] || `mock_tx_${Date.now()}`;
    if (!productId) throw err("iap.mock_product_required");
    return {
      transactionId,
      originalTransactionId: transactionId,
      productId,
      bundleId: parts[3]?.trim() || "",
      purchaseDate: new Date(),
      expiresDate: null,
      type: "Consumable",
      environment: "Sandbox",
      priceMillis: null,
      currency: null,
      offerType: null,
      offerDiscountType: null,
      offerIdentifier: null,
      offerPeriod: null,
      raw: { mock: true, productId, transactionId },
    };
  }

  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (!json.mock && !json.productId) throw err("iap.mock_invalid");
    const productId = String(json.productId || "");
    const transactionId = String(json.transactionId || `mock_tx_${Date.now()}`);
    if (!productId) throw err("iap.mock_product_required");
    return {
      transactionId,
      originalTransactionId: String(json.originalTransactionId || transactionId),
      productId,
      bundleId: String(json.bundleId || ""),
      purchaseDate: msToDate(json.purchaseDate) || new Date(),
      expiresDate: msToDate(json.expiresDate),
      type: json.type != null ? String(json.type) : "Consumable",
      environment: "Sandbox",
      priceMillis: optionalNonNegInt(json.price ?? json.priceMillis),
      currency: optionalString(json.currency),
      offerType: optionalString(json.offerType),
      offerDiscountType: optionalString(json.offerDiscountType),
      offerIdentifier: optionalString(json.offerIdentifier),
      offerPeriod: optionalString(json.offerPeriod),
      raw: json,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("iap.")) throw e;
    throw err("iap.mock_invalid");
  }
}

/**
 * Verify StoreKit 2 signed transaction JWS (x5c leaf cert).
 * Does not pin Apple Root CA in P1; production should add chain trust later.
 */
async function verifyAppleJws(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || !x5c[0] || typeof x5c[0] !== "string") {
    throw err("iap.jws_missing_x5c");
  }

  const pem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  try {
    // Ensure cert parses
    new X509Certificate(pem);
  } catch {
    throw err("iap.jws_cert_invalid");
  }

  const key = await importX509(pem, header.alg || "ES256");
  let payload: JWTPayload;
  try {
    const verified = await compactVerify(jws, key);
    payload = JSON.parse(new TextDecoder().decode(verified.payload)) as JWTPayload;
  } catch {
    throw err("iap.jws_verify_failed", 401);
  }

  return payload as Record<string, unknown>;
}

export async function verifySignedTransaction(
  signedTransaction: string,
): Promise<AppleTransactionInfo> {
  const raw = signedTransaction.trim();
  if (!raw) throw err("iap.signed_transaction_required");

  if (env.APPLE_IAP_MODE === "mock") {
    // Allow mock formats OR pass-through JSON; reject looking-like real JWS unless mock:
    if (raw.startsWith("mock:") || raw.startsWith("{")) {
      return parseMockTransaction(raw);
    }
    // In mock mode, still accept real JWS if provided (decode+verify when possible)
  }

  rejectForgedTicketIfLive(env.APPLE_IAP_MODE, raw);

  const payload = await verifyAppleJws(raw);
  return payloadToTxn(payload);
}

export type AppleAsnNotification = {
  notificationUUID: string;
  notificationType: string;
  subtype: string | null;
  transaction: AppleTransactionInfo | null;
  raw: Record<string, unknown>;
};

/** Parse ASN V2 signedPayload, or mock body when APPLE_IAP_MODE=mock. */
export async function parseAppleNotification(body: unknown): Promise<AppleAsnNotification> {
  if (env.APPLE_IAP_MODE === "mock" && body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    // Simplified mock: { mock: true, notificationUUID, notificationType, transactionId, productId? }
    if (b.mock === true || b.signedPayload === "mock" || !b.signedPayload) {
      const notificationType = String(b.notificationType || b.notification_type || "");
      const notificationUUID = String(
        b.notificationUUID || b.notification_uuid || `mock_asn_${Date.now()}`,
      );
      if (!notificationType) throw err("iap.asn_type_required");
      let transaction: AppleTransactionInfo | null = null;
      const txId = b.transactionId || b.transaction_id;
      if (txId) {
        const productId = String(b.productId || b.product_id || "unknown");
        transaction = {
          transactionId: String(txId),
          originalTransactionId: String(b.originalTransactionId || txId),
          productId,
          bundleId: String(b.bundleId || ""),
          purchaseDate: msToDate(b.purchaseDate) || new Date(),
          expiresDate: msToDate(b.expiresDate),
          type: optionalString(b.type),
          environment: "Sandbox",
          priceMillis: optionalNonNegInt(b.price ?? b.priceMillis),
          currency: optionalString(b.currency),
          offerType: optionalString(b.offerType),
          offerDiscountType: optionalString(b.offerDiscountType),
          offerIdentifier: optionalString(b.offerIdentifier),
          offerPeriod: optionalString(b.offerPeriod),
          raw: b,
        };
      }
      return {
        notificationUUID,
        notificationType,
        subtype: b.subtype != null ? String(b.subtype) : null,
        transaction,
        raw: b,
      };
    }
  }

  const signedPayload =
    body && typeof body === "object" && "signedPayload" in body
      ? String((body as { signedPayload: unknown }).signedPayload || "")
      : "";
  if (!signedPayload) throw err("iap.asn_payload_required");

  const outer = await verifyAppleJws(signedPayload);
  const notificationType = String(outer.notificationType || "");
  const notificationUUID = String(outer.notificationUUID || "");
  if (!notificationType || !notificationUUID) {
    throw err("iap.asn_incomplete");
  }

  const data = (outer.data && typeof outer.data === "object"
    ? outer.data
    : {}) as Record<string, unknown>;
  let transaction: AppleTransactionInfo | null = null;
  const signedTxn = data.signedTransactionInfo;
  if (typeof signedTxn === "string" && signedTxn) {
    transaction = await verifySignedTransaction(signedTxn);
  }

  return {
    notificationUUID,
    notificationType,
    subtype: outer.subtype != null ? String(outer.subtype) : null,
    transaction,
    raw: outer,
  };
}
