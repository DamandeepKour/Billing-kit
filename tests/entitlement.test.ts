import { EntitlementService } from "../src/entitlement";
import { InMemoryEntitlementRepository } from "../src/repositories";
import type { Subscription } from "../src/types/subscription";

function subscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: "sub_1",
    customerId: "cus_1",
    planId: "plan_pro",
    status: "active",
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    provider: "stripe",
    ...overrides,
  };
}

describe("EntitlementService", () => {
  let service: EntitlementService;

  beforeEach(() => {
    service = new EntitlementService(
      new InMemoryEntitlementRepository(),
    );
  });

  it("provisions mapped plan features for an active subscription", async () => {
    await service.setPlanFeatures({
      planId: "plan_pro",
      features: ["sso", "exports", "sso"],
    });

    const entitlement = await service.syncSubscriptionEntitlements({
      subscription: subscription(),
      source: "subscription_create",
    });

    expect(entitlement).toMatchObject({
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "plan_pro",
      features: ["exports", "sso"],
      status: "active",
    });
    await expect(service.hasFeature("cus_1", "sso")).resolves.toBe(true);
    await expect(service.hasFeature("cus_1", "audit_logs")).resolves.toBe(
      false,
    );
  });

  it("de-provisions access on cancellation, pause, and payment failure", async () => {
    await service.setPlanFeatures({
      planId: "plan_pro",
      features: ["exports"],
    });
    await service.syncSubscriptionEntitlements({
      subscription: subscription(),
    });

    await service.syncSubscriptionEntitlements({
      subscription: subscription({
        cancelAtPeriodEnd: true,
      }),
      source: "subscription_cancel",
    });
    await expect(service.hasFeature("cus_1", "exports")).resolves.toBe(false);

    await service.syncSubscriptionEntitlements({
      subscription: subscription({ id: "sub_2", paused: true }),
      source: "subscription_pause",
    });
    await expect(service.hasFeature("cus_1", "exports")).resolves.toBe(false);

    await service.syncSubscriptionEntitlements({
      subscription: subscription({ id: "sub_3" }),
    });
    await service.revokeFeatureAccess({
      customerId: "cus_1",
      source: "payment_failure",
      reason: "invoice payment failed",
    });
    await expect(service.hasFeature("cus_1", "exports")).resolves.toBe(false);
  });

  it("unions features across subscriptions and revokes independently", async () => {
    await service.setPlanFeatures({
      planId: "plan_basic",
      features: ["projects"],
    });
    await service.setPlanFeatures({
      planId: "plan_addon",
      features: ["audit_logs"],
    });
    await service.syncSubscriptionEntitlements({
      subscription: subscription({
        id: "sub_basic",
        planId: "plan_basic",
      }),
    });
    await service.syncSubscriptionEntitlements({
      subscription: subscription({
        id: "sub_addon",
        planId: "plan_addon",
      }),
    });

    await expect(service.listFeatures("cus_1")).resolves.toEqual([
      "audit_logs",
      "projects",
    ]);

    await service.revokeFeatureAccess({
      subscriptionId: "sub_basic",
      reason: "cancelled",
    });

    await expect(service.hasFeature("cus_1", "projects")).resolves.toBe(false);
    await expect(service.hasFeature("cus_1", "audit_logs")).resolves.toBe(
      true,
    );
  });

  it("updates active access when a plan mapping changes", async () => {
    await service.setPlanFeatures({
      planId: "plan_pro",
      features: ["exports"],
    });
    await service.syncSubscriptionEntitlements({
      subscription: subscription(),
    });

    await service.setPlanFeatures({
      planId: "plan_pro",
      features: ["exports", "sso"],
    });

    await expect(service.hasFeature("cus_1", "sso")).resolves.toBe(true);
  });
});
