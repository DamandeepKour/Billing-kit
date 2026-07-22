import type { BillingKitError } from "../utils/errors";
import type {
  BillingObservabilityEvent,
  BillingObservabilityEventName,
  BillingObservabilityHooks,
  Logger,
  OperationObservability,
  StructuredLogFields,
} from "../types/observability";
import { NoopLogger } from "./ConsoleLogger";

export interface TimedOperationInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId?: string;
  webhookEventId?: string;
  retryCount?: number;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export class ObservabilityService {
  constructor(
    private readonly logger: Logger = new NoopLogger(),
    private readonly hooks: BillingObservabilityHooks = {},
    private readonly provider?: string,
  ) {}

  getLogger(): Logger {
    return this.logger;
  }

  async emit(event: BillingObservabilityEvent): Promise<void> {
    const fields: StructuredLogFields = {
      event: event.name,
      provider: event.provider ?? this.provider,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action: event.action,
      requestId: event.requestId,
      webhookEventId: event.webhookEventId,
      retryCount: event.retryCount,
      durationMs: event.durationMs,
      outcome: event.outcome,
      errorCode: event.error?.code,
      correlationId: event.correlationId,
      ...(event.metadata ?? {}),
    };

    if (event.outcome === "failure" || event.name.endsWith(".failed")) {
      this.logger.error(event.name, {
        ...fields,
        errorMessage: event.error?.message,
      });
    } else {
      this.logger.info(event.name, fields);
    }

    await Promise.resolve(this.hooks.onEvent?.(event)).catch(() => undefined);
    if (event.outcome === "success") {
      await Promise.resolve(this.hooks.onSuccess?.(event)).catch(
        () => undefined,
      );
    } else if (event.outcome === "failure") {
      await Promise.resolve(this.hooks.onFailure?.(event)).catch(
        () => undefined,
      );
    }
  }

  async timed<T>(
    input: TimedOperationInput,
    run: () => Promise<T>,
  ): Promise<{ result: T; observability: OperationObservability }> {
    const started = Date.now();
    const correlationId = input.correlationId ?? generateCorrelationId();
    await this.emit({
      name: "operation.started",
      timestamp: new Date(),
      provider: this.provider,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      requestId: input.requestId,
      webhookEventId: input.webhookEventId,
      retryCount: input.retryCount,
      correlationId,
      metadata: input.metadata,
    });

    try {
      const result = await run();
      const durationMs = Date.now() - started;
      const observability: OperationObservability = {
        requestId: input.requestId,
        webhookEventId: input.webhookEventId,
        retryCount: input.retryCount,
        durationMs,
        correlationId,
      };
      await this.emit({
        name: "operation.succeeded",
        timestamp: new Date(),
        provider: this.provider,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        action: input.action,
        outcome: "success",
        ...observability,
        metadata: input.metadata,
      });
      return { result, observability };
    } catch (error) {
      const durationMs = Date.now() - started;
      const requestId =
        input.requestId ?? extractRequestId(error) ?? undefined;
      const observability: OperationObservability = {
        requestId,
        webhookEventId: input.webhookEventId,
        retryCount: input.retryCount,
        durationMs,
        correlationId,
      };
      await this.emit({
        name: "operation.failed",
        timestamp: new Date(),
        provider: this.provider,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        action: input.action,
        outcome: "failure",
        ...observability,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: extractErrorCode(error),
        },
        metadata: input.metadata,
      });
      throw error;
    }
  }

  async trackWebhook(options: {
    name: Extract<
      BillingObservabilityEventName,
      "webhook.processed" | "webhook.failed" | "webhook.duplicate"
    >;
    webhookEventId: string;
    resourceType?: string;
    resourceId?: string;
    durationMs?: number;
    outcome?: "success" | "failure";
    error?: { message: string; code?: string };
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.emit({
      name: options.name,
      timestamp: new Date(),
      provider: this.provider,
      resourceType: options.resourceType ?? "webhook",
      resourceId: options.resourceId ?? options.webhookEventId,
      webhookEventId: options.webhookEventId,
      durationMs: options.durationMs,
      outcome: options.outcome,
      error: options.error,
      metadata: options.metadata,
    });
  }
}

function extractRequestId(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Partial<BillingKitError>;
  return typeof candidate.requestId === "string"
    ? candidate.requestId
    : undefined;
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown };
  return typeof candidate.code === "string" ? candidate.code : undefined;
}

function generateCorrelationId(): string {
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
