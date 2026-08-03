import { createHash } from "crypto";
import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { WebhookEventRepository } from "../interfaces/WebhookEventRepository";
import type {
  CompleteWebhookProcessingInput,
  ProcessWebhookResult,
  RawWebhookRequest,
  VerifyAndClaimWebhookResult,
  WebhookEvent,
  WebhookEventHandler,
  WebhookEventRecord,
} from "../types/webhook";
import { resolveDedupeEventId } from "./raw-body";

export class WebhookService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repository: WebhookEventRepository,
  ) {}

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.gateway.verifyWebhook(payload, signature);
  }

  /**
   * Verify the signature, resolve the dedupe event id, and claim the event.
   * Does not run the business handler — use for fast-ack then process flows.
   */
  async verifyAndClaimWebhook(
    request: RawWebhookRequest,
  ): Promise<VerifyAndClaimWebhookResult> {
    const started = Date.now();
    const event = this.verifyWebhook(request.rawBody, request.signature);
    const eventId = resolveDedupeEventId({
      provider: event.provider === "stripe" ? "stripe" : "razorpay",
      request,
      event,
      fingerprint: fingerprintWebhookPayload,
    });
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
    const durationMs = Date.now() - started;

    if (claim.outcome !== "claimed") {
      return {
        event,
        record: {
          ...claim.record,
          durationMs: claim.record.durationMs ?? durationMs,
        },
        duplicate: claim.outcome === "duplicate",
        outOfOrder: claim.outcome === "out_of_order",
        shouldHandle: false,
        durationMs,
      };
    }

    return {
      event,
      record: claim.record,
      duplicate: false,
      outOfOrder: false,
      shouldHandle: true,
      durationMs,
    };
  }

  async completeWebhookProcessing(
    record: WebhookEventRecord,
    outcome: CompleteWebhookProcessingInput,
  ): Promise<WebhookEventRecord> {
    const processedAt = new Date();
    const durationMs = processedAt.getTime() - record.receivedAt.getTime();
    return this.repository.save({
      ...record,
      status: outcome.status,
      processedAt,
      durationMs,
      error:
        outcome.status === "failed"
          ? outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error)
          : undefined,
    });
  }

  async processWebhook(
    request: RawWebhookRequest,
    handler: WebhookEventHandler,
  ): Promise<ProcessWebhookResult> {
    const claim = await this.verifyAndClaimWebhook(request);

    if (!claim.shouldHandle) {
      return {
        event: claim.event,
        record: claim.record,
        duplicate: claim.duplicate,
        outOfOrder: claim.outOfOrder,
        durationMs: claim.durationMs,
      };
    }

    try {
      await handler(claim.event);
      const processed = await this.completeWebhookProcessing(claim.record, {
        status: "processed",
      });
      return {
        event: claim.event,
        record: processed,
        duplicate: false,
        outOfOrder: false,
        durationMs: processed.durationMs,
      };
    } catch (error) {
      await this.completeWebhookProcessing(claim.record, {
        status: "failed",
        error,
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

/** Stable dedupe key when the provider does not send an event id (Razorpay). */
export function fingerprintWebhookPayload(payload: string | Buffer): string {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}
