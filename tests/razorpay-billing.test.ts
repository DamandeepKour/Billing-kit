import { BillingKit } from "../src/core/BillingKit";
import { UnsupportedOperationError } from "../src/utils/stripe-errors";

const ordersCreate = jest.fn();
const paymentsFetch = jest.fn();
const refundsFetch = jest.fn();
const subscriptionsCreate = jest.fn();
const subscriptionsCancel = jest.fn();

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
      fetch: jest.fn(),
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

  it("creates and cancels a subscription", async () => {
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

    const cancelled = await billing.cancelSubscription("sub_1");
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
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
