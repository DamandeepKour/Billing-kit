import { SubscriptionService } from "../src/subscription";
import { createMockGateway } from "./helpers";

describe("subscription / create", () => {
  it("creates a plan then an active subscription", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    const plan = await service.createPlan({
      name: "Pro",
      amount: 99900,
      interval: "monthly",
    });

    const subscription = await service.createSubscription({
      customerId: "cus_1",
      planId: plan.id,
    });

    expect(gateway.createPlan).toHaveBeenCalledWith({
      name: "Pro",
      amount: 99900,
      interval: "monthly",
    });
    expect(gateway.createSubscription).toHaveBeenCalledWith({
      customerId: "cus_1",
      planId: "plan_1",
      trialDays: undefined,
      metadata: {},
      defaultPaymentMethodId: undefined,
      totalCount: undefined,
    });
    expect(plan.id).toBe("plan_1");
    expect(subscription).toMatchObject({
      id: "sub_1",
      customerId: "cus_1",
      planId: "plan_1",
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(subscription.currentPeriodEnd.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("forwards trial days and metadata to the gateway", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    await service.createSubscription({
      customerId: "cus_2",
      planId: "plan_pro",
      trialDays: 14,
      metadata: { source: "signup" },
    });

    expect(gateway.createSubscription).toHaveBeenCalledWith({
      customerId: "cus_2",
      planId: "plan_pro",
      trialDays: 14,
      metadata: { source: "signup" },
      defaultPaymentMethodId: undefined,
      totalCount: undefined,
    });
  });

  it("propagates gateway create failures", async () => {
    const gateway = createMockGateway({
      createSubscription: jest
        .fn()
        .mockRejectedValue(new Error("customer not found")),
    });

    await expect(
      new SubscriptionService(gateway).createSubscription({
        customerId: "missing",
        planId: "plan_1",
      }),
    ).rejects.toThrow("customer not found");
  });
});

describe("subscription / cancel", () => {
  it("cancels immediately via gateway", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    const cancelled = await service.cancelSubscription("sub_1");

    expect(gateway.cancelSubscription).toHaveBeenCalledWith("sub_1");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelAtPeriodEnd).toBe(false);
  });

  it("schedules cancellation at period end", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    const scheduled = await service.scheduleCancellation("sub_1");

    expect(gateway.scheduleCancellation).toHaveBeenCalledWith("sub_1");
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.status).toBe("active");
  });

  it("accepts scheduleCancellation object input", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    await service.scheduleCancellation({ subscriptionId: "sub_42" });

    expect(gateway.scheduleCancellation).toHaveBeenCalledWith("sub_42");
  });

  it("propagates gateway cancel failures", async () => {
    const gateway = createMockGateway({
      cancelSubscription: jest
        .fn()
        .mockRejectedValue(new Error("subscription already cancelled")),
    });

    await expect(
      new SubscriptionService(gateway).cancelSubscription("sub_1"),
    ).rejects.toThrow("subscription already cancelled");
  });
});

describe("subscription / lifecycle helpers", () => {
  it("retrieves the current subscription", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    const subscription = await service.retrieveSubscription("sub_1");

    expect(gateway.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(subscription.id).toBe("sub_1");
  });

  it("renews via gateway", async () => {
    const gateway = createMockGateway({
      renewSubscription: jest.fn().mockResolvedValue({
        id: "sub_1",
        customerId: "cus_1",
        planId: "plan_1",
        status: "active",
        currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        provider: "mock",
      }),
    });

    const renewed = await new SubscriptionService(gateway).renewSubscription(
      "sub_1",
    );

    expect(gateway.renewSubscription).toHaveBeenCalledWith("sub_1");
    expect(renewed.currentPeriodEnd.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });
});
