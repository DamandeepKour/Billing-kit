import { AuditLogService } from "../src/audit";
import { BillingKit } from "../src/core/BillingKit";
import { InMemoryAuditLogRepository } from "../src/repositories";
import { maskSensitiveFields, summarizePayload } from "../src/utils/mask";

describe("maskSensitiveFields", () => {
  it("masks secrets, tokens, and card-like values", () => {
    const masked = maskSensitiveFields({
      amount: 5000,
      secretKey: "sk_live_abcdefghijklmnop",
      webhookSecret: "whsec_1234567890",
      nested: {
        authorization: "Bearer super-secret-token",
        cardNumber: "4242424242424242",
      },
      note: "paid with 4111 1111 1111 1111",
    });

    expect(masked.amount).toBe(5000);
    expect(masked.secretKey).toMatch(/\*+[a-z0-9]{4}$/i);
    expect(masked.webhookSecret).toMatch(/\*+\d{4}$/);
    expect(masked.nested.authorization).toMatch(/\*+/);
    expect(masked.nested.cardNumber).not.toContain("4242424242424242");
    expect(masked.note).not.toContain("4111111111111111");
  });

  it("summarizes payloads with masking applied", () => {
    expect(
      summarizePayload({
        api_key: "key_abc12345",
        status: "succeeded",
      }),
    ).toEqual({
      api_key: expect.stringMatching(/\*+/),
      status: "succeeded",
    });
  });
});

describe("AuditLogService", () => {
  it("records events and returns them in chronological order", async () => {
    const repo = new InMemoryAuditLogRepository();
    const service = new AuditLogService(repo, "stripe");

    const first = await service.recordBillingEvent({
      action: "invoice.created",
      resourceType: "invoice",
      resourceId: "inv_1",
      payload: { total: 1000 },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await service.recordBillingEvent({
      action: "invoice.status_updated",
      resourceType: "invoice",
      resourceId: "inv_1",
      payload: { status: "paid" },
    });

    const timeline = await service.getInvoiceTimeline("inv_1");
    expect(timeline.map((e) => e.id)).toEqual([first.id, second.id]);
    expect(timeline[0].timestamp.getTime()).toBeLessThanOrEqual(
      timeline[1].timestamp.getTime(),
    );
    expect(first.id).toMatch(/^aud_/);
    expect(first.provider).toBe("stripe");
    expect(first.actor.type).toBe("system");
  });

  it("builds payment audit logs including related refunds", async () => {
    const service = new AuditLogService(new InMemoryAuditLogRepository(), "razorpay");

    await service.recordBillingEvent({
      action: "payment.attempted",
      resourceType: "payment",
      resourceId: "pay_1",
      payload: { amount: 5000, secretKey: "should-not-leak" },
    });
    await service.recordBillingEvent({
      action: "refund.created",
      resourceType: "refund",
      resourceId: "rfnd_1",
      relatedResourceIds: ["pay_1"],
      payload: { paymentId: "pay_1", amount: 1000 },
    });

    const log = await service.getPaymentAuditLog("pay_1");
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.action)).toEqual([
      "payment.attempted",
      "refund.created",
    ]);
    expect(log[0].payloadSummary.secretKey).not.toBe("should-not-leak");
  });
});

describe("BillingKit audit trail", () => {
  it("auto-records invoice creation and status updates on a timeline", async () => {
    const auditLogRepository = new InMemoryAuditLogRepository();
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      auditLogRepository,
      auditActor: { type: "api", id: "svc_billing" },
    });

    const invoice = await billing.generateInvoice({
      customer: { name: "Ada", email: "ada@example.com" },
      billingAddress: {
        line1: "1 Main St",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Plan", quantity: 1, unitAmount: 1000 }],
    });
    await billing.updateInvoiceStatus(invoice.id, "paid");
    await billing.recordBillingEvent({
      action: "billing.event",
      resourceType: "invoice",
      resourceId: invoice.id,
      payload: { note: "manual reconciliation" },
    });

    const timeline = await billing.getInvoiceTimeline(invoice.id);
    expect(timeline.map((e) => e.action)).toEqual([
      "invoice.created",
      "invoice.status_updated",
      "billing.event",
    ]);
    expect(timeline.every((e) => e.actor.id === "svc_billing" || e.actor.type === "api")).toBe(
      true,
    );
    expect(timeline[0].payloadSummary.total).toBeDefined();
  });

  it("orders mixed payment and refund audit events by timestamp", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    await billing.recordBillingEvent({
      action: "payment.attempted",
      resourceType: "payment",
      resourceId: "pay_order",
      payload: { amount: 2000 },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await billing.recordBillingEvent({
      action: "payment.captured",
      resourceType: "payment",
      resourceId: "pay_order",
      payload: { amount: 2000 },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await billing.recordBillingEvent({
      action: "refund.created",
      resourceType: "refund",
      resourceId: "rfnd_order",
      relatedResourceIds: ["pay_order"],
      payload: { paymentId: "pay_order", amount: 500 },
    });

    const log = await billing.getPaymentAuditLog("pay_order");
    expect(log.map((e) => e.action)).toEqual([
      "payment.attempted",
      "payment.captured",
      "refund.created",
    ]);
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        log[i - 1].timestamp.getTime(),
      );
    }
  });

  it("records tax calculations and webhook receipts", async () => {
    const auditLogRepository = new InMemoryAuditLogRepository();
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      webhookSecret: "whsec_test",
      auditLogRepository,
    });

    billing.calculateTax({
      amount: 10000,
      taxType: "vat",
      rate: 20,
      country: "GB",
    });

    await new Promise((resolve) => setImmediate(resolve));

    const taxEvents = await billing.listAuditEvents({ action: "tax.calculated" });
    expect(taxEvents.length).toBeGreaterThanOrEqual(1);
    expect(taxEvents[0].payloadSummary.totalTax).toBeDefined();

    await billing.recordBillingEvent({
      action: "webhook.received",
      resourceType: "webhook",
      resourceId: "evt_1",
      actor: { type: "webhook", id: "stripe" },
      relatedResourceIds: ["pay_1"],
      payload: {
        type: "payment_intent.succeeded",
        normalizedType: "payment.captured",
        entityId: "pay_1",
      },
    });

    const webhooks = await billing.listAuditEvents({ resourceType: "webhook" });
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].relatedResourceIds).toContain("pay_1");
  });
});
