import { createHash, createPrivateKey, createSign, randomBytes } from "node:crypto";
import { env } from "../../config.js";

export const GOOGLE_PLAY_PROVIDER = "google_play";

export type GooglePurchaseInfo = {
  productId: string;
  packageName: string;
  purchaseToken: string;
  /** Stable short id for Order.providerRef */
  providerRef: string;
  orderId: string | null;
  purchaseDate: Date;
  expiresDate: Date | null;
  /** Micros in purchase currency when available */
  priceMicros: number | null;
  currency: string | null;
  isSubscription: boolean;
  isTrialPeriod: boolean;
  acknowledgementState: number | null;
  raw: Record<string, unknown>;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

function err(code: string, status = 400) {
  return Object.assign(new Error(code), { statusCode: status });
}

function providerRefFromToken(token: string, orderId: string | null): string {
  if (orderId?.trim()) return orderId.trim().slice(0, 180);
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 40);
  return `gpt_${hash}`;
}

function parseMockPurchase(input: {
  productId: string;
  purchaseToken: string;
  packageName: string;
}): GooglePurchaseInfo {
  const raw = input.purchaseToken.trim();
  let productId = input.productId;
  let orderId: string | null = null;
  let transactionId = `mock_g_${Date.now()}`;
  let expiresDate: Date | null = null;
  let isSubscription = false;
  let isTrialPeriod = false;
  let priceMicros: number | null = null;
  let currency: string | null = null;

  if (raw.startsWith("mock:")) {
    // mock:<productId>:<orderId|tx>[:subscription]
    const parts = raw.split(":");
    productId = parts[1] || productId;
    transactionId = parts[2] || transactionId;
    orderId = transactionId.startsWith("GPA.") ? transactionId : `GPA.${transactionId}`;
    isSubscription = (parts[3] || "").toLowerCase().includes("sub");
    if (isSubscription) {
      expiresDate = new Date(Date.now() + 30 * 86400_000);
    }
  } else if (raw.startsWith("{")) {
    const json = JSON.parse(raw) as Record<string, unknown>;
    productId = String(json.productId || productId);
    orderId = json.orderId != null ? String(json.orderId) : null;
    transactionId = String(json.transactionId || orderId || transactionId);
    isSubscription = Boolean(json.isSubscription);
    isTrialPeriod = Boolean(json.isTrialPeriod);
    if (json.expiresDate != null) {
      const n = Number(json.expiresDate);
      expiresDate = Number.isFinite(n) ? new Date(n) : new Date(String(json.expiresDate));
    } else if (isSubscription) {
      expiresDate = new Date(Date.now() + 30 * 86400_000);
    }
    if (json.priceMicros != null) priceMicros = Number(json.priceMicros);
    if (json.currency != null) currency = String(json.currency);
  } else {
    throw err("iap.google_mock_invalid");
  }

  if (!productId) throw err("iap.mock_product_required");

  return {
    productId,
    packageName: input.packageName,
    purchaseToken: raw,
    providerRef: providerRefFromToken(raw, orderId || transactionId),
    orderId: orderId || transactionId,
    purchaseDate: new Date(),
    expiresDate,
    priceMicros,
    currency,
    isSubscription,
    isTrialPeriod,
    acknowledgementState: 0,
    raw: { mock: true, productId, orderId, transactionId },
  };
}

function loadServiceAccount(): ServiceAccount {
  const raw = env.GOOGLE_IAP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw err("iap.google_credentials_missing", 503);
  try {
    const json = JSON.parse(raw) as ServiceAccount;
    if (!json.client_email || !json.private_key) {
      throw err("iap.google_credentials_invalid", 503);
    }
    return json;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("iap.")) throw e;
    throw err("iap.google_credentials_invalid", 503);
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const key = createPrivateKey(sa.private_key);
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw err("iap.google_token_failed", 502);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw err("iap.google_token_failed", 502);
  return data.access_token;
}

async function fetchJson(
  url: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/**
 * Verify a Play Billing purchaseToken via Android Publisher API (or mock).
 */
export async function verifyGooglePurchase(input: {
  productId: string;
  purchaseToken: string;
  packageName?: string | null;
}): Promise<GooglePurchaseInfo> {
  const productId = input.productId.trim();
  const purchaseToken = input.purchaseToken.trim();
  if (!productId) throw err("iap.product_id_required");
  if (!purchaseToken) throw err("iap.purchase_token_required");

  const packageName =
    input.packageName?.trim() || env.GOOGLE_IAP_PACKAGE_NAME?.trim() || "";
  if (!packageName && env.GOOGLE_IAP_MODE === "live") {
    throw err("iap.package_name_required");
  }
  const pkg = packageName || "com.example.habibi";

  if (env.GOOGLE_IAP_MODE === "mock") {
    if (
      purchaseToken.startsWith("mock:") ||
      purchaseToken.startsWith("{") ||
      env.NODE_ENV !== "production"
    ) {
      // In mock mode accept mock: / JSON; also allow opaque tokens mapped to productId
      if (purchaseToken.startsWith("mock:") || purchaseToken.startsWith("{")) {
        return parseMockPurchase({ productId, purchaseToken, packageName: pkg });
      }
      return parseMockPurchase({
        productId,
        purchaseToken: `mock:${productId}:${purchaseToken}`,
        packageName: pkg,
      });
    }
  }

  if (
    env.GOOGLE_IAP_MODE === "live" &&
    (purchaseToken.startsWith("mock:") || purchaseToken.startsWith("{"))
  ) {
    throw err("iap.mock_not_allowed_in_live");
  }

  const accessToken = await getGoogleAccessToken();
  const encPkg = encodeURIComponent(pkg);
  const encProduct = encodeURIComponent(productId);
  const encToken = encodeURIComponent(purchaseToken);

  // Try one-time product first, then subscription
  const productUrl =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encPkg}` +
    `/purchases/products/${encProduct}/tokens/${encToken}`;
  const productRes = await fetchJson(productUrl, accessToken);

  if (productRes.ok) {
    const b = productRes.body;
    // purchaseState: 0=purchased, 1=canceled, 2=pending
    if (Number(b.purchaseState) !== 0) {
      throw err("iap.google_not_purchased", 402);
    }
    const orderId = b.orderId != null ? String(b.orderId) : null;
    const purchaseTimeMillis = Number(b.purchaseTimeMillis || Date.now());
    return {
      productId,
      packageName: pkg,
      purchaseToken,
      providerRef: providerRefFromToken(purchaseToken, orderId),
      orderId,
      purchaseDate: new Date(purchaseTimeMillis),
      expiresDate: null,
      priceMicros: null,
      currency: null,
      isSubscription: false,
      isTrialPeriod: false,
      acknowledgementState:
        b.acknowledgementState != null ? Number(b.acknowledgementState) : null,
      raw: b,
    };
  }

  const subUrl =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encPkg}` +
    `/purchases/subscriptions/${encProduct}/tokens/${encToken}`;
  const subRes = await fetchJson(subUrl, accessToken);
  if (!subRes.ok) {
    if (productRes.status === 404 && subRes.status === 404) {
      throw err("iap.google_purchase_not_found", 404);
    }
    throw err("iap.google_verify_failed", 502);
  }

  const b = subRes.body;
  // paymentState: 0=pending, 1=received, 2=free trial, 3=deferred
  const paymentState = b.paymentState != null ? Number(b.paymentState) : null;
  if (paymentState !== 1 && paymentState !== 2) {
    throw err("iap.google_not_purchased", 402);
  }
  const orderId = b.orderId != null ? String(b.orderId) : null;
  const startMs = Number(b.startTimeMillis || Date.now());
  const expiryMs = b.expiryTimeMillis != null ? Number(b.expiryTimeMillis) : null;
  return {
    productId,
    packageName: pkg,
    purchaseToken,
    providerRef: providerRefFromToken(purchaseToken, orderId),
    orderId,
    purchaseDate: new Date(startMs),
    expiresDate: expiryMs && Number.isFinite(expiryMs) ? new Date(expiryMs) : null,
    priceMicros: b.priceAmountMicros != null ? Number(b.priceAmountMicros) : null,
    currency: b.priceCurrencyCode != null ? String(b.priceCurrencyCode) : null,
    isSubscription: true,
    isTrialPeriod: paymentState === 2,
    acknowledgementState:
      b.acknowledgementState != null ? Number(b.acknowledgementState) : null,
    raw: b,
  };
}

/** Best-effort acknowledge so Play stops retrying (one-time products). */
export async function acknowledgeGooglePurchase(info: GooglePurchaseInfo): Promise<void> {
  if (env.GOOGLE_IAP_MODE === "mock") return;
  if (info.acknowledgementState === 1) return;
  try {
    const accessToken = await getGoogleAccessToken();
    const encPkg = encodeURIComponent(info.packageName);
    const encProduct = encodeURIComponent(info.productId);
    const encToken = encodeURIComponent(info.purchaseToken);
    const path = info.isSubscription
      ? `/purchases/subscriptions/${encProduct}/tokens/${encToken}:acknowledge`
      : `/purchases/products/${encProduct}/tokens/${encToken}:acknowledge`;
    await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encPkg}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
  } catch {
    /* non-fatal */
  }
}

export function newMockGooglePurchaseToken(productId: string): string {
  return `mock:${productId}:${randomBytes(6).toString("hex")}`;
}
