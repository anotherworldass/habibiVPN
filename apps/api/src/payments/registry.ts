import type { PaymentProvider } from "@prisma/client";
import { z } from "zod";
import { AixiNewbankAdapter } from "./aixi-newbank.js";
import { decryptCredentials } from "./credentials.js";
import type { PaymentAdapter, PaymentProviderConfig } from "./types.js";

const aixiConfigSchema = z.object({
  appId: z.string().min(1),
  createOrderUrl: z.string().url(),
  queryOrderUrl: z.string().url(),
  balanceUrl: z.string().url().optional(),
  callbackIp: z.string().optional(),
});

export const supportedPaymentAdapters = [
  {
    value: "aixi_newbank",
    label: "艾希 / Newbank",
  },
] as const;

export function validatePaymentProviderConfig(adapter: string, config: unknown) {
  if (adapter === "aixi_newbank") return aixiConfigSchema.parse(config);
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
  throw Object.assign(new Error("payment.adapter_unsupported"), { statusCode: 500 });
}
