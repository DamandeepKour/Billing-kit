import type {
  BillingKitConfig,
  BillingProvider,
  CompanyDetails,
  TaxConfig,
} from "../types/config";
import type { RetryPolicyConfig } from "../types/retry";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  normalizeCurrency,
  type SupportedCurrency,
} from "./currency";
import { InvalidConfigError } from "./errors";

const BILLING_PROVIDERS = ["stripe", "razorpay"] as const satisfies readonly BillingProvider[];
const TAX_TYPES = ["gst", "vat", "sales_tax", "none"] as const;
const STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)/;

export type ValidatedBillingKitConfig = BillingKitConfig & {
  currency: SupportedCurrency;
};

export function assertNonEmptyString(
  value: unknown,
  param: string,
  message?: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConfigError(
      message ?? `${param} is required and must be a non-empty string`,
      { param },
    );
  }
}

export function validateProvider(provider: unknown): BillingProvider {
  if (
    typeof provider !== "string" ||
    !(BILLING_PROVIDERS as readonly string[]).includes(provider)
  ) {
    throw new InvalidConfigError(
      `provider must be one of: ${BILLING_PROVIDERS.join(", ")}`,
      { param: "provider" },
    );
  }
  return provider as BillingProvider;
}

export function validateStripeSecretKey(secretKey: unknown): string {
  assertNonEmptyString(secretKey, "secretKey", "secretKey is required for Stripe");
  if (!STRIPE_SECRET_KEY_PATTERN.test(secretKey.trim())) {
    throw new InvalidConfigError(
      'secretKey must be a Stripe secret or restricted key (sk_test_…, sk_live_…, rk_test_…, or rk_live_…)',
      { param: "secretKey" },
    );
  }
  return secretKey.trim();
}

export function validateRazorpayKeyId(keyId: unknown): string {
  assertNonEmptyString(
    keyId,
    "keyId",
    "keyId is required for Razorpay",
  );
  if (!keyId.trim().startsWith("rzp_")) {
    throw new InvalidConfigError(
      'keyId must be a Razorpay key id starting with "rzp_"',
      { param: "keyId" },
    );
  }
  return keyId.trim();
}

export function validateRazorpaySecretKey(secretKey: unknown): string {
  assertNonEmptyString(
    secretKey,
    "secretKey",
    "secretKey is required for Razorpay",
  );
  return secretKey.trim();
}

export function validateWebhookSecret(
  webhookSecret: unknown,
  options: { required?: boolean; provider?: BillingProvider } = {},
): string | undefined {
  if (webhookSecret === undefined || webhookSecret === null) {
    if (options.required) {
      throw new InvalidConfigError(
        `webhookSecret is required${options.provider ? ` for ${options.provider}` : ""}`,
        { param: "webhookSecret" },
      );
    }
    return undefined;
  }
  assertNonEmptyString(
    webhookSecret,
    "webhookSecret",
    "webhookSecret must be a non-empty string when provided",
  );
  return webhookSecret.trim();
}

export function validateCurrencyConfig(
  currency: unknown,
): SupportedCurrency {
  if (currency === undefined || currency === null) {
    return "inr";
  }
  if (typeof currency !== "string" || currency.trim().length === 0) {
    throw new InvalidConfigError(
      `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
      { param: "currency" },
    );
  }
  const normalized = normalizeCurrency(currency);
  if (!isSupportedCurrency(normalized)) {
    throw new InvalidConfigError(
      `Unsupported currency "${currency}". Supported currencies: ${SUPPORTED_CURRENCIES.join(", ")}`,
      { param: "currency" },
    );
  }
  return normalized;
}

export function validateTaxConfig(tax: TaxConfig): TaxConfig {
  if (typeof tax.enabled !== "boolean") {
    throw new InvalidConfigError("tax.enabled must be a boolean", {
      param: "tax.enabled",
    });
  }

  if (tax.autoTax !== undefined && typeof tax.autoTax !== "boolean") {
    throw new InvalidConfigError("tax.autoTax must be a boolean", {
      param: "tax.autoTax",
    });
  }

  if (tax.defaultRate !== undefined) {
    if (
      typeof tax.defaultRate !== "number" ||
      !Number.isFinite(tax.defaultRate) ||
      tax.defaultRate < 0
    ) {
      throw new InvalidConfigError(
        "tax.defaultRate must be a non-negative finite number",
        { param: "tax.defaultRate" },
      );
    }
  }

  if (tax.taxType !== undefined) {
    if (!(TAX_TYPES as readonly string[]).includes(tax.taxType)) {
      throw new InvalidConfigError(
        `tax.taxType must be one of: ${TAX_TYPES.join(", ")}`,
        { param: "tax.taxType" },
      );
    }
  }

  if (tax.sellerState !== undefined) {
    assertNonEmptyString(
      tax.sellerState,
      "tax.sellerState",
      "tax.sellerState must be a non-empty string when provided",
    );
  }

  if (tax.sellerCountry !== undefined) {
    assertNonEmptyString(
      tax.sellerCountry,
      "tax.sellerCountry",
      "tax.sellerCountry must be a non-empty string when provided",
    );
  }

  if (tax.enabled && tax.taxType === "gst" && !tax.sellerState?.trim()) {
    throw new InvalidConfigError(
      'tax.sellerState is required when tax is enabled with taxType "gst"',
      { param: "tax.sellerState" },
    );
  }

  return tax;
}

export function validateCompanyConfig(company: CompanyDetails): CompanyDetails {
  assertNonEmptyString(company.name, "company.name");
  assertNonEmptyString(company.address, "company.address");
  return company;
}

export function validateRetryConfig(retry: RetryPolicyConfig): RetryPolicyConfig {
  if (retry.maxRetries !== undefined) {
    if (
      typeof retry.maxRetries !== "number" ||
      !Number.isInteger(retry.maxRetries) ||
      retry.maxRetries < 0
    ) {
      throw new InvalidConfigError(
        "retry.maxRetries must be a non-negative integer",
        { param: "retry.maxRetries" },
      );
    }
  }

  if (retry.gracePeriodMs !== undefined) {
    if (
      typeof retry.gracePeriodMs !== "number" ||
      !Number.isFinite(retry.gracePeriodMs) ||
      retry.gracePeriodMs < 0
    ) {
      throw new InvalidConfigError(
        "retry.gracePeriodMs must be a non-negative finite number",
        { param: "retry.gracePeriodMs" },
      );
    }
  }

  if (retry.retryIntervalsMs !== undefined) {
    if (
      !Array.isArray(retry.retryIntervalsMs) ||
      retry.retryIntervalsMs.some(
        (ms) => typeof ms !== "number" || !Number.isFinite(ms) || ms < 0,
      )
    ) {
      throw new InvalidConfigError(
        "retry.retryIntervalsMs must be an array of non-negative finite numbers",
        { param: "retry.retryIntervalsMs" },
      );
    }
  }

  return retry;
}

export function validateStripeConfig(
  config: Pick<BillingKitConfig, "secretKey" | "webhookSecret">,
): void {
  validateStripeSecretKey(config.secretKey);
  validateWebhookSecret(config.webhookSecret, { provider: "stripe" });
}

export function validateRazorpayConfig(
  config: Pick<BillingKitConfig, "keyId" | "secretKey" | "webhookSecret">,
): void {
  validateRazorpayKeyId(config.keyId);
  validateRazorpaySecretKey(config.secretKey);
  validateWebhookSecret(config.webhookSecret, { provider: "razorpay" });
}

/**
 * Validates BillingKit startup configuration and returns a normalized config
 * (trimmed credentials, default currency). Throws InvalidConfigError on failure.
 */
export function validateBillingKitConfig(
  config: BillingKitConfig,
): ValidatedBillingKitConfig {
  if (config == null || typeof config !== "object") {
    throw new InvalidConfigError("BillingKit config is required", {
      param: "config",
    });
  }

  const provider = validateProvider(config.provider);

  if (provider === "stripe") {
    validateStripeConfig(config);
  } else {
    validateRazorpayConfig(config);
  }

  const currency = validateCurrencyConfig(config.currency);

  if (config.tax !== undefined) {
    validateTaxConfig(config.tax);
  }

  if (config.company !== undefined) {
    validateCompanyConfig(config.company);
  }

  if (config.retry !== undefined) {
    validateRetryConfig(config.retry);
  }

  return {
    ...config,
    provider,
    secretKey: config.secretKey.trim(),
    keyId: config.keyId?.trim(),
    webhookSecret: config.webhookSecret?.trim(),
    currency,
  };
}
