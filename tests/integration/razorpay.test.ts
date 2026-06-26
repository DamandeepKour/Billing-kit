import crypto from "crypto";
import nock from "nock";
import { BillingKit } from "../../src/core/BillingKit";

const RAZORPAY_API = "https://api.razorpay.com";

describe("Razorpay integration (mocked HTTP)", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("creates an order via Razorpay API", async () => {
    nock(RAZORPAY_API)
      .post("/v1/orders")
      .reply(200, {
        id: "order_integration_test",
        entity: "order",
        amount: 5000,
        amount_paid: 0,
        amount_due: 5000,
        currency: "INR",
        receipt: "rcpt_1",
        status: "created",
        notes: {},
      });

    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret_test",
      currency: "inr",
    });

    const payment = await billing.createPayment({ amount: 5000 });

    expect(payment.id).toBe("order_integration_test");
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(5000);
    expect(nock.isDone()).toBe(true);
  });
});

describe("Razorpay webhook integration", () => {
  it("verifies webhook signature end-to-end", () => {
    const secret = "whsec_razorpay_test";
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
    expect(event.provider).toBe("razorpay");
  });
});
