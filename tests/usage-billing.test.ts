import { BillingKit } from "../src/core/BillingKit";
import { InMemoryUsageEventRepository } from "../src/repositories";
import {
  UsageBillingError,
  UsageBillingService,
} from "../src/usage";
import type { UsageAggregate, UsagePrice } from "../src/types/usage";

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("UsageBillingService", () => {
  let service: UsageBillingService;

  beforeEach(() => {
    service = new UsageBillingService(new InMemoryUsageEventRepository());
  });

  async function recordFixture(): Promise<void> {
    await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "api_calls",
      quantity: 10,
      timestamp: date("2026-07-01"),
      subscriptionId: "sub_1",
    });
    await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "api_calls",
      quantity: 5,
      timestamp: new Date("2026-07-01T12:00:00.000Z"),
      subscriptionId: "sub_1",
    });
    await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "api_calls",
      quantity: 7,
      timestamp: date("2026-07-02"),
      subscriptionId: "sub_1",
    });
    await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "storage_gb",
      quantity: 3,
      timestamp: date("2026-07-02"),
      subscriptionId: "sub_1",
    });
    await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "api_calls",
      quantity: 20,
      timestamp: date("2026-08-01"),
      subscriptionId: "sub_1",
    });
  }

  it("records and lists usage events", async () => {
    const event = await service.recordUsageEvent({
      customerId: "cus_1",
      meter: "emails",
      quantity: 25,
      timestamp: date("2026-07-01"),
      metadata: { source: "campaign" },
    });

    expect(event.id).toMatch(/^uevt_/);
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(await service.getUsageEvent(event.id)).toEqual(event);
    await expect(
      service.recordUsageEvent({
        customerId: "cus_1",
        meter: "emails",
        quantity: -1,
      }),
    ).rejects.toThrow(UsageBillingError);
  });

  it("aggregates usage into daily buckets", async () => {
    await recordFixture();

    const totals = await service.aggregateUsage({
      customerId: "cus_1",
      meter: "api_calls",
      subscriptionId: "sub_1",
      period: "day",
      from: date("2026-07-01"),
      to: date("2026-07-03"),
    });

    expect(totals).toHaveLength(2);
    expect(
      totals.map(({ periodStart, quantity, eventCount }) => ({
        periodStart: periodStart.toISOString(),
        quantity,
        eventCount,
      })),
    ).toEqual([
      {
        periodStart: "2026-07-01T00:00:00.000Z",
        quantity: 15,
        eventCount: 2,
      },
      {
        periodStart: "2026-07-02T00:00:00.000Z",
        quantity: 7,
        eventCount: 1,
      },
    ]);
  });

  it("aggregates usage by month and billing cycle", async () => {
    await recordFixture();

    const monthly = await service.aggregateUsage({
      customerId: "cus_1",
      meter: "api_calls",
      period: "month",
      from: date("2026-07-01"),
      to: date("2026-09-01"),
    });
    const cycle = await service.aggregateUsage({
      customerId: "cus_1",
      meter: ["api_calls", "storage_gb"],
      period: "billing_cycle",
      from: date("2026-07-01"),
      to: date("2026-07-03"),
    });

    expect(monthly.map((total) => total.quantity)).toEqual([22, 20]);
    expect(cycle).toEqual([
      expect.objectContaining({
        meter: "api_calls",
        quantity: 22,
        periodStart: date("2026-07-01"),
        periodEnd: date("2026-07-03"),
      }),
      expect.objectContaining({
        meter: "storage_gb",
        quantity: 3,
      }),
    ]);
  });

  it("supports max and last meter aggregation", async () => {
    await recordFixture();

    const max = await service.aggregateUsage({
      customerId: "cus_1",
      meter: "api_calls",
      period: "billing_cycle",
      aggregationMethod: "max",
      from: date("2026-07-01"),
      to: date("2026-07-03"),
    });
    const last = await service.aggregateUsage({
      customerId: "cus_1",
      meter: "api_calls",
      period: "billing_cycle",
      aggregationMethod: "last",
      from: date("2026-07-01"),
      to: date("2026-07-03"),
    });

    expect(max[0].quantity).toBe(10);
    expect(last[0].quantity).toBe(7);
  });

  it("prices per-unit, metered, and tiered usage", () => {
    const aggregates: UsageAggregate[] = [
      aggregate("api_calls", 150),
      aggregate("seats", 4),
      aggregate("storage_gb", 10),
    ];
    const prices: UsagePrice[] = [
      {
        type: "tiered",
        meter: "api_calls",
        currency: "usd",
        tiers: [
          { upTo: 100, unitAmount: 10 },
          { upTo: "inf", unitAmount: 5 },
        ],
      },
      {
        type: "per_unit",
        meter: "seats",
        currency: "usd",
        unitAmount: 500,
      },
      {
        type: "metered",
        meter: "storage_gb",
        currency: "usd",
        unitAmount: 25,
      },
    ];

    const priced = service.priceUsage(aggregates, prices);
    const lines = service.usageToInvoiceLineItems({ aggregates, prices });

    expect(priced.map((row) => row.amount)).toEqual([1250, 2000, 250]);
    expect(lines).toHaveLength(4);
    expect(
      lines.reduce(
        (total, line) => total + line.quantity * line.unitAmount,
        0,
      ),
    ).toBe(3500);
  });
});

describe("BillingKit usage invoices", () => {
  it("maps billing-cycle usage into an invoice", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "usd",
      tax: { enabled: false },
    });

    await billing.recordUsageEvent({
      customerId: "cus_usage",
      meter: "api_calls",
      quantity: 80,
      timestamp: date("2026-07-01"),
    });
    await billing.recordUsageEvent({
      customerId: "cus_usage",
      meter: "api_calls",
      quantity: 70,
      timestamp: date("2026-07-15"),
    });

    const result = await billing.generateUsageInvoice({
      usage: {
        customerId: "cus_usage",
        meter: "api_calls",
        period: "billing_cycle",
        from: date("2026-07-01"),
        to: date("2026-08-01"),
      },
      prices: [
        {
          type: "tiered",
          meter: "api_calls",
          currency: "usd",
          description: "API calls",
          tiers: [
            { upTo: 100, unitAmount: 10 },
            { upTo: "inf", unitAmount: 5 },
          ],
        },
      ],
      customer: { id: "cus_usage", name: "Usage Customer" },
      billingAddress: {
        line1: "1 Meter Way",
        city: "San Francisco",
        state: "CA",
        postalCode: "94105",
        country: "US",
      },
      currency: "usd",
      taxMode: "none",
    });

    expect(result.aggregates[0].quantity).toBe(150);
    expect(result.lineItems).toHaveLength(2);
    expect(result.invoice.subtotal).toBe(1250);
    expect(result.invoice.total).toBe(1250);
    expect(result.invoice.currency).toBe("usd");
  });
});

function aggregate(meter: string, quantity: number): UsageAggregate {
  return {
    customerId: "cus_1",
    meter,
    period: "billing_cycle",
    aggregationMethod: "sum",
    periodStart: date("2026-07-01"),
    periodEnd: date("2026-08-01"),
    quantity,
    eventCount: 1,
  };
}
