import { BillingKit } from "../src/core/BillingKit";
import { SubscriptionLifecycleError } from "../src/utils/errors";
import { UnsupportedOperationError } from "../src/utils/stripe-errors";

const ordersCreate = jest.fn();
const paymentsFetch = jest.fn();
const refundsFetch = jest.fn();
const subscriptionsCreate = jest.fn();
const subscriptionsCancel = jest.fn();
const subscriptionsFetch = jest.fn();
const subscriptionsPause = jest.fn();
const subscriptionsResume = jest.fn();

jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    orders: { create: ordersCreate },
    payments: {
      fetch: paymentsFetch,
      capture: jest.fn(),
      refund: jest.fn(),
    },
    refunds: { fetch: refundsFetch },
    plans: { create: jest.fn(), fetch: jest.fn() },
    subscriptions: {
      create: subscriptionsCreate,
      cancel: subscriptionsCancel,
      fetch: subscriptionsFetch,
      pause: subscriptionsPause,
      resume: subscriptionsResume,
    },
  }));
});


function razorpayBilling(): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "secret",
    currency: "inr",
  });
}

describe("Razorpay orders and fetch helpers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an order via createOrder", async () => {
    ordersCreate.mockResolvedValue({
      id: "order_1",
      amount: 99900,
      currency: "INR",
      status: "created",
      receipt: "rcpt_1",
      notes: { sku: "pro" },
    });

    const order = await razorpayBilling().createOrder({
      amount: 99900,
      receipt: "rcpt_1",
      notes: { sku: "pro" },
    });

    expect(ordersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 99900,
        currency: "INR",
        receipt: "rcpt_1",
      }),
    );
    expect(order).toMatchObject({
      id: "order_1",
      amount: 99900,
      currency: "inr",
      status: "created",
      provider: "razorpay",
    });
  });

  it("createPayment still creates an order", async () => {
    ordersCreate.mockResolvedValue({
      id: "order_2",
      amount: 5000,
      currency: "INR",
      status: "created",
      receipt: "rcpt_2",
    });

    const payment = await razorpayBilling().createPayment({ amount: 5000 });
    expect(payment.id).toBe("order_2");
    expect(payment.status).toBe("pending");
  });

  it("fetches payment and refund", async () => {
    paymentsFetch.mockResolvedValue({
      id: "pay_1",
      status: "captured",
      captured: true,
      amount: 99900,
      currency: "INR",
      notes: {},
    });
    refundsFetch.mockResolvedValue({
      id: "rfnd_1",
      payment_id: "pay_1",
      amount: 1000,
      status: "processed",
    });

    const billing = razorpayBilling();
    const payment = await billing.fetchPayment("pay_1");
    expect(payment.status).toBe("captured");

    const refund = await billing.fetchRefund("rfnd_1");
    expect(refund).toMatchObject({
      id: "rfnd_1",
      paymentId: "pay_1",
      status: "succeeded",
    });
  });

  it("creates and immediately cancels a subscription", async () => {
    subscriptionsCreate.mockResolvedValue({
      id: "sub_1",
      status: "created",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });
    subscriptionsCancel.mockResolvedValue({
      id: "sub_1",
      status: "cancelled",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    const billing = razorpayBilling();
    const sub = await billing.createSubscription({
      customerId: "cust_1",
      planId: "plan_1",
      totalCount: 6,
    });
    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_id: "plan_1",
        customer_id: "cust_1",
        total_count: 6,
      }),
    );
    expect(sub.id).toBe("sub_1");
    expect(sub.status).toBe("pending");
    expect(sub.providerStatus).toBe("created");

    const cancelled = await billing.cancelSubscription("sub_1");
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1", false);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelAtPeriodEnd).toBe(false);
  });

  it("schedules cancellation at cycle end", async () => {
    subscriptionsCancel.mockResolvedValue({
      id: "sub_1",
      status: "active",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    const scheduled = await razorpayBilling().scheduleCancellation("sub_1");
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_1", true);
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.status).toBe("active");
  });

  it("pauses and resumes an active subscription", async () => {
    subscriptionsFetch
      .mockResolvedValueOnce({
        id: "sub_1",
        status: "active",
        plan_id: "plan_1",
        current_end: 1_900_000_000,
      })
      .mockResolvedValueOnce({
        id: "sub_1",
        status: "paused",
        plan_id: "plan_1",
        current_end: 1_900_000_000,
      });
    subscriptionsPause.mockResolvedValue({
      id: "sub_1",
      status: "paused",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });
    subscriptionsResume.mockResolvedValue({
      id: "sub_1",
      status: "active",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    const billing = razorpayBilling();
    const paused = await billing.pauseSubscription({ subscriptionId: "sub_1" });
    expect(subscriptionsPause).toHaveBeenCalledWith("sub_1", { pause_at: "now" });
    expect(paused.status).toBe("paused");
    expect(paused.paused).toBe(true);

    const resumed = await billing.resumeSubscription("sub_1");
    expect(subscriptionsResume).toHaveBeenCalledWith("sub_1", {
      resume_at: "now",
    });
    expect(resumed.status).toBe("active");
    expect(resumed.paused).toBe(false);
  });

  it("rejects pause when subscription is not active", async () => {
    subscriptionsFetch.mockResolvedValue({
      id: "sub_1",
      status: "created",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    await expect(
      razorpayBilling().pauseSubscription({ subscriptionId: "sub_1" }),
    ).rejects.toBeInstanceOf(SubscriptionLifecycleError);
    expect(subscriptionsPause).not.toHaveBeenCalled();
  });

  it("rejects resume when subscription is not paused", async () => {
    subscriptionsFetch.mockResolvedValue({
      id: "sub_1",
      status: "active",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    await expect(
      razorpayBilling().resumeSubscription("sub_1"),
    ).rejects.toBeInstanceOf(SubscriptionLifecycleError);
    expect(subscriptionsResume).not.toHaveBeenCalled();
  });

  it("surfaces cancelled status when pausing an authenticated subscription", async () => {
    subscriptionsFetch.mockResolvedValue({
      id: "sub_1",
      status: "authenticated",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });
    subscriptionsPause.mockResolvedValue({
      id: "sub_1",
      status: "cancelled",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    const result = await razorpayBilling().pauseSubscription({
      subscriptionId: "sub_1",
    });
    expect(result.status).toBe("cancelled");
    expect(result.providerStatus).toBe("cancelled");
  });

  it("is idempotent when pausing an already paused subscription", async () => {
    subscriptionsFetch.mockResolvedValue({
      id: "sub_1",
      status: "paused",
      plan_id: "plan_1",
      current_end: 1_900_000_000,
    });

    const result = await razorpayBilling().pauseSubscription({
      subscriptionId: "sub_1",
    });
    expect(result.status).toBe("paused");
    expect(subscriptionsPause).not.toHaveBeenCalled();
  });
});

describe("Razorpay helpers on other providers", () => {
  it("throws UnsupportedOperationError for Stripe", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    await expect(billing.createOrder({ amount: 100 })).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
  });
});
