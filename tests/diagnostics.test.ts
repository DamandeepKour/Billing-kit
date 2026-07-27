import { BillingKit } from "../src/core/BillingKit";
import {
  DiagnosticsService,
  providerRecommendations,
} from "../src/diagnostics";
import type { InvoiceRepository } from "../src/interfaces/InvoiceRepository";
import type { Invoice } from "../src/types/invoice";
import { InMemoryWebhookEventRepository } from "../src/repositories";

const STRIPE_SECRET = "sk_test_diagnostics_secret_key_123456";
const RAZORPAY_SECRET = "rzp_test_diagnostics_key_secret";
const WEBHOOK_SECRET = "whsec_diagnostics_test_secret";

function stripeBilling(overrides: Record<string, unknown> = {}): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: STRIPE_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    currency: "usd",
    ...overrides,
  });
}

function razorpayBilling(overrides: Record<string, unknown> = {}): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test_diagnostics",
    secretKey: RAZORPAY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    currency: "inr",
    ...overrides,
  });
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

describe("diagnostics / healthCheck", () => {
  it("returns healthy for a complete Stripe config", () => {
    const health = stripeBilling({
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).healthCheck();

    expect(health.provider).toBe("stripe");
    expect(health.status).toBe("healthy");
    expect(health.ok).toBe(true);
    expect(health.errors).toEqual([]);
    expect(health.checks.some((c) => c.id === "credentials.stripe.secretKey")).toBe(
      true,
    );
    expect(health.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns healthy for a complete Razorpay config", () => {
    const health = razorpayBilling({
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).healthCheck();

    expect(health.provider).toBe("razorpay");
    expect(health.ok).toBe(true);
    expect(
      health.checks.find((c) => c.id === "credentials.razorpay.keyId")?.status,
    ).toBe("pass");
  });

  it("warns when webhookSecret is missing", () => {
    const health = stripeBilling({ webhookSecret: undefined }).healthCheck();

    expect(health.status).toBe("degraded");
    expect(health.ok).toBe(false);
    expect(health.warnings.some((w) => /webhookSecret/i.test(w))).toBe(true);
    expect(
      health.checks.find((c) => c.id === "webhook.secret")?.status,
    ).toBe("warn");
  });
});

describe("diagnostics / verifyProviderConfig", () => {
  it("validates Stripe provider shape, currency, tax, and webhook", () => {
    const result = stripeBilling({
      tax: { enabled: true, taxType: "sales_tax", defaultRate: 0.08 },
      webhookSecrets: ["whsec_previous"],
    }).verifyProviderConfig();

    expect(result.valid).toBe(true);
    expect(result.status).toBe("healthy");
    expect(result.checks.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        "credentials.stripe.secretKey",
        "provider.name",
        "provider.stripe.mode",
        "currency.supported",
        "tax.enabled",
        "tax.taxType",
        "webhook.secret",
        "webhook.secrets.rotation",
      ]),
    );
    expect(
      result.checks.find((c) => c.id === "provider.stripe.mode")?.details,
    ).toMatchObject({ mode: "test" });
  });

  it("validates Razorpay provider config", () => {
    const result = razorpayBilling({
      tax: {
        enabled: true,
        taxType: "gst",
        sellerState: "MH",
        defaultRate: 0.18,
      },
    }).verifyProviderConfig();

    expect(result.valid).toBe(true);
    expect(
      result.checks.find((c) => c.id === "tax.gst.sellerState")?.status,
    ).toBe("pass");
    expect(
      result.checks.find((c) => c.id === "provider.razorpay.mode")?.details,
    ).toMatchObject({ mode: "test" });
  });

  it("warns when tax is enabled without taxType", () => {
    const result = stripeBilling({
      tax: { enabled: true },
    }).verifyProviderConfig();

    expect(result.status).toBe("degraded");
    expect(result.valid).toBe(true);
    expect(
      result.checks.find((c) => c.id === "tax.taxType")?.status,
    ).toBe("warn");
  });
});

describe("diagnostics / repositories", () => {
  it("fails when a configured repository is missing required methods", () => {
    const brokenInvoiceRepo = {
      save: async (invoice: Invoice) => invoice,
    } as InvoiceRepository;

    const health = stripeBilling({
      invoiceRepository: brokenInvoiceRepo,
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).healthCheck();

    expect(health.status).toBe("unhealthy");
    expect(health.errors.some((e) => /findById/.test(e))).toBe(true);
    expect(
      health.checks.find((c) => c.id === "repository.invoice")?.status,
    ).toBe("fail");
  });

  it("passes when a custom webhook repository implements the contract", () => {
    const health = stripeBilling({
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).healthCheck();

    expect(
      health.checks.find((c) => c.id === "repository.webhookEvent"),
    ).toMatchObject({
      status: "pass",
      details: { custom: true },
    });
  });
});

describe("diagnostics / runDiagnostics", () => {
  it("returns a full report with Razorpay recommendations", () => {
    const report = razorpayBilling({
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).runDiagnostics();

    expect(report.ok).toBe(true);
    expect(report.health.ok).toBe(true);
    expect(report.config.valid).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);

    const joined = report.recommendations.join("\n");
    expect(joined).toMatch(/HTTPS/i);
    expect(joined).toMatch(/TLS 1\.2/i);
    expect(joined).toMatch(/signature/i);
    expect(joined).toMatch(/allowlist/i);
    expect(joined).toMatch(/raw request body/i);
  });

  it("returns Stripe credential and webhook recommendations", () => {
    const report = stripeBilling({
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).runDiagnostics();

    const joined = report.recommendations.join("\n");
    expect(joined).toMatch(/whsec_/i);
    expect(joined).toMatch(/restricted key|secret key/i);
    expect(joined).toMatch(/raw request body/i);
    expect(joined).toMatch(/test and live/i);
  });

  it("never leaks secrets in diagnostics output", () => {
    const report = razorpayBilling({
      secretKey: RAZORPAY_SECRET,
      webhookSecret: WEBHOOK_SECRET,
      webhookSecrets: ["whsec_old_secret_value_zzzz"],
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).runDiagnostics();

    const blob = serialize(report);
    expect(blob).not.toContain(RAZORPAY_SECRET);
    expect(blob).not.toContain(WEBHOOK_SECRET);
    expect(blob).not.toContain("whsec_old_secret_value_zzzz");
    expect(blob).not.toContain(STRIPE_SECRET);

    const credential = report.checks.find(
      (c) => c.id === "credentials.razorpay.secretKey",
    );
    expect(credential?.details?.hint).toEqual(expect.stringMatching(/\*+\w{4}$/));
    expect(String(credential?.details?.hint)).not.toContain(RAZORPAY_SECRET);
  });

  it("includes conditional guidance when webhook secret is missing", () => {
    const report = stripeBilling({
      webhookSecret: undefined,
      webhookEventRepository: new InMemoryWebhookEventRepository(),
    }).runDiagnostics();

    expect(report.status).toBe("degraded");
    expect(
      report.recommendations.some((r) => /webhookSecret|whsec_/i.test(r)),
    ).toBe(true);
  });
});

describe("diagnostics / helpers", () => {
  it("exposes provider recommendation helpers", () => {
    expect(providerRecommendations("razorpay").length).toBeGreaterThan(3);
    expect(providerRecommendations("stripe").length).toBeGreaterThan(3);
  });

  it("DiagnosticsService can be constructed independently", () => {
    const service = new DiagnosticsService({
      provider: "stripe",
      secretKey: STRIPE_SECRET,
      webhookSecret: WEBHOOK_SECRET,
      currency: "usd",
    });
    expect(service.healthCheck().ok).toBe(true);
  });
});
