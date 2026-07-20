import { BillingKit } from "../src/core/BillingKit";
import { InMemoryRetryAttemptRepository } from "../src/repositories";
import {
  InvalidRetryStateError,
  RetryService,
} from "../src/retry";
import type { RetryLifecycleEvent } from "../src/types/retry";

const DAY = 24 * 60 * 60 * 1000;

describe("RetryService state transitions", () => {
  it("pending → failed → retrying on first failure", async () => {
    const hooks: RetryLifecycleEvent["hook"][] = [];
    const service = new RetryService(
      new InMemoryRetryAttemptRepository(),
      {
        maxRetries: 3,
        retryIntervalsMs: [DAY, 3 * DAY, 5 * DAY],
        gracePeriodMs: 7 * DAY,
      },
      {
        onPaymentFailed: async (e) => {
          hooks.push(e.hook);
        },
        onRetryScheduled: async (e) => {
          hooks.push(e.hook);
        },
        onRecoveryEmail: async (e) => {
          hooks.push(e.hook);
        },
        onRecoveryWebhook: async (e) => {
          hooks.push(e.hook);
        },
      },
    );

    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const pending = await service.openAttempt({
      kind: "payment",
      referenceId: "pi_1",
      amount: 2900,
      currency: "usd",
      now: t0,
    });
    expect(pending.status).toBe("pending");
    expect(pending.attemptCount).toBe(0);

    const scheduled = await service.reportFailure({
      kind: "payment",
      referenceId: "pi_1",
      reason: "card_declined",
      now: t0,
    });

    expect(scheduled.status).toBe("retrying");
    expect(scheduled.attemptCount).toBe(1);
    expect(scheduled.nextRetryAt?.toISOString()).toBe(
      new Date(t0.getTime() + DAY).toISOString(),
    );
    expect(hooks).toEqual([
      "onPaymentFailed",
      "onRetryScheduled",
      "onRecoveryEmail",
      "onRecoveryWebhook",
    ]);
  });

  it("retries until max then enters grace, then uncollectible", async () => {
    const service = new RetryService(new InMemoryRetryAttemptRepository(), {
      maxRetries: 2,
      retryIntervalsMs: [1000, 2000],
      gracePeriodMs: 5000,
    });

    const t0 = new Date("2026-02-01T00:00:00.000Z");

    let attempt = await service.reportFailure({
      kind: "invoice",
      referenceId: "inv_1",
      now: t0,
    });
    expect(attempt.status).toBe("retrying");
    expect(attempt.attemptCount).toBe(1);

    attempt = await service.reportFailure({
      kind: "invoice",
      referenceId: "inv_1",
      now: new Date(t0.getTime() + 1000),
    });
    expect(attempt.status).toBe("retrying");
    expect(attempt.attemptCount).toBe(2);

    attempt = await service.reportFailure({
      kind: "invoice",
      referenceId: "inv_1",
      now: new Date(t0.getTime() + 3000),
    });
    expect(attempt.status).toBe("failed");
    expect(attempt.attemptCount).toBe(3);
    expect(attempt.graceEndsAt).toBeDefined();
    expect(attempt.nextRetryAt).toBeUndefined();

    const dueBeforeGrace = await service.processDueRetries(
      new Date(t0.getTime() + 4000),
    );
    expect(dueBeforeGrace).toHaveLength(0);

    await service.processDueRetries(new Date(t0.getTime() + 3000 + 5000));
    const final = await service.getAttemptByReference("inv_1", "invoice");
    expect(final?.status).toBe("uncollectible");
  });

  it("recovers from retrying and fires onPaymentRecovered", async () => {
    const recoveredHooks: string[] = [];
    const service = new RetryService(
      new InMemoryRetryAttemptRepository(),
      { maxRetries: 3, retryIntervalsMs: [1000], gracePeriodMs: 0 },
      {
        onPaymentRecovered: async (e) => {
          recoveredHooks.push(e.previousStatus ?? "");
        },
      },
    );

    await service.reportFailure({
      kind: "payment",
      referenceId: "pi_rec",
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    const recovered = await service.reportRecovered({
      referenceId: "pi_rec",
      kind: "payment",
    });

    expect(recovered.status).toBe("recovered");
    expect(recovered.nextRetryAt).toBeUndefined();
    expect(recoveredHooks).toEqual(["retrying"]);
  });

  it("marks uncollectible immediately when gracePeriodMs is 0", async () => {
    const service = new RetryService(new InMemoryRetryAttemptRepository(), {
      maxRetries: 1,
      retryIntervalsMs: [100],
      gracePeriodMs: 0,
    });

    const t0 = new Date("2026-04-01T00:00:00.000Z");
    await service.reportFailure({
      kind: "payment",
      referenceId: "pi_u",
      now: t0,
    });

    const done = await service.reportFailure({
      kind: "payment",
      referenceId: "pi_u",
      now: new Date(t0.getTime() + 100),
    });

    expect(done.status).toBe("uncollectible");
  });

  it("rejects recovery of uncollectible attempts", async () => {
    const service = new RetryService(new InMemoryRetryAttemptRepository(), {
      maxRetries: 0,
      retryIntervalsMs: [],
      gracePeriodMs: 0,
    });

    await service.reportFailure({
      kind: "payment",
      referenceId: "pi_bad",
      now: new Date(),
    });

    await expect(
      service.reportRecovered({ referenceId: "pi_bad" }),
    ).rejects.toBeInstanceOf(InvalidRetryStateError);
  });

  it("lists due retries via processDueRetries", async () => {
    const service = new RetryService(new InMemoryRetryAttemptRepository(), {
      maxRetries: 3,
      retryIntervalsMs: [10_000],
      gracePeriodMs: 7 * DAY,
    });

    const t0 = new Date("2026-05-01T00:00:00.000Z");
    await service.reportFailure({
      kind: "payment",
      referenceId: "pi_due",
      now: t0,
    });

    const notYet = await service.processDueRetries(new Date(t0.getTime() + 5_000));
    expect(notYet).toHaveLength(0);

    const due = await service.processDueRetries(new Date(t0.getTime() + 10_000));
    expect(due).toHaveLength(1);
    expect(due[0]?.referenceId).toBe("pi_due");
  });
});

describe("BillingKit retry integration", () => {
  it("syncs invoice status through failure and recovery", async () => {
    const emails: string[] = [];
    const webhooks: string[] = [];

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      retry: {
        maxRetries: 2,
        retryIntervalsMs: [1000, 2000],
        gracePeriodMs: 7 * DAY,
      },
      retryHooks: {
        onRecoveryEmail: async (e) => {
          emails.push(e.attempt.status);
        },
        onRecoveryWebhook: async (e) => {
          webhooks.push(e.hook);
        },
      },
    });

    const invoice = await billing.generateInvoice({
      customer: { name: "Ada" },
      billingAddress: {
        line1: "1 Main",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Plan", quantity: 1, unitAmount: 10000 }],
      taxType: "none",
    });

    await billing.openBillingAttempt({
      kind: "invoice",
      referenceId: invoice.id,
      amount: invoice.total,
      currency: invoice.currency,
    });

    let synced = await billing.getInvoice(invoice.id);
    expect(synced?.status).toBe("pending");

    await billing.reportBillingFailure({
      kind: "invoice",
      referenceId: invoice.id,
      reason: "insufficient_funds",
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    synced = await billing.getInvoice(invoice.id);
    expect(synced?.status).toBe("retrying");
    expect(emails).toContain("retrying");
    expect(webhooks).toContain("onRecoveryWebhook");

    await billing.reportBillingRecovered({
      referenceId: invoice.id,
      kind: "invoice",
    });

    synced = await billing.getInvoice(invoice.id);
    expect(synced?.status).toBe("recovered");
  });
});
