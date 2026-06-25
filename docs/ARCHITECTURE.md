# Billing Kit Architecture

## Overview

`billing-kit` is a framework-agnostic Node.js SDK. It provides billing business logic only.

**Included:** invoices, tax, payments, subscriptions, refunds, webhooks, PDFs  
**Not included:** HTTP routes, database, auth, user/product management

## Folder Structure

```
src/
├── core/           BillingKit facade (single entry point)
├── interfaces/     PaymentGateway contract
├── types/          Shared TypeScript types
├── invoice/        Invoice generation & numbering
├── payment/        PaymentManager + Stripe/Razorpay gateways
├── subscription/   Plans & subscriptions
├── transaction/    Billing event records
├── refund/         Refund workflows
├── tax/            GST, VAT, custom rules
├── coupon/         Discount logic
├── webhook/        Signature verification
├── pdf/            Invoice PDF generation
└── utils/          Errors, currency, IDs
```

## Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Facade** | `BillingKit` | One class for consumers |
| **Strategy** | `PaymentGateway` | Swap Stripe / Razorpay |
| **Factory** | `PaymentGatewayFactory` | Create gateway from config |

## Data Flow

```
Consumer App
    ↓
BillingKit
    ↓
Domain Services (Invoice, Tax, Coupon, …)
    ↓
PaymentGateway (Stripe | Razorpay)
```

## Consumer Responsibilities

Your application must handle:

- Storing invoices, transactions, customers
- HTTP/API routes (if needed)
- Authentication & authorization
- Product catalog

`billing-kit` returns structured objects. Persist them in your own database.

## Module API Summary

| Module | Methods |
|--------|---------|
| Invoice | `generateInvoice`, `getInvoiceSummary`, `generateInvoicePdf` |
| Payment | `createPayment`, `capturePayment`, `cancelPayment`, `getPaymentStatus` |
| Subscription | `createPlan`, `updatePlan`, `cancelPlan`, `createSubscription`, `cancelSubscription`, `renewSubscription` |
| Refund | `refundPayment` |
| Tax | `calculateGST`, `calculateVAT` |
| Coupon | `applyCoupon`, `validateCoupon` |
| Transaction | `recordTransaction`, `getTransaction` |
| Webhook | `verifyWebhook` |

## Extending

To add a new payment provider:

1. Implement `PaymentGateway` in `src/payment/gateways/`
2. Register in `PaymentGatewayFactory`
3. Add provider to `BillingProvider` type
