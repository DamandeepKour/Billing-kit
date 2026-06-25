import crypto from "crypto";
import { RazorpayGateway } from "../src/payment/gateways/RazorpayGateway";
import { WebhookVerificationError } from "../src/utils/errors";

describe("RazorpayGateway webhooks", () => {
  const secret = "test_webhook_secret";
  const gateway = new RazorpayGateway({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "secret",
    webhookSecret: secret,
  });

  it("verifies valid signature", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123" } } },
    });
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    const event = gateway.verifyWebhook(body, signature);

    expect(event.type).toBe("payment.captured");
    expect(event.provider).toBe("razorpay");
  });

  it("rejects invalid signature", () => {
    expect(() =>
      gateway.verifyWebhook("{}", "invalid"),
    ).toThrow(WebhookVerificationError);
  });
});
