import { PaymentGatewayFactory, PaymentManager, PaymentService } from "../src/payment";
import { StripeGateway } from "../src/payment/gateways/StripeGateway";
import { RazorpayGateway } from "../src/payment/gateways/RazorpayGateway";
import { InvalidConfigError } from "../src/utils/errors";
import { createMockGateway } from "./helpers";

describe("payment / gateway factory", () => {
  it("creates Stripe gateway", () => {
    const gateway = PaymentGatewayFactory.create({
      provider: "stripe",
      secretKey: "sk_test_x",
    });

    expect(gateway).toBeInstanceOf(StripeGateway);
  });

  it("creates Razorpay gateway", () => {
    const gateway = PaymentGatewayFactory.create({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
    });

    expect(gateway).toBeInstanceOf(RazorpayGateway);
  });

  it("throws for unsupported provider", () => {
    expect(() =>
      PaymentGatewayFactory.create({
        // @ts-expect-error testing invalid provider
        provider: "paypal",
        secretKey: "x",
      }),
    ).toThrow(InvalidConfigError);
  });
});

describe("payment / manager", () => {
  it("creates stripe gateway from config", () => {
    const manager = new PaymentManager({
      provider: "stripe",
      secretKey: "sk_test_x",
    });

    expect(manager.getGateway().name).toBe("stripe");
  });
});

describe("payment / service", () => {
  it("creates payment via gateway", async () => {
    const gateway = createMockGateway();
    const service = new PaymentService(gateway);

    const payment = await service.createPayment({ amount: 5000 });

    expect(payment.id).toBe("pay_1");
    expect(gateway.createPayment).toHaveBeenCalled();
  });
});
