# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Deprecated

### Removed

### Security

## [1.0.0] - 2026-07-25

Initial public release of **billing-kit**.

### Added

- Framework-agnostic `BillingKit` facade for Stripe and Razorpay
- Invoices with GST (intra-/inter-state), VAT, sales tax, and multi-currency amounts
- Payments, refunds, subscriptions (create / pause / resume / cancel / schedule cancel)
- Webhook verification, normalization, raw-body helpers, and event-id dedupe
- Pluggable repositories (in-memory defaults) for invoices, webhooks, audits, and idempotency
- Observability hooks, structured errors, and config validation at startup
- Dual package entrypoints: `billing-kit` and `billing-kit/testing`
- CI for lint, typecheck, test, and package build (Node 18 / 20 / 22)
- Prepublish / prepack package validation (`validate:package`, `validate:pack`)

[Unreleased]: https://github.com/DamandeepKour/Billing-kit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DamandeepKour/Billing-kit/releases/tag/v1.0.0
