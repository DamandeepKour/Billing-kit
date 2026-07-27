/**
 * Billing lifecycle simulation tests (Stripe Test Clock style).
 *
 * Covers trials, renewals, payment failures, upgrades, and multi-phase
 * subscription schedules using in-memory fixtures + mocked Stripe SDK.
 */
import { BillingKit } from "../src/core/BillingKit";
import {
  advanceSchedulePhase,
  createMockStripeInvoicePaid,
  createMockStripePaymentIntentFailed,
  createMockStripeSubscription,
  createSignedStripeWebhookRequest,
  createSimulatedSchedule,
  createSimulatedSubscription,
  createTestClock,
  failSimulatedPayment,
  pauseSimulatedSubscription,
  recoverSimulatedPayment,
  renewSimulatedSubscription,
  resumeSimulatedSubscription,
  scheduleSimulatedCancellation,
  syncSubscriptionToClock,
  toStripeSubscriptionObject,
  undoSimulatedCancellation,
  upgradeSimulatedSubscription,
} from "../src/testing";

const subscriptionsCreate = jest.fn();
const subscriptionsUpdate = jest.fn();
const subscriptionsRetrieve = jest.fn();
const subscriptionsCancel = jest.fn();

jest.mock("stripe", () => {
  const actualStripe = jest.requireActual<typeof import("stripe")>("stripe");

  return {
    __esModule: true,
    default: Object.assign(
      jest.fn().mockImplementation(() => ({
        products: { create: jest.fn(), update: jest.fn() },
        prices: { create: jest.fn(), retrieve: jest.fn() },
        subscriptions: {
          create: subscriptionsCreate,
          update: subscriptionsUpdate,
          retrieve: subscriptionsRetrieve,
          cancel: subscriptionsCancel,
          list: jest.fn(),
        },
        customers: {
          create: jest.fn(),
          update: jest.fn(),
          retrieve: jest.fn(),
        },
        paymentMethods: {
          attach: jest.fn(),
          list: jest.fn(),
          detach: jest.fn(),
        },
        invoices: { retrieve: jest.fn(), list: jest.fn() },
        billingPortal: { sessions: { create: jest.fn() } },
        subscriptionItems: { createUsageRecord: jest.fn() },
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

const WEBHOOK_SECRET = "whsec_lifecycle_sim";

function billing(): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test_lifecycle",
    webhookSecret: WEBHOOK_SECRET,
    currency: "usd",
  });
}

describe("lifecycle / test clock helpers", () => {
  it("advances time forward only", () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    expect(clock.toISOString()).toBe("2026-01-01T00:00:00.000Z");

    clock.advanceByDays(14);
    expect(clock.toISOString()).toBe("2026-01-15T00:00:00.000Z");

    expect(() => clock.advanceTo(clock.now - 1)).toThrow(/backwards/);
  });
});

describe("lifecycle / trial → active", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a trialing subscription and maps it to canonical active", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let sim = createSimulatedSubscription(clock, {
      customerId: "cus_trial",
      priceId: "price_pro",
      trialDays: 14,
      unitAmount: 2900,
    });

    expect(sim.status).toBe("trialing");
    expect(sim.trialEnd).toBe(clock.now + 14 * 24 * 60 * 60);

    subscriptionsCreate.mockResolvedValue(toStripeSubscriptionObject(sim));

    const kit = billing();
    const created = await kit.createSubscription({
      customerId: "cus_trial",
      planId: "price_pro",
      trialDays: 14,
    });

    expect(subscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_trial",
        items: [{ price: "price_pro" }],
        trial_period_days: 14,
      }),
    );
    expect(created.status).toBe("active");
    expect(created.providerStatus).toBe("trialing");
    expect(created.planId).toBe("price_pro");

    clock.advanceTo(sim.trialEnd!);
    sim = syncSubscriptionToClock(sim, clock);
    expect(sim.status).toBe("active");

    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const afterTrial = await kit.retrieveSubscription(sim.id);
    expect(afterTrial.status).toBe("active");
    expect(afterTrial.providerStatus).toBe("active");
  });
});

describe("lifecycle / renewals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("advances the billing period on successful renewal", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let sim = createSimulatedSubscription(clock, {
      customerId: "cus_renew",
      priceId: "price_monthly",
      intervalDays: 30,
      unitAmount: 2000,
    });
    const firstPeriodEnd = sim.currentPeriodEnd;

    clock.advanceTo(firstPeriodEnd);
    sim = renewSimulatedSubscription(sim, clock, 30);

    expect(sim.currentPeriodStart).toBe(firstPeriodEnd);
    expect(sim.currentPeriodEnd).toBe(firstPeriodEnd + 30 * 24 * 60 * 60);
    expect(sim.status).toBe("active");

    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const retrieved = await billing().retrieveSubscription(sim.id);
    expect(retrieved.currentPeriodEnd.toISOString()).toBe(
      new Date(sim.currentPeriodEnd * 1000).toISOString(),
    );
  });

  it("processes invoice.paid renewal webhooks as subscription.charged", async () => {
    const clock = createTestClock(Date.UTC(2026, 2, 1));
    const kit = billing();
    await kit.setPlanFeatures({
      planId: "price_monthly",
      features: ["renewal_perk"],
    });

    const invoice = createMockStripeInvoicePaid({
      id: "in_renew",
      amount: 2000,
      subscription: "sub_renew",
      customer: "cus_renew",
    });
    // Force stable event id + created
    const body = JSON.stringify({
      ...JSON.parse(invoice.body),
      id: "evt_renew_invoice",
      created: clock.now,
      data: {
        object: {
          ...(JSON.parse(invoice.body) as { data: { object: Record<string, unknown> } })
            .data.object,
          lines: {
            data: [{ price: { id: "price_monthly" } }],
          },
          plan_id: "price_monthly",
        },
      },
    });
    const signed = createSignedStripeWebhookRequest({
      payload: body,
      secret: WEBHOOK_SECRET,
      asBuffer: true,
    });

    const result = await kit.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("subscription.charged");
    expect(result.duplicate).toBe(false);
  });

  it("undoes cancel-at-period-end via renewSubscription API", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let sim = createSimulatedSubscription(clock, {
      customerId: "cus_1",
      priceId: "price_monthly",
    });
    sim = scheduleSimulatedCancellation(sim);
    expect(sim.cancelAtPeriodEnd).toBe(true);

    subscriptionsUpdate.mockResolvedValue(
      toStripeSubscriptionObject(undoSimulatedCancellation(sim)),
    );

    const renewed = await billing().renewSubscription(sim.id);
    expect(subscriptionsUpdate).toHaveBeenCalledWith(sim.id, {
      cancel_at_period_end: false,
    });
    expect(renewed.cancelAtPeriodEnd).toBe(false);
    expect(renewed.status).toBe("active");
  });
});

describe("lifecycle / payment failures", () => {
  beforeEach(() => jest.clearAllMocks());

  it("maps past_due after a failed renewal payment", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let sim = createSimulatedSubscription(clock, {
      customerId: "cus_fail",
      priceId: "price_monthly",
    });

    clock.advanceTo(sim.currentPeriodEnd);
    sim = failSimulatedPayment(sim);

    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const kit = billing();
    await kit.setPlanFeatures({
      planId: "price_monthly",
      features: ["paid_feature"],
    });

    const retrieved = await kit.retrieveSubscription(sim.id);
    expect(retrieved.status).toBe("past_due");
    expect(retrieved.providerStatus).toBe("past_due");

    // Entitlements revoked for past_due
    await expect(kit.hasFeature("cus_fail", "paid_feature")).resolves.toBe(
      false,
    );

    sim = recoverSimulatedPayment(sim);
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const recovered = await kit.retrieveSubscription(sim.id);
    expect(recovered.status).toBe("active");
  });

  it("revokes entitlements on payment_intent.payment_failed webhook", async () => {
    const kit = billing();
    await kit.setPlanFeatures({
      planId: "price_monthly",
      features: ["seat"],
    });
    await kit.syncSubscriptionEntitlements({
      subscription: {
        id: "sub_fail_wh",
        customerId: "cus_fail_wh",
        planId: "price_monthly",
        status: "active",
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        provider: "stripe",
      },
    });
    await expect(kit.hasFeature("cus_fail_wh", "seat")).resolves.toBe(true);

    const failed = createMockStripePaymentIntentFailed({
      id: "pi_fail",
      customer: "cus_fail_wh",
    });
    const body = JSON.stringify({
      ...JSON.parse(failed.body),
      id: "evt_pi_fail",
      data: {
        object: {
          ...(JSON.parse(failed.body) as { data: { object: Record<string, unknown> } })
            .data.object,
          metadata: { subscription_id: "sub_fail_wh" },
        },
      },
    });
    const signed = createSignedStripeWebhookRequest({
      payload: body,
      secret: WEBHOOK_SECRET,
      asBuffer: true,
    });

    const result = await kit.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      jest.fn(),
    );
    expect(result.event.normalizedType).toBe("payment.failed");
    await expect(kit.hasFeature("cus_fail_wh", "seat")).resolves.toBe(false);
  });
});

describe("lifecycle / upgrades", () => {
  beforeEach(() => jest.clearAllMocks());

  it("upgrades the subscription price mid-cycle and re-provisions features", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let sim = createSimulatedSubscription(clock, {
      id: "sub_upgrade",
      customerId: "cus_upgrade",
      priceId: "price_basic",
      unitAmount: 1000,
    });

    const kit = billing();
    await kit.setPlanFeatures({
      planId: "price_basic",
      features: ["basic"],
    });
    await kit.setPlanFeatures({
      planId: "price_pro",
      features: ["basic", "sso"],
    });

    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    await kit.retrieveSubscription(sim.id);
    await expect(kit.hasFeature("cus_upgrade", "basic")).resolves.toBe(true);
    await expect(kit.hasFeature("cus_upgrade", "sso")).resolves.toBe(false);

    clock.advanceByDays(10);
    sim = upgradeSimulatedSubscription(sim, {
      priceId: "price_pro",
      unitAmount: 2900,
    });
    expect(sim.items[0]?.priceId).toBe("price_pro");
    expect(sim.metadata.upgradedFrom).toBe("price_basic");

    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const upgraded = await kit.retrieveSubscription(sim.id);
    expect(upgraded.planId).toBe("price_pro");
    expect(upgraded.status).toBe("active");
    await expect(kit.hasFeature("cus_upgrade", "sso")).resolves.toBe(true);

    // subscription.updated webhook also normalizes to activated
    const updatedEvent = createMockStripeSubscription(
      "customer.subscription.updated",
      {
        id: "sub_upgrade",
        customer: "cus_upgrade",
        status: "active",
      },
    );
    const signed = createSignedStripeWebhookRequest({
      payload: JSON.stringify({
        ...JSON.parse(updatedEvent.body),
        id: "evt_upgrade",
        created: clock.now,
      }),
      secret: WEBHOOK_SECRET,
      asBuffer: true,
    });
    const processed = await kit.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      jest.fn(),
    );
    expect(processed.event.normalizedType).toBe("subscription.activated");
  });
});

describe("lifecycle / multi-phase schedules", () => {
  it("moves trial → monthly → annual then ends", () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    let schedule = createSimulatedSchedule(clock, {
      id: "sched_growth",
      customerId: "cus_sched",
      phases: [
        { priceId: "price_trial", trial: true, intervalDays: 14, iterations: 1 },
        { priceId: "price_monthly", intervalDays: 30, iterations: 2 },
        { priceId: "price_annual", intervalDays: 365, iterations: 1 },
      ],
    });

    expect(schedule.subscription.status).toBe("trialing");
    expect(schedule.subscription.items[0]?.priceId).toBe("price_trial");
    expect(schedule.phaseIndex).toBe(0);

    // End trial → monthly phase 1
    schedule = advanceSchedulePhase(clock, schedule);
    expect(schedule.phaseIndex).toBe(1);
    expect(schedule.phaseIteration).toBe(1);
    expect(schedule.subscription.status).toBe("active");
    expect(schedule.subscription.items[0]?.priceId).toBe("price_monthly");

    // Second monthly iteration
    schedule = advanceSchedulePhase(clock, schedule);
    expect(schedule.phaseIndex).toBe(1);
    expect(schedule.phaseIteration).toBe(2);
    expect(schedule.subscription.items[0]?.priceId).toBe("price_monthly");

    // Annual phase
    schedule = advanceSchedulePhase(clock, schedule);
    expect(schedule.phaseIndex).toBe(2);
    expect(schedule.subscription.items[0]?.priceId).toBe("price_annual");

    // Schedule completes
    schedule = advanceSchedulePhase(clock, schedule);
    expect(schedule.subscription.status).toBe("canceled");
  });

  it("drives BillingKit retrieve across schedule phases", async () => {
    const clock = createTestClock(Date.UTC(2026, 5, 1));
    let schedule = createSimulatedSchedule(clock, {
      id: "sched_kit",
      customerId: "cus_sched_kit",
      phases: [
        { priceId: "price_a", intervalDays: 30, iterations: 1 },
        { priceId: "price_b", intervalDays: 30, iterations: 1 },
      ],
    });

    subscriptionsRetrieve.mockResolvedValue(
      toStripeSubscriptionObject(schedule.subscription),
    );
    const kit = billing();
    const first = await kit.retrieveSubscription(schedule.subscription.id);
    expect(first.planId).toBe("price_a");

    schedule = advanceSchedulePhase(clock, schedule);
    subscriptionsRetrieve.mockResolvedValue(
      toStripeSubscriptionObject(schedule.subscription),
    );
    const second = await kit.retrieveSubscription(schedule.subscription.id);
    expect(second.planId).toBe("price_b");
    expect(second.status).toBe("active");
  });
});

describe("lifecycle / combined multi-step scenario", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs trial → renew → fail → recover → upgrade → schedule cancel → cancel", async () => {
    const clock = createTestClock(Date.UTC(2026, 0, 1));
    const kit = billing();
    await kit.setPlanFeatures({
      planId: "price_starter",
      features: ["starter"],
    });
    await kit.setPlanFeatures({
      planId: "price_growth",
      features: ["starter", "growth"],
    });

    let sim = createSimulatedSubscription(clock, {
      id: "sub_journey",
      customerId: "cus_journey",
      priceId: "price_starter",
      trialDays: 7,
      intervalDays: 30,
      unitAmount: 1500,
    });

    subscriptionsCreate.mockResolvedValue(toStripeSubscriptionObject(sim));
    const created = await kit.createSubscription({
      customerId: "cus_journey",
      planId: "price_starter",
      trialDays: 7,
    });
    expect(created.providerStatus).toBe("trialing");

    // Trial ends
    clock.advanceTo(sim.trialEnd!);
    sim = syncSubscriptionToClock(sim, clock);
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    expect((await kit.retrieveSubscription(sim.id)).status).toBe("active");

    // First paid renewal
    clock.advanceTo(sim.currentPeriodEnd);
    sim = renewSimulatedSubscription(sim, clock, 30);
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    expect((await kit.retrieveSubscription(sim.id)).status).toBe("active");

    // Payment fails on next cycle attempt
    sim = failSimulatedPayment(sim);
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    expect((await kit.retrieveSubscription(sim.id)).status).toBe("past_due");

    // Customer updates card / invoice paid
    sim = recoverSimulatedPayment(sim);
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    expect((await kit.retrieveSubscription(sim.id)).status).toBe("active");

    // Upgrade
    sim = upgradeSimulatedSubscription(sim, {
      priceId: "price_growth",
      unitAmount: 4900,
    });
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const upgraded = await kit.retrieveSubscription(sim.id);
    expect(upgraded.planId).toBe("price_growth");
    await expect(kit.hasFeature("cus_journey", "growth")).resolves.toBe(true);

    // Pause then resume
    sim = pauseSimulatedSubscription(sim);
    subscriptionsUpdate.mockResolvedValueOnce(toStripeSubscriptionObject(sim));
    expect((await kit.pauseSubscription({ subscriptionId: sim.id })).status).toBe(
      "paused",
    );

    sim = resumeSimulatedSubscription(sim, clock);
    subscriptionsUpdate.mockResolvedValueOnce(toStripeSubscriptionObject(sim));
    expect((await kit.resumeSubscription(sim.id)).status).toBe("active");

    // Schedule cancel at period end, then clock cancels
    sim = scheduleSimulatedCancellation(sim);
    subscriptionsUpdate.mockResolvedValueOnce(toStripeSubscriptionObject(sim));
    const scheduled = await kit.scheduleCancellation(sim.id);
    expect(scheduled.cancelAtPeriodEnd).toBe(true);

    clock.advanceTo(sim.currentPeriodEnd);
    sim = syncSubscriptionToClock(sim, clock);
    expect(sim.status).toBe("canceled");
    subscriptionsRetrieve.mockResolvedValue(toStripeSubscriptionObject(sim));
    const ended = await kit.retrieveSubscription(sim.id);
    expect(ended.status).toBe("cancelled");
    expect(ended.providerStatus).toBe("canceled");
  });
});
