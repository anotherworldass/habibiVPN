export type PaymentProviderConfig = {
  appId: string;
  createOrderUrl: string;
  queryOrderUrl: string;
  balanceUrl?: string;
  callbackIp?: string;
};

export type PaymentCredentials = {
  secret: string;
};

export type CreatePaymentInput = {
  merchantOrderNo: string;
  amountCents: number;
  channelCode: string;
  notifyUrl: string;
  jumpUrl?: string;
  payerName?: string;
};

export type CreatePaymentResult = {
  providerOrderNo: string;
  paymentUrl: string;
};

export type PaymentState = "paid" | "pending" | "failed";

export type QueryPaymentResult = {
  providerOrderNo?: string;
  state: PaymentState;
  amountCents?: number;
  rawStatus?: string;
};

export type PaymentCallback = {
  merchantOrderNo: string;
  providerOrderNo: string;
  state: PaymentState;
  amountCents: number;
  paidAmountCents?: number;
};

export interface PaymentAdapter {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment(merchantOrderNo: string): Promise<QueryPaymentResult>;
  verifyCallback(payload: Record<string, string>): PaymentCallback;
  queryBalance?(): Promise<unknown>;
}
