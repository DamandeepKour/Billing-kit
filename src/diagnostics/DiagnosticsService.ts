import type { BillingKitConfig } from "../types/config";
import type {
  DiagnosticCheck,
  DiagnosticCheckStatus,
  DiagnosticsReport,
  DiagnosticsStatus,
  HealthCheckResult,
  ProviderConfigVerification,
} from "../types/diagnostics";
import {
  isSupportedCurrency,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
} from "../utils/currency";
import { maskSensitiveFields } from "../utils/mask";
import {
  conditionalRecommendations,
  providerRecommendations,
} from "./recommendations";

const STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)/;
const TAX_TYPES = new Set(["gst", "vat", "sales_tax", "none"]);

type RepositorySpec = {
  configKey: keyof BillingKitConfig;
  id: string;
  name: string;
  methods: string[];
};

const REPOSITORY_SPECS: RepositorySpec[] = [
  {
    configKey: "invoiceRepository",
    id: "repository.invoice",
    name: "Invoice repository",
    methods: ["save", "findById"],
  },
  {
    configKey: "transactionRepository",
    id: "repository.transaction",
    name: "Transaction repository",
    methods: ["save", "findById", "list"],
  },
  {
    configKey: "webhookEventRepository",
    id: "repository.webhookEvent",
    name: "Webhook event repository",
    methods: ["claim", "save", "find", "list"],
  },
  {
    configKey: "auditLogRepository",
    id: "repository.auditLog",
    name: "Audit log repository",
    methods: ["save", "findById", "list"],
  },
  {
    configKey: "idempotencyRequestRepository",
    id: "repository.idempotency",
    name: "Idempotency repository",
    methods: ["claim", "save", "findByKey", "list"],
  },
  {
    configKey: "retryAttemptRepository",
    id: "repository.retryAttempt",
    name: "Retry attempt repository",
    methods: ["save", "findById", "findByReference", "list"],
  },
  {
    configKey: "customerProfileRepository",
    id: "repository.customerProfile",
    name: "Customer profile repository",
    methods: ["save", "findById", "findByEmail", "list", "delete"],
  },
  {
    configKey: "usageEventRepository",
    id: "repository.usageEvent",
    name: "Usage event repository",
    methods: ["save", "findById", "list"],
  },
  {
    configKey: "entitlementRepository",
    id: "repository.entitlement",
    name: "Entitlement repository",
    methods: [
      "savePlanFeatures",
      "findPlanFeatures",
      "saveEntitlement",
      "findBySubscription",
      "listByCustomer",
      "listEntitlements",
    ],
  },
  {
    configKey: "transferRequestRepository",
    id: "repository.transferRequest",
    name: "Transfer request repository",
    methods: ["claim", "save", "findByKey", "list"],
  },
];

function check(
  partial: Omit<DiagnosticCheck, "status"> & { status: DiagnosticCheckStatus },
): DiagnosticCheck {
  const details = partial.details
    ? (maskSensitiveFields(partial.details) as Record<string, unknown>)
    : undefined;
  return details ? { ...partial, details } : { ...partial };
}

function aggregateStatus(checks: DiagnosticCheck[]): DiagnosticsStatus {
  if (checks.some((item) => item.status === "fail")) return "unhealthy";
  if (checks.some((item) => item.status === "warn")) return "degraded";
  return "healthy";
}

function collectMessages(
  checks: DiagnosticCheck[],
  status: DiagnosticCheckStatus,
): string[] {
  return checks
    .filter((item) => item.status === status)
    .map((item) => item.message);
}

function uniqueChecks(checks: DiagnosticCheck[]): DiagnosticCheck[] {
  const byId = new Map<string, DiagnosticCheck>();
  for (const item of checks) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function hintSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}

function stripeMode(secretKey: string): "test" | "live" | "unknown" {
  if (/_(live)_/.test(secretKey)) return "live";
  if (/_(test)_/.test(secretKey)) return "test";
  return "unknown";
}

function hasMethods(
  value: unknown,
  methods: string[],
): { ok: boolean; missing: string[] } {
  if (value === null || typeof value !== "object") {
    return { ok: false, missing: methods };
  }
  const record = value as Record<string, unknown>;
  const missing = methods.filter(
    (method) => typeof record[method] !== "function",
  );
  return { ok: missing.length === 0, missing };
}

export class DiagnosticsService {
  constructor(private readonly config: BillingKitConfig) {}

  /** Lightweight readiness: credentials, currency, webhook presence, repositories. */
  healthCheck(): HealthCheckResult {
    const checks = uniqueChecks([
      ...this.credentialChecks(),
      ...this.currencyChecks(),
      ...this.webhookPresenceChecks(),
      ...this.repositoryChecks(),
    ]);
    return this.toHealth(checks);
  }

  /** Provider + tax + currency + webhook configuration shape. */
  verifyProviderConfig(): ProviderConfigVerification {
    const checks = uniqueChecks([
      ...this.credentialChecks(),
      ...this.providerShapeChecks(),
      ...this.currencyChecks(),
      ...this.taxChecks(),
      ...this.webhookPresenceChecks(),
      ...this.webhookShapeChecks(),
    ]);
    return this.toConfigVerification(checks);
  }

  /** Full diagnostics report with provider recommendations. */
  runDiagnostics(): DiagnosticsReport {
    const health = this.healthCheck();
    const config = this.verifyProviderConfig();
    const checks = uniqueChecks([...health.checks, ...config.checks]);
    const status = aggregateStatus(checks);
    const checkedAt = new Date().toISOString();
    const recommendations = this.buildRecommendations();

    return {
      status,
      provider: this.config.provider,
      ok: status === "healthy",
      health,
      config,
      checks,
      errors: collectMessages(checks, "fail"),
      warnings: collectMessages(checks, "warn"),
      recommendations,
      checkedAt,
    };
  }

  private toHealth(checks: DiagnosticCheck[]): HealthCheckResult {
    const status = aggregateStatus(checks);
    return {
      status,
      provider: this.config.provider,
      ok: status === "healthy",
      checks,
      errors: collectMessages(checks, "fail"),
      warnings: collectMessages(checks, "warn"),
      recommendations: this.buildRecommendations(),
      checkedAt: new Date().toISOString(),
    };
  }

  private toConfigVerification(
    checks: DiagnosticCheck[],
  ): ProviderConfigVerification {
    const status = aggregateStatus(checks);
    return {
      status,
      provider: this.config.provider,
      valid: status !== "unhealthy",
      checks,
      errors: collectMessages(checks, "fail"),
      warnings: collectMessages(checks, "warn"),
      recommendations: this.buildRecommendations(),
      checkedAt: new Date().toISOString(),
    };
  }

  private buildRecommendations(): string[] {
    const webhookConfigured = Boolean(this.config.webhookSecret?.trim());
    const usingInMemoryWebhookStore = !this.config.webhookEventRepository;
    const taxEnabledWithoutType = Boolean(
      this.config.tax?.enabled && !this.config.tax.taxType,
    );
    const mode =
      this.config.provider === "stripe"
        ? stripeMode(this.config.secretKey)
        : undefined;

    return [
      ...providerRecommendations(this.config.provider),
      ...conditionalRecommendations({
        provider: this.config.provider,
        webhookConfigured,
        usingInMemoryWebhookStore,
        taxEnabledWithoutType,
        stripeMode: mode,
      }),
    ].filter((message, index, all) => all.indexOf(message) === index);
  }

  private credentialChecks(): DiagnosticCheck[] {
    const provider = this.config.provider;
    const checks: DiagnosticCheck[] = [];

    if (provider === "stripe") {
      const key = this.config.secretKey?.trim() ?? "";
      const shapeOk = STRIPE_SECRET_KEY_PATTERN.test(key);
      checks.push(
        check({
          id: "credentials.stripe.secretKey",
          name: "Stripe secret key",
          category: "credentials",
          status: key && shapeOk ? "pass" : "fail",
          message: !key
            ? "secretKey is missing"
            : shapeOk
              ? "Stripe secret key is present and has a valid prefix"
              : "secretKey must be a Stripe secret or restricted key (sk_/rk_ + test/live)",
          details: {
            configured: Boolean(key),
            mode: key ? stripeMode(key) : undefined,
            hint: hintSecret(key),
          },
        }),
      );
    } else {
      const keyId = this.config.keyId?.trim() ?? "";
      const secretKey = this.config.secretKey?.trim() ?? "";
      checks.push(
        check({
          id: "credentials.razorpay.keyId",
          name: "Razorpay key id",
          category: "credentials",
          status: keyId.startsWith("rzp_") ? "pass" : "fail",
          message: keyId.startsWith("rzp_")
            ? "Razorpay keyId is present"
            : 'keyId is required and must start with "rzp_"',
          details: {
            configured: Boolean(keyId),
            hint: hintSecret(keyId),
          },
        }),
        check({
          id: "credentials.razorpay.secretKey",
          name: "Razorpay key secret",
          category: "credentials",
          status: secretKey ? "pass" : "fail",
          message: secretKey
            ? "Razorpay secretKey is present"
            : "secretKey is required for Razorpay",
          details: {
            configured: Boolean(secretKey),
            hint: hintSecret(secretKey),
          },
        }),
      );
    }

    return checks;
  }

  private providerShapeChecks(): DiagnosticCheck[] {
    const provider = this.config.provider;
    const checks: DiagnosticCheck[] = [
      check({
        id: "provider.name",
        name: "Provider",
        category: "provider",
        status:
          provider === "stripe" || provider === "razorpay" ? "pass" : "fail",
        message:
          provider === "stripe" || provider === "razorpay"
            ? `Provider is ${provider}`
            : "provider must be stripe or razorpay",
        details: { provider },
      }),
    ];

    if (provider === "stripe") {
      const mode = stripeMode(this.config.secretKey);
      checks.push(
        check({
          id: "provider.stripe.mode",
          name: "Stripe mode",
          category: "provider",
          status: mode === "unknown" ? "warn" : "pass",
          message:
            mode === "unknown"
              ? "Could not determine Stripe test/live mode from secretKey prefix"
              : `Stripe credentials appear to be ${mode} mode`,
          details: { mode },
        }),
      );
    }

    if (provider === "razorpay") {
      const keyId = this.config.keyId ?? "";
      const mode = keyId.includes("live")
        ? "live"
        : keyId.includes("test")
          ? "test"
          : "unknown";
      checks.push(
        check({
          id: "provider.razorpay.mode",
          name: "Razorpay mode",
          category: "provider",
          status: "pass",
          message:
            mode === "unknown"
              ? "Razorpay keyId is configured"
              : `Razorpay credentials appear to be ${mode} mode`,
          details: { mode },
        }),
      );
    }

    return checks;
  }

  private currencyChecks(): DiagnosticCheck[] {
    const raw = this.config.currency;
    if (raw === undefined || raw === null || raw === "") {
      return [
        check({
          id: "currency.default",
          name: "Currency",
          category: "currency",
          status: "pass",
          message: "Currency defaults to inr",
          details: { currency: "inr" },
        }),
      ];
    }

    const normalized = normalizeCurrency(String(raw));
    const ok = isSupportedCurrency(normalized);
    return [
      check({
        id: "currency.supported",
        name: "Currency",
        category: "currency",
        status: ok ? "pass" : "fail",
        message: ok
          ? `Currency ${normalized} is supported`
          : `Unsupported currency "${raw}". Supported: ${SUPPORTED_CURRENCIES.join(", ")}`,
        details: ok
          ? { currency: normalized }
          : { currency: String(raw), supported: [...SUPPORTED_CURRENCIES] },
      }),
    ];
  }

  private taxChecks(): DiagnosticCheck[] {
    const tax = this.config.tax;
    if (!tax) {
      return [
        check({
          id: "tax.optional",
          name: "Tax config",
          category: "tax",
          status: "pass",
          message: "No tax config provided (optional)",
        }),
      ];
    }

    const checks: DiagnosticCheck[] = [];

    if (typeof tax.enabled !== "boolean") {
      checks.push(
        check({
          id: "tax.enabled",
          name: "Tax enabled flag",
          category: "tax",
          status: "fail",
          message: "tax.enabled must be a boolean",
        }),
      );
      return checks;
    }

    checks.push(
      check({
        id: "tax.enabled",
        name: "Tax enabled flag",
        category: "tax",
        status: "pass",
        message: tax.enabled ? "Tax is enabled" : "Tax is disabled",
        details: { enabled: tax.enabled },
      }),
    );

    if (tax.taxType !== undefined) {
      const ok = TAX_TYPES.has(tax.taxType);
      checks.push(
        check({
          id: "tax.taxType",
          name: "Tax type",
          category: "tax",
          status: ok ? "pass" : "fail",
          message: ok
            ? `tax.taxType is ${tax.taxType}`
            : "tax.taxType must be one of: gst, vat, sales_tax, none",
          details: { taxType: tax.taxType },
        }),
      );
    } else if (tax.enabled) {
      checks.push(
        check({
          id: "tax.taxType",
          name: "Tax type",
          category: "tax",
          status: "warn",
          message:
            "tax.enabled is true but tax.taxType is not set; set an explicit taxType",
        }),
      );
    }

    if (tax.defaultRate !== undefined) {
      const ok =
        typeof tax.defaultRate === "number" &&
        Number.isFinite(tax.defaultRate) &&
        tax.defaultRate >= 0;
      checks.push(
        check({
          id: "tax.defaultRate",
          name: "Tax default rate",
          category: "tax",
          status: ok ? "pass" : "fail",
          message: ok
            ? "tax.defaultRate is valid"
            : "tax.defaultRate must be a non-negative finite number",
          details: ok ? { defaultRate: tax.defaultRate } : undefined,
        }),
      );
    }

    if (tax.enabled && tax.taxType === "gst") {
      checks.push(
        check({
          id: "tax.gst.sellerState",
          name: "GST seller state",
          category: "tax",
          status: tax.sellerState?.trim() ? "pass" : "fail",
          message: tax.sellerState?.trim()
            ? "tax.sellerState is set for GST"
            : 'tax.sellerState is required when taxType is "gst"',
          details: { sellerStateConfigured: Boolean(tax.sellerState?.trim()) },
        }),
      );
    }

    return checks;
  }

  private webhookPresenceChecks(): DiagnosticCheck[] {
    const configured = Boolean(this.config.webhookSecret?.trim());
    return [
      check({
        id: "webhook.secret",
        name: "Webhook secret",
        category: "webhook",
        status: configured ? "pass" : "warn",
        message: configured
          ? "webhookSecret is configured"
          : "webhookSecret is not set; webhook signature verification will fail until configured",
        details: {
          configured,
          previousSecrets: this.config.webhookSecrets?.length ?? 0,
        },
      }),
    ];
  }

  private webhookShapeChecks(): DiagnosticCheck[] {
    const previous = this.config.webhookSecrets;

    if (previous !== undefined) {
      const ok =
        Array.isArray(previous) &&
        previous.every(
          (secret) => typeof secret === "string" && secret.trim().length > 0,
        );
      return [
        check({
          id: "webhook.secrets.rotation",
          name: "Webhook secret rotation list",
          category: "webhook",
          status: ok ? "pass" : "fail",
          message: ok
            ? previous.length > 0
              ? `${previous.length} previous webhook secret(s) configured for rotation`
              : "webhookSecrets is empty (ok)"
            : "webhookSecrets must be an array of non-empty strings",
          details: {
            count: Array.isArray(previous) ? previous.length : 0,
          },
        }),
      ];
    }

    return [
      check({
        id: "webhook.secrets.rotation",
        name: "Webhook secret rotation list",
        category: "webhook",
        status: "pass",
        message:
          "No webhookSecrets list (ok unless you recently rotated the secret)",
      }),
    ];
  }

  private repositoryChecks(): DiagnosticCheck[] {
    return REPOSITORY_SPECS.map((spec) => {
      const configured = this.config[spec.configKey];
      if (configured === undefined || configured === null) {
        const isWebhook = spec.configKey === "webhookEventRepository";
        return check({
          id: spec.id,
          name: spec.name,
          category: "repository",
          status: "pass",
          message: isWebhook
            ? "webhookEventRepository using in-memory default (ok for single-process; use durable store for multi-instance)"
            : `${spec.name} using in-memory default`,
          details: { custom: false },
        });
      }

      const shape = hasMethods(configured, spec.methods);
      return check({
        id: spec.id,
        name: spec.name,
        category: "repository",
        status: shape.ok ? "pass" : "fail",
        message: shape.ok
          ? `Custom ${String(spec.configKey)} exposes required methods`
          : `Custom ${String(spec.configKey)} is missing methods: ${shape.missing.join(", ")}`,
        details: {
          custom: true,
          requiredMethods: spec.methods,
          missingMethods: shape.missing,
        },
      });
    });
  }
}
