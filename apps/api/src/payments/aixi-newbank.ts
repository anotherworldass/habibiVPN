import { createHash, timingSafeEqual } from "node:crypto";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentAdapter,
  PaymentCallback,
  PaymentCredentials,
  PaymentProviderConfig,
  PaymentState,
  QueryPaymentResult,
} from "./types.js";

type GatewayEnvelope<T> = {
  code?: number | string;
  msg?: string;
  data?: T | null;
};

type OrderData = {
  orderNo?: string;
  appOrderNo?: string;
  payUrl?: string;
  orderStatus?: string;
  orderAmt?: string;
  payAmt?: string;
};

function md5Upper(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
}

function sign(values: Record<string, string>, secret: string) {
  const body = Object.entries(values)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return md5Upper(`${body}&key=${secret}`);
}

function signaturesEqual(actual: string, expected: string) {
  const a = Buffer.from(actual.toUpperCase(), "utf8");
  const b = Buffer.from(expected.toUpperCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

function amountToCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("payment.invalid_amount");
  return Math.round(Number(value) * 100);
}

function stateFromStatus(status?: string): PaymentState {
  if (status === "00") return "paid";
  if (status === "01" || !status) return "pending";
  return "failed";
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error(`payment.gateway_http_${response.status}`), {
      statusCode: 502,
    });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw Object.assign(new Error("payment.gateway_invalid_json"), {
      statusCode: 502,
    });
  }
}

export class AixiNewbankAdapter implements PaymentAdapter {
  constructor(
    private readonly config: PaymentProviderConfig,
    private readonly credentials: PaymentCredentials,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const orderAmt = centsToAmount(input.amountCents);
    const signature = sign(
      {
        appId: this.config.appId,
        appOrderNo: input.merchantOrderNo,
        orderAmt,
        payId: input.channelCode,
      },
      this.credentials.secret,
    );
    const form = new URLSearchParams({
      payName: input.payerName || "",
      appId: this.config.appId,
      appOrderNo: input.merchantOrderNo,
      orderAmt,
      payId: input.channelCode,
      sign: signature,
      jumpURL: input.jumpUrl || "",
      notifyURL: input.notifyUrl,
      extParams: "",
    });
    const response = await fetch(this.config.createOrderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const result = await readJson<GatewayEnvelope<OrderData>>(response);
    if (Number(result.code) !== 200 || !result.data?.orderNo || !result.data.payUrl) {
      throw Object.assign(new Error(result.msg || "payment.create_failed"), {
        statusCode: 502,
      });
    }
    return {
      providerOrderNo: result.data.orderNo,
      paymentUrl: result.data.payUrl,
    };
  }

  async queryPayment(merchantOrderNo: string): Promise<QueryPaymentResult> {
    const values = { appId: this.config.appId, appOrderNo: merchantOrderNo };
    const url = new URL(this.config.queryOrderUrl);
    url.search = new URLSearchParams({
      ...values,
      sign: sign(values, this.credentials.secret),
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const result = await readJson<GatewayEnvelope<OrderData>>(response);
    if (Number(result.code) !== 200 || !result.data) {
      throw Object.assign(new Error(result.msg || "payment.query_failed"), {
        statusCode: 502,
      });
    }
    return {
      providerOrderNo: result.data.orderNo,
      state: stateFromStatus(result.data.orderStatus),
      amountCents: result.data.orderAmt ? amountToCents(result.data.orderAmt) : undefined,
      rawStatus: result.data.orderStatus,
    };
  }

  verifyCallback(payload: Record<string, string>): PaymentCallback {
    const required = [
      "appOrderNo",
      "orderNo",
      "orderTime",
      "appId",
      "orderAmt",
      "payAmt",
      "orderStatus",
      "sign",
    ] as const;
    for (const key of required) {
      if (!payload[key]) throw Object.assign(new Error("payment.callback_invalid"), { statusCode: 400 });
    }
    if (payload.appId !== this.config.appId) {
      throw Object.assign(new Error("payment.callback_app_mismatch"), { statusCode: 400 });
    }
    const signed = {
      appId: payload.appId,
      appOrderNo: payload.appOrderNo,
      orderAmt: Number(payload.orderAmt).toFixed(2),
      orderNo: payload.orderNo,
      orderStatus: payload.orderStatus,
      orderTime: payload.orderTime,
      payAmt: Number(payload.payAmt).toFixed(2),
    };
    const expected = sign(signed, this.credentials.secret);
    if (!signaturesEqual(payload.sign, expected)) {
      throw Object.assign(new Error("payment.callback_bad_signature"), { statusCode: 401 });
    }
    return {
      merchantOrderNo: payload.appOrderNo,
      providerOrderNo: payload.orderNo,
      state: stateFromStatus(payload.orderStatus),
      amountCents: amountToCents(payload.orderAmt),
      paidAmountCents: amountToCents(payload.payAmt),
    };
  }

  async queryBalance() {
    if (!this.config.balanceUrl) throw new Error("payment.balance_not_supported");
    const time = Date.now().toString();
    const values = { appId: this.config.appId, time };
    const url = new URL(this.config.balanceUrl);
    url.search = new URLSearchParams({
      ...values,
      sign: sign(values, this.credentials.secret),
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return readJson<unknown>(response);
  }
}
