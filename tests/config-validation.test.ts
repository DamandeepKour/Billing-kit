import { BillingKit } from "../src/core/BillingKit";
import type { BillingKitConfig } from "../src/types/config";
import { InvalidConfigError } from "../src/utils/errors";
import {
  validateBillingKitConfig,
  validateCurrencyConfig,
  validateProvider,
  validateRazorpayConfig,
  validateStripeConfig,
  validateTaxConfig,
} from "../src/utils/validate-config";

const validStripe = (): BillingKitConfig => ({
  provider: "stripe",
  secretKey: "sk_test_validation",
  currency: "inr",
});

const validRazorpay = (): BillingKitConfig => ({
  provider: "razorpay",
  keyId: "rzp_test_key",
  secretKey: "razorpay_secret",
  currency: "inr",
});

describe("config validation / helpers", () => {
  describe("validateProvider", () => {
    it("accepts stripe and razorpay", () => {
      expect(validateProvider("stripe")).toBe("stripe");
      expect(validateProvider("razorpay")).toBe("razorpay");
    });

    it("rejects unknown providers", () => {
      expect(() => validateProvider("paypal")).toThrow(InvalidConfigError);
      try {
        validateProvider("paypal");
      } catch (error) {
        expect(error).toMatchObject({
          name: "InvalidConfigError",
          param: "provider",
        });
      }
    });
  });

  describe("validateStripeConfig", () => {
    it("accepts sk_test / sk_live style keys", () => {
      expect(() =>
        validateStripeConfig({ secretKey: "sk_test_abc" }),
      ).not.toThrow();
      expect(() =>
        validateStripeConfig({ secretKey: "sk_live_abc" }),
      ).not.toThrow();
      expect(() =>
        validateStripeConfig({ secretKey: "rk_test_abc" }),
      ).not.toThrow();
    });

    it("rejects missing or malformed Stripe secret keys", () => {
      expect(() => validateStripeConfig({ secretKey: "" })).toThrow(
        InvalidConfigError,
      );
      expect(() => validateStripeConfig({ secretKey: "   " })).toThrow(
        InvalidConfigError,
      );
      expect(() => validateStripeConfig({ secretKey: "pk_test_x" })).toThrow(
        /Stripe secret or restricted key/,
      );
      expect(() => validateStripeConfig({ secretKey: "secret" })).toThrow(
        InvalidConfigError,
      );
    });

    it("rejects empty webhookSecret when provided", () => {
      expect(() =>
        validateStripeConfig({ secretKey: "sk_test_x", webhookSecret: "" }),
      ).toThrow(/webhookSecret/);
    });
  });

  describe("validateRazorpayConfig", () => {
    it("requires keyId and secretKey", () => {
      expect(() =>
        validateRazorpayConfig({ secretKey: "secret" }),
      ).toThrow(/keyId is required/);
      expect(() =>
        validateRazorpayConfig({ keyId: "rzp_test", secretKey: "" }),
      ).toThrow(/secretKey is required/);
    });

    it("rejects key ids that do not start with rzp_", () => {
      expect(() =>
        validateRazorpayConfig({ keyId: "bad_key", secretKey: "secret" }),
      ).toThrow(/rzp_/);
    });

    it("accepts valid Razorpay credentials", () => {
      expect(() =>
        validateRazorpayConfig({
          keyId: "rzp_test",
          secretKey: "secret",
          webhookSecret: "whsec_rzp",
        }),
      ).not.toThrow();
    });
  });

  describe("validateCurrencyConfig", () => {
    it("defaults to inr when omitted", () => {
      expect(validateCurrencyConfig(undefined)).toBe("inr");
    });

    it("normalizes supported currencies", () => {
      expect(validateCurrencyConfig("USD")).toBe("usd");
      expect(validateCurrencyConfig("eur")).toBe("eur");
    });

    it("rejects unsupported currencies", () => {
      expect(() => validateCurrencyConfig("jpy")).toThrow(InvalidConfigError);
      expect(() => validateCurrencyConfig("")).toThrow(InvalidConfigError);
    });
  });

  describe("validateTaxConfig", () => {
    it("accepts a valid GST tax config", () => {
      expect(() =>
        validateTaxConfig({
          enabled: true,
          taxType: "gst",
          defaultRate: 18,
          sellerState: "MH",
          sellerCountry: "IN",
        }),
      ).not.toThrow();
    });

    it("requires sellerState when GST tax is enabled", () => {
      expect(() =>
        validateTaxConfig({ enabled: true, taxType: "gst", defaultRate: 18 }),
      ).toThrow(/tax.sellerState/);
    });

    it("rejects negative defaultRate", () => {
      expect(() =>
        validateTaxConfig({ enabled: true, defaultRate: -1 }),
      ).toThrow(/tax.defaultRate/);
    });

    it("rejects invalid taxType", () => {
      expect(() =>
        validateTaxConfig({
          enabled: false,
          // @ts-expect-error intentional invalid tax type
          taxType: "hst",
        }),
      ).toThrow(/tax.taxType/);
    });
  });

  describe("validateBillingKitConfig", () => {
    it("returns normalized valid Stripe config", () => {
      const validated = validateBillingKitConfig({
        provider: "stripe",
        secretKey: "  sk_test_abc  ",
        currency: "USD",
      });

      expect(validated.secretKey).toBe("sk_test_abc");
      expect(validated.currency).toBe("usd");
    });

    it("returns normalized valid Razorpay config", () => {
      const validated = validateBillingKitConfig({
        provider: "razorpay",
        keyId: "  rzp_live_1  ",
        secretKey: "  secret  ",
      });

      expect(validated.keyId).toBe("rzp_live_1");
      expect(validated.secretKey).toBe("secret");
      expect(validated.currency).toBe("inr");
    });
  });
});

describe("config validation / BillingKit initialization", () => {
  it("initializes with valid Stripe config", () => {
    expect(() => new BillingKit(validStripe())).not.toThrow();
  });

  it("initializes with valid Razorpay config", () => {
    expect(() => new BillingKit(validRazorpay())).not.toThrow();
  });

  it("initializes with tax and company details", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          company: {
            name: "Acme",
            address: "1 Road",
            gstin: "27AAAAA0000A1Z5",
          },
          tax: {
            enabled: true,
            taxType: "gst",
            defaultRate: 18,
            sellerState: "MH",
          },
        }),
    ).not.toThrow();
  });

  it("fails fast when Stripe secretKey is missing", () => {
    expect(
      () =>
        new BillingKit({
          provider: "stripe",
          // @ts-expect-error testing missing secret
          secretKey: undefined,
        }),
    ).toThrow(InvalidConfigError);
  });

  it("fails fast when Stripe secretKey format is invalid", () => {
    expect(
      () =>
        new BillingKit({
          provider: "stripe",
          secretKey: "not-a-stripe-key",
        }),
    ).toThrow(/Stripe secret or restricted key/);
  });

  it("fails fast when Razorpay keyId is missing", () => {
    expect(
      () =>
        new BillingKit({
          provider: "razorpay",
          secretKey: "secret",
        }),
    ).toThrow(/keyId is required/);
  });

  it("fails fast for unsupported currency", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          currency: "jpy",
        }),
    ).toThrow(/Unsupported currency/);
  });

  it("fails fast for invalid GST tax config", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          tax: { enabled: true, taxType: "gst", defaultRate: 18 },
        }),
    ).toThrow(/tax.sellerState/);
  });

  it("fails fast for empty webhookSecret", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          webhookSecret: "   ",
        }),
    ).toThrow(/webhookSecret/);
  });

  it("fails fast for invalid retry config", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          retry: { maxRetries: -1 },
        }),
    ).toThrow(/retry.maxRetries/);
  });

  it("fails fast for incomplete company details", () => {
    expect(
      () =>
        new BillingKit({
          ...validStripe(),
          company: {
            name: "",
            address: "1 Road",
          },
        }),
    ).toThrow(/company.name/);
  });
});
