import type { BillingKitConfig } from "../../src/types/config";
import type { Address, GenerateInvoiceInput } from "../../src/types/invoice";
import { InvoiceService } from "../../src/invoice";
import { InMemoryInvoiceRepository } from "../../src/repositories";

export const indiaAddress: Address = {
  line1: "123 Street",
  city: "Mumbai",
  state: "MH",
  postalCode: "400001",
  country: "IN",
};

export const delhiAddress: Address = {
  line1: "CP",
  city: "New Delhi",
  state: "DL",
  postalCode: "110001",
  country: "IN",
};

export const usAddress: Address = {
  line1: "1 Market St",
  city: "San Francisco",
  state: "CA",
  postalCode: "94105",
  country: "US",
};

export const euAddress: Address = {
  line1: "1 Rue",
  city: "Paris",
  state: "IDF",
  postalCode: "75001",
  country: "FR",
};

export function gstConfig(
  overrides: Partial<BillingKitConfig> = {},
): BillingKitConfig {
  const { tax: taxOverrides, ...rest } = overrides;
  return {
    provider: "stripe",
    secretKey: "sk_test_x",
    currency: "inr",
    ...rest,
    tax: {
      enabled: true,
      defaultRate: 18,
      sellerState: "MH",
      sellerCountry: "IN",
      ...taxOverrides,
    },
  };
}

export function createInvoiceService(
  config: BillingKitConfig = gstConfig(),
): InvoiceService {
  return new InvoiceService(config, new InMemoryInvoiceRepository());
}

export function baseInvoiceInput(
  overrides: Partial<GenerateInvoiceInput> = {},
): GenerateInvoiceInput {
  return {
    customer: { name: "John Doe", email: "john@example.com" },
    billingAddress: indiaAddress,
    lineItems: [{ description: "Pro Plan", quantity: 1, unitAmount: 99900 }],
    ...overrides,
  };
}
