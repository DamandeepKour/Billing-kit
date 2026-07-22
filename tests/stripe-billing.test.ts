import { BillingKit } from "../src/core/BillingKit";
import {
  StripeCardError,
  StripeInvalidRequestError,
  UnsupportedOperationError,
} from "../src/utils/stripe-errors";
import Stripe from "stripe";

const productsCreate = jest.fn();
const pricesCreate = jest.fn();
const pricesRetrieve = jest.fn();
const productsUpdate = jest.fn();
const subscriptionsCreate = jest.fn();
const subscriptionsUpdate = jest.fn();
const subscriptionsRetrieve = jest.fn();
const subscriptionsCancel = jest.fn();
const customersCreate = jest.fn();
const customersUpdate = jest.fn();
const paymentMethodsAttach = jest.fn();
const invoicesRetrieve = jest.fn();
const createUsageRecord = jest.fn();

jest.mock("stripe", () => {
  const actualStripe = jest.requireActual<typeof import("stripe")>("stripe");

  return {
    __esModule: true,
    default: Object.assign(
      jest.fn().mockImplementation(() => ({
        products: { create: productsCreate, update: productsUpdate },
        prices: { create: pricesCreate, retrieve: pricesRetrieve },
        subscriptions: {
          create: subscriptionsCreate,
          update: subscriptionsUpdate,
          retrieve: subscriptionsRetrieve,
          cancel: subscriptionsCancel,
        },
        customers: { create: customersCreate, update: customersUpdate },
        paymentMethods: { attach: paymentMethodsAttach },
        invoices: { retrieve: invoicesRetrieve },
        subscriptionItems: { createUsageRecord },
        paymentIntents: {
          create: jest.fn(),
          capture: jest.fn(),
          cancel: jest.fn(),
          retrieve: jest.fn(),
        },
        refunds: { create: jest.fn() },
        webhooks: new actualStripe.default("sk_test").webhooks,
      })),
      { errors: actualStripe.default.errors },
    ),
  };
});

function stripeBilling(): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test",
    currency: "usd",
  });
}

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
    pause_collection: null,
    items: {
      data: [{ id: "si_1", price: { id: "price_monthly" } }],
    },
    ...overrides,
  };
}

describe("Stripe recurring plans", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a monthly recurring price/plan", async () => {
    productsCreate.mockResolvedValue({ id: "prod_1", name: "Pro Monthly" });
    pricesCreate.mockResolvedValue({
      id: "price_monthly",
      currency: "usd",
      unit_amount: 2900,
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    });

    const plan = await stripeBilling().createPlan({
      name: "Pro Monthly",
      amount: 2900,
      currency: "usd",
      interval: "monthly",
    });

    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_amount: 2900,
        currency: "usd",
        recurring: expect.objectContaining({
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        }),
      }),
    );
    expect(plan).toMatchObject({
      id: "price_monthly",
      interval: "monthly",
      usageType: "licensed",
      productId: "prod_1",
    });
  });

  it("creates a yearly recurring price/plan", async () => {
    productsCreate.mockResolvedValue({ id: "prod_year", name: "Pro Yearly" });
    pricesCreate.mockResolvedValue({
      id: "price_yearly",
      currency: "usd",
      unit_amount: 29000,
      recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
    });

    const plan = await stripeBilling().createPlan({
      name: "Pro Yearly",
      amount: 29000,
      currency: "usd",
      interval: "yearly",
    });

    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recurring: expect.objectContaining({
          interval: "year",
          interval_count: 1,
        }),
      }),
    );
    expect(plan.interval).toBe("yearly");
    expect(plan.id).toBe("price_yearly");
  });

  it("creates a metered usage-based price", async () => {
    productsCreate.mockResolvedValue({ id: "prod_meter", name: "API Usage" });
    pricesCreate.mockResolvedValue({
      id: "price_metered",
      currency: "usd",
      unit_amount: 1,
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "metered",
        aggregate_usage: "sum",
      },
    });

    const plan = await stripeBilling().createPlan({
      name: "API Usage",
      amount: 1,
      currency: "usd",
      interval: "monthly",
      usageType: "metered",
      aggregateUsage: "sum",
    });

    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        recurring: expect.objectContaining({
          usage_type: "metered",
          aggregate_usage: "sum",
        }),
      }),
    );
    expect(plan.usageType).toBe("metered");
    expect(plan.aggregateUsage).toBe("sum");
  });
});

describe("Stripe subscriptions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates and immediately cancels a subscription", async () => {
    subscriptionsCreate.mockResolvedValue(baseSubscription());
    subscriptionsCancel.mockResolvedValue(
      baseSubscription({ status: "canceled", cancel_at_period_end: false }),
    );

    const billing = stripeBilling();
    const created = await billing.createSubscription({
      customerId: "cus_1",
      planId: "price_monthly",
      trialDays: 7,
    });

    expect(created.id).toBe("sub_1");
    expect(created.subscriptionItemId).toBe("si_1");
    expect(created.status).toBe("active");
    expect(created.cancelAtPeriodEnd).toBe(false);

    const cancelled = await billing.cancelSubscription("sub_1");
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.providerStatus).toBe("canceled");
    expect(cancelled.cancelAtPeriodEnd).toBe(false);
  });

  it("schedules cancellation at period end", async () => {
    subscriptionsUpdate.mockResolvedValue(
      baseSubscription({ cancel_at_period_end: true }),
    );

    const scheduled = await stripeBilling().scheduleCancellation("sub_1");
    expect(subscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: true,
    });
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.status).toBe("active");
  });

  it("pauses, resumes, and retrieves a subscription", async () => {
    subscriptionsUpdate
      .mockResolvedValueOnce(
        baseSubscription({
          pause_collection: { behavior: "mark_uncollectible" },
        }),
      )
      .mockResolvedValueOnce(baseSubscription({ pause_collection: null }));
    subscriptionsRetrieve.mockResolvedValue(baseSubscription({ status: "active" }));

    const billing = stripeBilling();

    const paused = await billing.pauseSubscription({ subscriptionId: "sub_1" });
    expect(paused.paused).toBe(true);
    expect(paused.status).toBe("paused");
    expect(subscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      pause_collection: { behavior: "mark_uncollectible" },
    });

    const resumed = await billing.resumeSubscription("sub_1");
    expect(resumed.paused).toBe(false);
    expect(resumed.status).toBe("active");

    const retrieved = await billing.retrieveSubscription("sub_1");
    expect(retrieved.id).toBe("sub_1");
    expect(subscriptionsRetrieve).toHaveBeenCalledWith("sub_1");
  });

  it("pauses with custom behavior and resumesAt", async () => {
    const resumesAt = new Date("2030-01-15T00:00:00.000Z");
    subscriptionsUpdate.mockResolvedValue(
      baseSubscription({
        pause_collection: {
          behavior: "void",
          resumes_at: Math.floor(resumesAt.getTime() / 1000),
        },
      }),
    );

    const paused = await stripeBilling().pauseSubscription({
      subscriptionId: "sub_1",
      behavior: "void",
      resumesAt,
    });

    expect(paused.status).toBe("paused");
    expect(subscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      pause_collection: {
        behavior: "void",
        resumes_at: Math.floor(resumesAt.getTime() / 1000),
      },
    });
  });

  it("maps past_due provider status to canonical past_due", async () => {
    subscriptionsRetrieve.mockResolvedValue(
      baseSubscription({ status: "past_due" }),
    );
    const retrieved = await stripeBilling().retrieveSubscription("sub_1");
    expect(retrieved.status).toBe("past_due");
    expect(retrieved.providerStatus).toBe("past_due");
  });

  it("can pause while cancellation is already scheduled", async () => {
    subscriptionsUpdate.mockResolvedValue(
      baseSubscription({
        cancel_at_period_end: true,
        pause_collection: { behavior: "keep_as_draft" },
      }),
    );

    const paused = await stripeBilling().pauseSubscription({
      subscriptionId: "sub_1",
      behavior: "keep_as_draft",
    });

    expect(paused.status).toBe("paused");
    expect(paused.cancelAtPeriodEnd).toBe(true);
  });
});

describe("Stripe customers and invoices", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a customer and sets a default payment method", async () => {
    customersCreate.mockResolvedValue({
      id: "cus_new",
      email: "a@b.com",
      name: "Ada",
      phone: null,
      metadata: {},
      invoice_settings: { default_payment_method: "pm_1" },
    });
    paymentMethodsAttach.mockResolvedValue({
      id: "pm_2",
      type: "card",
    });
    customersUpdate.mockResolvedValue({
      id: "cus_new",
      email: "a@b.com",
      name: "Ada",
      phone: null,
      metadata: {},
      invoice_settings: { default_payment_method: "pm_2" },
    });

    const billing = stripeBilling();
    const customer = await billing.createCustomer({
      email: "a@b.com",
      name: "Ada",
      paymentMethodId: "pm_1",
    });
    expect(customer.id).toBe("cus_new");
    expect(customer.defaultPaymentMethodId).toBe("pm_1");

    const attached = await billing.attachPaymentMethod({
      customerId: "cus_new",
      paymentMethodId: "pm_2",
    });
    expect(attached.id).toBe("pm_2");

    const updated = await billing.setDefaultPaymentMethod({
      customerId: "cus_new",
      paymentMethodId: "pm_2",
    });
    expect(updated.defaultPaymentMethodId).toBe("pm_2");
  });

  it("retrieves a hosted Stripe invoice", async () => {
    invoicesRetrieve.mockResolvedValue({
      id: "in_1",
      customer: "cus_1",
      status: "open",
      amount_due: 2900,
      amount_paid: 0,
      currency: "usd",
      hosted_invoice_url: "https://invoice.stripe.com/i/test",
      invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
      subscription: "sub_1",
    });

    const invoice = await stripeBilling().retrieveProviderInvoice("in_1");
    expect(invoice.hostedInvoiceUrl).toContain("invoice.stripe.com");
    expect(invoice.invoicePdfUrl).toContain("/pdf");
    expect(invoice.subscriptionId).toBe("sub_1");
  });

  it("reports metered usage", async () => {
    createUsageRecord.mockResolvedValue({
      id: "mbur_1",
      quantity: 100,
      timestamp: 1_700_000_000,
    });

    const record = await stripeBilling().reportUsage({
      subscriptionItemId: "si_1",
      quantity: 100,
      action: "increment",
    });

    expect(createUsageRecord).toHaveBeenCalledWith(
      "si_1",
      expect.objectContaining({ quantity: 100, action: "increment" }),
    );
    expect(record.id).toBe("mbur_1");
  });

  it("provisions plan features and revokes them on cancellation", async () => {
    const billing = stripeBilling();
    await billing.setPlanFeatures({
      planId: "price_monthly",
      features: ["exports", "sso"],
    });
    subscriptionsCreate.mockResolvedValue(baseSubscription());

    const subscription = await billing.createSubscription({
      customerId: "cus_1",
      planId: "price_monthly",
    });

    await expect(billing.hasFeature("cus_1", "sso")).resolves.toBe(true);

    subscriptionsCancel.mockResolvedValue(
      baseSubscription({ status: "canceled" }),
    );
    await billing.cancelSubscription(subscription.id);

    await expect(billing.hasFeature("cus_1", "sso")).resolves.toBe(false);
    await expect(
      billing.getSubscriptionEntitlement(subscription.id),
    ).resolves.toMatchObject({
      status: "revoked",
      source: "subscription_cancel",
    });
  });

  it("revokes on payment failure and restores after recovery", async () => {
    const billing = stripeBilling();
    await billing.setPlanFeatures({
      planId: "price_monthly",
      features: ["api_access"],
    });
    subscriptionsCreate.mockResolvedValue(baseSubscription());
    await billing.createSubscription({
      customerId: "cus_1",
      planId: "price_monthly",
    });

    await billing.reportBillingFailure({
      kind: "invoice",
      referenceId: "in_failed",
      customerId: "cus_1",
      metadata: { subscriptionId: "sub_1" },
      reason: "card declined",
    });
    await expect(billing.hasFeature("cus_1", "api_access")).resolves.toBe(
      false,
    );

    await billing.reportBillingRecovered({
      kind: "invoice",
      referenceId: "in_failed",
    });
    await expect(billing.hasFeature("cus_1", "api_access")).resolves.toBe(
      true,
    );
  });
});

describe("Stripe error mapping", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps card errors", async () => {
    productsCreate.mockRejectedValue(
      new Stripe.errors.StripeCardError({
        message: "Your card was declined.",
        type: "card_error",
        decline_code: "generic_decline",
        code: "card_declined",
      }),
    );

    await expect(
      stripeBilling().createPlan({
        name: "X",
        amount: 100,
        interval: "monthly",
      }),
    ).rejects.toBeInstanceOf(StripeCardError);
  });

  it("maps invalid request errors", async () => {
    subscriptionsRetrieve.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        message: "No such subscription",
        type: "invalid_request_error",
        param: "id",
      }),
    );

    await expect(stripeBilling().retrieveSubscription("sub_missing")).rejects.toBeInstanceOf(
      StripeInvalidRequestError,
    );
  });
});

describe("Stripe helpers on other providers", () => {
  it("throws UnsupportedOperationError for Razorpay Stripe-only helpers", async () => {
    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
    });

    await expect(
      billing.createCustomer({ email: "a@b.com" }),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
