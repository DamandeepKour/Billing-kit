import { createHash } from "crypto";
import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { WebhookEventRepository } from "../interfaces/WebhookEventRepository";
import type {
  ProcessWebhookResult,
  RawWebhookRequest,
  WebhookEvent,
  WebhookEventHandler,
  WebhookEventRecord,
} from "../types/webhook";

export class WebhookService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repository: WebhookEventRepository,
  ) {}

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.gateway.verifyWebhook(payload, signature);
  }

  async processWebhook(
    request: RawWebhookRequest,
    handler: WebhookEventHandler,
  ): Promise<ProcessWebhookResult> {
    const event = this.verifyWebhook(request.rawBody, request.signature);
    const eventId =
      request.eventId ??
      (event.provider === "razorpay"
        ? fingerprint(request.rawBody)
        : event.id);
    const receivedAt = request.receivedAt ?? new Date();
    const claim = await this.repository.claim({
      eventId,
      provider: event.provider,
      receivedAt,
      status: "processing",
      eventType: event.type,
      resourceType: event.entity.kind,
      resourceId: event.entity.id,
      occurredAt: event.occurredAt,
    });

    if (claim.outcome !== "claimed") {
      return {
        event,
        record: claim.record,
        duplicate: claim.outcome === "duplicate",
        outOfOrder: claim.outcome === "out_of_order",
      };
    }

    try {
      await handler(event);
      const processed = await this.repository.save({
        ...claim.record,
        status: "processed",
        processedAt: new Date(),
      });
      return {
        event,
        record: processed,
        duplicate: false,
        outOfOrder: false,
      };
    } catch (error) {
      await this.repository.save({
        ...claim.record,
        status: "failed",
        processedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  createRawWebhookHandler(
    handler: WebhookEventHandler,
  ): (request: RawWebhookRequest) => Promise<ProcessWebhookResult> {
    return (request) => this.processWebhook(request, handler);
  }

  listWebhookEvents(): Promise<WebhookEventRecord[]> {
    return this.repository.list();
  }
}

export class WebhookServiceFactory {
  static create(
    gateway: PaymentGateway,
    repository: WebhookEventRepository,
  ): WebhookService {
    return new WebhookService(gateway, repository);
  }
}

function fingerprint(payload: string | Buffer): string {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}
