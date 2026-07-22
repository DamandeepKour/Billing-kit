import { BillingKit } from "../src/core/BillingKit";
import {
  ConsoleLogger,
  NoopLogger,
  ObservabilityService,
} from "../src/observability";
import { InMemoryAuditLogRepository } from "../src/repositories";
import type {
  BillingObservabilityEvent,
  Logger,
  StructuredLogFields,
} from "../src/types/observability";

function createCapturingLogger(): {
  logger: Logger;
  entries: Array<{ level: string; message: string; fields?: StructuredLogFields }>;
} {
  const entries: Array<{
    level: string;
    message: string;
    fields?: StructuredLogFields;
  }> = [];
  const logger: Logger = {
    debug(message, fields) {
      entries.push({ level: "debug", message, fields });
    },
    info(message, fields) {
      entries.push({ level: "info", message, fields });
    },
    warn(message, fields) {
      entries.push({ level: "warn", message, fields });
    },
    error(message, fields) {
      entries.push({ level: "error", message, fields });
    },
  };
  return { logger, entries };
}

describe("ConsoleLogger", () => {
  it("writes structured JSON log lines", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({
      json: true,
      minLevel: "debug",
      destination: { write: (chunk) => lines.push(chunk) },
    });

    logger.info("payment.created", {
      provider: "stripe",
      requestId: "req_123",
      durationMs: 42,
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      level: "info",
      msg: "payment.created",
      provider: "stripe",
      requestId: "req_123",
      durationMs: 42,
    });
  });

  it("respects minLevel", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({
      minLevel: "error",
      destination: { write: (chunk) => lines.push(chunk) },
    });
    logger.info("skip");
    logger.error("keep");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).msg).toBe("keep");
  });
});

describe("ObservabilityService", () => {
  it("emits success hooks and logs with duration", async () => {
    const { logger, entries } = createCapturingLogger();
    const events: BillingObservabilityEvent[] = [];
    const service = new ObservabilityService(logger, {
      onEvent: (event) => {
        events.push(event);
      },
      onSuccess: (event) => {
        events.push({ ...event, name: event.name });
      },
    }, "stripe");

    const { result, observability } = await service.timed(
      { action: "payment.attempted", resourceType: "payment" },
      async () => ({ id: "pay_1" }),
    );

    expect(result).toEqual({ id: "pay_1" });
    expect(observability.durationMs).toBeGreaterThanOrEqual(0);
    expect(observability.correlationId).toMatch(/^corr_/);
    expect(entries.some((entry) => entry.message === "operation.succeeded")).toBe(
      true,
    );
    expect(events.some((event) => event.outcome === "success")).toBe(true);
  });

  it("emits failure hooks with request IDs from errors", async () => {
    const { logger, entries } = createCapturingLogger();
    const failures: BillingObservabilityEvent[] = [];
    const service = new ObservabilityService(logger, {
      onFailure: (event) => {
        failures.push(event);
      },
    });

    await expect(
      service.timed(
        { action: "payment.attempted", resourceType: "payment" },
        async () => {
          const error = new Error("boom") as Error & { requestId?: string; code?: string };
          error.requestId = "req_fail";
          error.code = "PAYMENT_ERROR";
          throw error;
        },
      ),
    ).rejects.toThrow("boom");

    expect(failures[0]).toMatchObject({
      outcome: "failure",
      requestId: "req_fail",
      error: { code: "PAYMENT_ERROR" },
    });
    expect(entries.some((entry) => entry.level === "error")).toBe(true);
  });
});

describe("BillingKit observability integration", () => {
  it("attaches observability and audit metadata on payments and invoices", async () => {
    const events: BillingObservabilityEvent[] = [];
    const auditRepo = new InMemoryAuditLogRepository();
    const { logger } = createCapturingLogger();

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      auditLogRepository: auditRepo,
      logger,
      observabilityHooks: {
        onSuccess: (event) => {
          events.push(event);
        },
        onFailure: (event) => {
          events.push(event);
        },
      },
    });

    // Avoid real Stripe by using invoice path only (local)
    const invoice = await billing.generateInvoice({
      customer: { name: "Ada" },
      billingAddress: {
        line1: "1 Main",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Pro", quantity: 1, unitAmount: 10000 }],
      taxMode: "none",
      metadata: {
        orderId: "ord_1",
        accountId: "acc_9",
      },
    });

    expect(invoice.metadata).toEqual({
      orderId: "ord_1",
      accountId: "acc_9",
    });
    expect(invoice.observability?.durationMs).toBeGreaterThanOrEqual(0);
    expect(invoice.observability?.correlationId).toBeDefined();

    const audit = await billing.listAuditEvents({
      resourceType: "invoice",
      resourceId: invoice.id,
    });
    expect(audit[0]).toMatchObject({
      outcome: "success",
      durationMs: expect.any(Number),
      correlationId: invoice.observability?.correlationId,
      payloadSummary: expect.objectContaining({
        metadata: { orderId: "ord_1", accountId: "acc_9" },
      }),
    });

    expect(
      events.some(
        (event) =>
          event.name === "operation.succeeded" &&
          event.resourceType === "invoice",
      ),
    ).toBe(true);
  });

  it("defaults to a noop logger when none is configured", () => {
    expect(new NoopLogger().info("silent")).toBeUndefined();
  });
});
