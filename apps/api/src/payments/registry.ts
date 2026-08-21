import type { PaymentProvider } from "@prisma/client";
import { z } from "zod";
import { AcceptoEpayAdapter } from "./accepto-epay.js";
import { AixiNewbankAdapter } from "./aixi-newbank.js";
import { decryptCredentials } from "./credentials.js";
import type {
  AcceptoEpayConfig,
  PaymentAdapter,
  PaymentProviderConfig,
} from "./types.js";

const aixiConfigSchema = z.object({
  appId: z.string().min(1),
  createOrderUrl: z.string().url(),
  queryOrderUrl: z.string().url(),
  balanceUrl: z.string().url().optional(),
  callbackIp: z.string().optional(),
});

const acceptoConfigSchema = z.object({
  pid: z.string().min(1),
  submitUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
});

export const supportedPaymentAdapters = [
  {
    value: "aixi_newbank",
    label: "艾希 / Newbank",
  },
  {
    value: "accepto_epay",
    label: "Accepto / 彩虹易支付",
  },
] as const;

export function validatePaymentProviderConfig(adapter: string, config: unknown) {
  if (adapter === "aixi_newbank") return aixiConfigSchema.parse(config);
  if (adapter === "accepto_epay") return acceptoConfigSchema.parse(config);
  throw Object.assign(new Error("payment.adapter_unsupported"), { statusCode: 400 });
}

export function createPaymentAdapter(provider: PaymentProvider): PaymentAdapter {
  const credentials = decryptCredentials(provider.credentialsEncrypted);
  if (provider.adapter === "aixi_newbank") {
    const config = validatePaymentProviderConfig(
      provider.adapter,
      provider.config,
    ) as PaymentProviderConfig;
    return new AixiNewbankAdapter(config, credentials);
  }
  if (provider.adapter === "accepto_epay") {
    const config = validatePaymentProviderConfig(
      provider.adapter,
      provider.config,
    ) as AcceptoEpayConfig;
    return new AcceptoEpayAdapter(config, credentials);
  }
  throw Object.assign(new Error("payment.adapter_unsupported"), { statusCode: 500 });
}
