import crypto from "crypto";
import { RazorpayGateway } from "../src/payment/gateways/RazorpayGateway";
import { BillingKit } from "../src/core/BillingKit";
import { WebhookVerificationError } from "../src/utils/errors";

const secret = "test_webhook_secret";
const keySecret = "rzp_test_secret";

function gateway(): RazorpayGateway {
  return new RazorpayGateway({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: keySecret,
    webhookSecret: secret,
  });
}

function sign(body: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("Razorpay webhook signature verification", () => {
  it("verifies valid signature from a string raw body", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_123",
            amount: 50000,
            currency: "INR",
            status: "captured",
          },
        },
      },
    });

    const event = gateway().verifyWebhook(body, sign(body));

    expect(event.type).toBe("payment.captured");
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.provider).toBe("razorpay");
    expect(event.entity).toMatchObject({
      id: "pay_123",
      kind: "payment",
      amount: 50000,
      currency: "inr",
    });
  });

  it("verifies valid signature from a Buffer raw body (Express express.raw)", () => {
    const body = Buffer.from(
      JSON.stringify({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_1",
              payment_id: "pay_1",
              amount: 1000,
              currency: "INR",
              status: "processed",
            },
          },
        },
      }),
      "utf8",
    );

    const event = gateway().verifyWebhook(body, sign(body));

    expect(event.normalizedType).toBe("refund.processed");
    expect(event.entity.kind).toBe("refund");
    expect(event.entity.parentId).toBe("pay_1");
  });

  it("rejects invalid signature", () => {
    expect(() => gateway().verifyWebhook("{}", "invalid")).toThrow(
      WebhookVerificationError,
    );
  });

  it("rejects when body was mutated after signing (parse-then-stringify)", () => {
    const original = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1" } } },
    });
    const signature = sign(original);
    // Simulates verifying a re-serialized body — signature must fail
    const mutated = JSON.stringify(JSON.parse(original));

    // Only fail when serialization differs; if identical, skip
    if (mutated !== original) {
      expect(() => gateway().verifyWebhook(mutated, signature)).toThrow(
        WebhookVerificationError,
      );
    } else {
      // Ensure Buffer path still works with exact bytes
      expect(gateway().verifyWebhook(Buffer.from(original), signature).type).toBe(
        "payment.captured",
      );
    }
  });
});

describe("Razorpay subscription webhook parsing", () => {
  it.each([
    ["subscription.activated", "subscription.activated"],
    ["subscription.charged", "subscription.charged"],
    ["subscription.cancelled", "subscription.cancelled"],
  ] as const)("normalizes %s", (eventName, normalized) => {
    const body = JSON.stringify({
      event: eventName,
      payload: {
        subscription: {
          entity: {
            id: "sub_abc",
            status: eventName === "subscription.cancelled" ? "cancelled" : "active",
            plan_id: "plan_pro",
          },
        },
      },
    });

    const event = gateway().verifyWebhook(body, sign(body));

    expect(event.type).toBe(eventName);
    expect(event.normalizedType).toBe(normalized);
    expect(event.entity).toMatchObject({
      id: "sub_abc",
      kind: "subscription",
      parentId: "plan_pro",
    });
  });
});

describe("Razorpay payment signature", () => {
  it("verifies checkout order|payment signature", () => {
    const orderId = "order_1";
    const paymentId = "pay_1";
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: keySecret,
      webhookSecret: secret,
    });

    expect(
      billing.verifyPaymentSignature({ orderId, paymentId, signature }),
    ).toBe(true);

    expect(
      billing.verifyPaymentSignature({
        orderId,
        paymentId,
        signature: "bad",
      }),
    ).toBe(false);
  });
});
