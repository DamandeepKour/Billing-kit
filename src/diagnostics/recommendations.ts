import type { BillingProvider } from "../types/config";

/** Always-safe, provider-specific operational guidance (no secrets). */
export function providerRecommendations(
  provider: BillingProvider,
): string[] {
  if (provider === "razorpay") {
    return [
      "Serve Razorpay webhooks over HTTPS only.",
      "Require TLS 1.2 or higher on your webhook endpoint.",
      "Verify X-Razorpay-Signature against the raw request body (never re-serialized JSON).",
      "Configure webhookSecret, and keep previous secrets in webhookSecrets during rotation so retries still verify.",
      "Consider allowlisting Razorpay webhook source IPs at your edge/firewall when your network policy requires it.",
      "Return 2xx quickly after durable handling; continuous failures for ~24h can disable the webhook in the Dashboard.",
      "See TROUBLESHOOTING.md for raw-body and secret-rotation failures.",
    ];
  }

  return [
    "Use a Stripe secret key (sk_…) or restricted key (rk_…) with the minimum required permissions.",
    "Configure the endpoint webhook signing secret (whsec_…) as webhookSecret; keep previous secrets in webhookSecrets during rotation.",
    "Verify Stripe-Signature against the raw request body via billing-kit (do not parse JSON first).",
    "Keep test and live webhook secrets separate; never reuse live secrets in non-production.",
    "Prefer idempotent handlers and event-id dedupe (processWebhook) so Stripe retries are safe.",
    "Use the Stripe Dashboard / Workbench to confirm endpoint status and recent delivery attempts when diagnosing failures.",
  ];
}

export function conditionalRecommendations(input: {
  provider: BillingProvider;
  webhookConfigured: boolean;
  usingInMemoryWebhookStore: boolean;
  taxEnabledWithoutType: boolean;
  stripeMode?: "test" | "live" | "unknown";
}): string[] {
  const extra: string[] = [];

  if (!input.webhookConfigured) {
    extra.push(
      input.provider === "razorpay"
        ? "Set webhookSecret to the secret from Razorpay Dashboard → Webhooks before going live."
        : "Set webhookSecret to the Stripe endpoint signing secret (whsec_…) before going live.",
    );
  }

  if (input.usingInMemoryWebhookStore) {
    extra.push(
      "Replace the in-memory webhookEventRepository with a durable store (Redis/Postgres) for multi-instance duplicate protection.",
    );
  }

  if (input.taxEnabledWithoutType) {
    extra.push(
      'Set tax.taxType ("gst" | "vat" | "sales_tax" | "none") when tax.enabled is true so invoice tax behavior is explicit.',
    );
  }

  if (input.provider === "stripe" && input.stripeMode === "live") {
    extra.push(
      "Live Stripe key detected — confirm webhook endpoints and webhookSecret are the live endpoint values.",
    );
  }

  return extra;
}
