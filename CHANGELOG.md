# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Razorpay Route split payouts docs (vendor routing example, API table); transaction fields `routedAmount` / `platformFee`
- Customer billing profiles docs + payment/update reuse tests (`createCustomerProfile`, saved payment methods, invoice/payment defaults)
- Coupons & promotion codes docs + deactivate helpers; expanded discount tests (invoice/PDF, payment, subscription, validation)
- Failed payment recovery / dunning: `runRecoveryCycle()`, invoice sync on grace expiry, README dunning guide (retry hooks, max retries, grace period)
- Tax engine enhancements: region detection, sales-tax facade, invoice tax summaries, line-item tax rollups, customer tax ID on breakdowns, `BillingValidationError` for invalid amounts/rates
- Multi-currency hardening: `assertSmallestUnitAmount`, `assertLineItemCurrencies`, `convertAmount`, `getMinorUnitFactor`, `listSupportedCurrencies`; invoice/payment smallest-unit validation; customer profile currency checks
- Framework examples for Express, Next.js (App Router), and NestJS (module/service/controller) with payments, invoices, refunds, and raw-body webhooks
- Provider diagnostics: `healthCheck()`, `verifyProviderConfig()`, and `runDiagnostics()` with structured checks, warnings, and provider-specific recommendations (no secret leakage)
- Webhook troubleshooting guide (`TROUBLESHOOTING.md`) for raw-body verification and Razorpay secret-rotation retries
- `webhookSecrets` config: accept previous signing secrets during rotation (Razorpay + Stripe)
- Secure npm publishing via GitHub Actions OIDC trusted publishing with `publishConfig.provenance` (supply-chain attestations)
- Dispute handling for Razorpay and Stripe: fetch/list, accept/contest (Razorpay), evidence updates (Stripe), and normalized `dispute.*` webhook events
- Entitlement side effects on `dispute.lost` (revoke) and `dispute.won` (restore)
- Dispute testing fixtures (`createMockRazorpayDispute`, `createMockStripeDispute`)
- Stripe-style billing lifecycle simulation helpers in `billing-kit/testing` (`createTestClock`, renew/fail/upgrade/schedule fixtures)
- Lifecycle simulation tests for trials, renewals, payment failures, upgrades, and multi-phase schedules

## [1.0.0] - 2026-07-25

First stable release of **billing-kit** — framework-agnostic Node.js billing SDK for Stripe and Razorpay.

### Added

#### Core
- `BillingKit` facade for invoices, payments, refunds, subscriptions, tax, webhooks, and PDFs
- Startup config validation with clear `InvalidConfigError` messages (provider keys, currency, tax)
- Dual package entrypoints: `billing-kit` and `billing-kit/testing`
- Pluggable repositories (in-memory defaults) for invoices, transactions, webhooks, audits, idempotency, and more

#### Tax & invoices
- GST intra-state (CGST/SGST) and inter-state (IGST) calculations
- VAT, sales tax, `autoTax`, and place-of-supply support
- Multi-currency amounts in smallest units (`inr`, `usd`, `eur`, `gbp`, `aed`, `sgd`)
- Invoice totals, discounts, numbering, and PDF generation

#### Payments & subscriptions
- Create / capture / cancel payments (Stripe PaymentIntents, Razorpay Orders)
- Full and partial refunds with idempotency keys and negative-amount rejection
- Plans, subscriptions, pause / resume, immediate cancel, and schedule cancellation
- Stripe Customer Portal and payment-method update helpers

#### Webhooks
- Signature verification against raw request bodies
- Normalized internal event types (`payment.captured`, `refund.processed`, etc.)
- Event-id dedupe (Stripe `event.id`, Razorpay `X-Razorpay-Event-Id` or body fingerprint)
- `createRawBodyMiddleware()`, `parseWebhookRequest()`, and `createWebhookHttpHandler()`

#### Quality & release tooling
- Observability hooks, structured logger support, and normalized billing errors
- Strong unit and integration test coverage (tax, currency, refunds, subscriptions, webhooks)
- CI on Node 18 / 20 / 22: lint, typecheck, test, build
- Prepublish / prepack validation (`validate:package`, `validate:pack`)
- Publishing guide, SemVer notes, and release checklist

### Notes
- Amounts are always in **smallest currency units** (e.g. paise / cents)
- Requires **Node.js 18+**
- This line starts at `1.0.0`; breaking API changes require a major bump

[Unreleased]: https://github.com/DamandeepKour/Billing-kit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DamandeepKour/Billing-kit/releases/tag/v1.0.0
