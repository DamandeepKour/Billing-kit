import crypto from "crypto";
import nock from "nock";
import { BillingKit } from "../../src/core/BillingKit";

describe("Razorpay payments", () => {
  afterEach(() => nock.cleanAll());

  it("creates order", async () => {
    nock("https://api.razorpay.com")
      .post("/v1/orders")
      .reply(200, {
        id: "order_test",
        amount: 5000,
        currency: "INR",
        status: "created",
        notes: {},
      });

    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
      currency: "inr",
    });

    const payment = await billing.createPayment({ amount: 5000 });
    expect(payment.id).toBe("order_test");
  });
});

describe("Razorpay webhooks", () => {
  it("verifies signature", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123" } } },
    });
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
      webhookSecret: secret,
    });

    const event = billing.verifyWebhook(body, signature);
    expect(event.type).toBe("payment.captured");
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.entity.id).toBe("pay_123");
  });
});
