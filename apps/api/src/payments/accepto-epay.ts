import { createHash, timingSafeEqual } from "node:crypto";
import type {
  AcceptoEpayConfig,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentAdapter,
  PaymentCallback,
  PaymentCredentials,
  PaymentState,
  QueryPaymentContext,
  QueryPaymentResult,
} from "./types.js";

const PAID_STATUSES = new Set([
  "COMPLETED",
  "COMPLETE",
  "SUCCESS",
  "SUCCEEDED",
  "PAID",
  "SETTLED",
  "CONFIRMED",
  "TRADE_SUCCESS",
]);

export function epaySign(params: Record<string, string>, key: string) {
  const body = Object.keys(params)
    .filter((name) => name !== "sign" && name !== "sign_type" && params[name] !== "")
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  return createHash("md5").update(body + key, "utf8").digest("hex");
}

export function parseCheckoutId(paymentUrl: string | null | undefined) {
  if (!paymentUrl) return null;
  const match = paymentUrl.match(
    /\/checkout\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1] ?? null;
}

export function mapCheckoutStatus(status?: string | null): PaymentState {
  if (status && PAID_STATUSES.has(status.trim().toUpperCase())) return "paid";
  return "pending";
}

function signaturesEqual(actual: string, expected: string) {
  const a = Buffer.from(actual.toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

function amountToCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("payment.invalid_amount");
  return Math.round(Number(value) * 100);
}

function compactParams(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
}

export class AcceptoEpayAdapter implements PaymentAdapter {
  readonly callbackAck = "success";

  constructor(
    private readonly config: AcceptoEpayConfig,
    private readonly credentials: PaymentCredentials,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const params = compactParams({
      pid: this.config.pid,
      type: input.channelCode,
      out_trade_no: input.merchantOrderNo,
      notify_url: input.notifyUrl,
      return_url: input.jumpUrl || "",
      name: input.subject || "VPN",
      money: centsToAmount(input.amountCents),
    });
    const submitUrl = new URL(this.config.submitUrl);
    submitUrl.search = new URLSearchParams({
      ...params,
      sign: epaySign(params, this.credentials.secret),
      sign_type: "MD5",
    }).toString();
    const paymentUrl = submitUrl.toString();
    try {
      const response = await fetch(paymentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      const location = response.headers.get("location");
      if (location) {
        const resolved = new URL(location, this.config.submitUrl).toString();
        if (parseCheckoutId(resolved)) {
          return { providerOrderNo: null, paymentUrl: resolved };
        }
      }
    } catch {
      // Hosted checkout still works via the signed submit URL.
    }
    return { providerOrderNo: null, paymentUrl };
  }

  async queryPayment(
    _merchantOrderNo: string,
    ctx?: QueryPaymentContext,
  ): Promise<QueryPaymentResult> {
    const checkoutId = parseCheckoutId(ctx?.paymentUrl);
    if (!checkoutId) return { state: "pending" };
    try {
      const url = new URL(
        `/api/checkout/${encodeURIComponent(checkoutId)}`,
        this.config.apiBaseUrl,
      );
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return { state: "pending", rawStatus: `http_${response.status}` };
      const payload = (await response.json()) as {
        status?: string;
        order?: { id?: string; status?: string };
      };
      const status = payload.order?.status || payload.status;
      const state = mapCheckoutStatus(status);
      return {
        state,
        providerOrderNo: state === "paid" ? checkoutId : undefined,
        rawStatus: status,
      };
    } catch {
      return { state: "pending" };
    }
  }

  verifyCallback(payload: Record<string, string>): PaymentCallback {
    const required = ["pid", "trade_no", "out_trade_no", "money", "trade_status", "sign"] as const;
    for (const key of required) {
      if (!payload[key]) {
        throw Object.assign(new Error("payment.callback_invalid"), { statusCode: 400 });
      }
    }
    if (payload.pid !== this.config.pid) {
      throw Object.assign(new Error("payment.callback_app_mismatch"), { statusCode: 400 });
    }
    const expected = epaySign(payload, this.credentials.secret);
    if (!signaturesEqual(payload.sign, expected)) {
      throw Object.assign(new Error("payment.callback_bad_signature"), { statusCode: 401 });
    }
    return {
      merchantOrderNo: payload.out_trade_no,
      providerOrderNo: payload.trade_no,
      state: payload.trade_status === "TRADE_SUCCESS" ? "paid" : "pending",
      amountCents: amountToCents(payload.money),
    };
  }
}
