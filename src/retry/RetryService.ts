import type { RetryAttemptRepository } from "../interfaces/RetryAttemptRepository";
import type {
  BillingRetryAttempt,
  BillingRetryHooks,
  OpenBillingAttemptInput,
  ReportBillingFailureInput,
  ReportBillingRecoveryInput,
  RetryAttemptFilter,
  RetryLifecycleEvent,
  RetryPolicyConfig,
} from "../types/retry";
import { DEFAULT_RETRY_POLICY } from "../types/retry";
import { BillingKitError } from "../utils/errors";
import { generateId } from "../utils/id";

export class RetryAttemptNotFoundError extends BillingKitError {
  constructor(id: string) {
    super(`Retry attempt not found: ${id}`, "RETRY_ATTEMPT_NOT_FOUND");
    this.name = "RetryAttemptNotFoundError";
  }
}

export class InvalidRetryStateError extends BillingKitError {
  constructor(message: string) {
    super(message, "INVALID_RETRY_STATE");
    this.name = "InvalidRetryStateError";
  }
}

function resolvePolicy(policy?: RetryPolicyConfig): Required<RetryPolicyConfig> {
  return {
    maxRetries: policy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    retryIntervalsMs:
      policy?.retryIntervalsMs ?? DEFAULT_RETRY_POLICY.retryIntervalsMs,
    gracePeriodMs: policy?.gracePeriodMs ?? DEFAULT_RETRY_POLICY.gracePeriodMs,
  };
}

function intervalForAttempt(attemptCount: number, intervals: number[]): number {
  if (intervals.length === 0) return 24 * 60 * 60 * 1000;
  const index = Math.min(Math.max(attemptCount - 1, 0), intervals.length - 1);
  return intervals[index]!;
}

export class RetryService {
  private readonly policy: Required<RetryPolicyConfig>;

  constructor(
    private readonly repository: RetryAttemptRepository,
    policy?: RetryPolicyConfig,
    private readonly hooks: BillingRetryHooks = {},
  ) {
    this.policy = resolvePolicy(policy);
  }

  async openAttempt(input: OpenBillingAttemptInput): Promise<BillingRetryAttempt> {
    const now = input.now ?? new Date();
    const existing = await this.repository.findByReference(
      input.referenceId,
      input.kind,
    );
    if (existing) return existing;

    return this.repository.save({
      id: generateId("rtry"),
      kind: input.kind,
      referenceId: input.referenceId,
      status: "pending",
      attemptCount: 0,
      maxRetries: this.policy.maxRetries,
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    });
  }

  async reportFailure(input: ReportBillingFailureInput): Promise<BillingRetryAttempt> {
    const now = input.now ?? new Date();
    const existing = await this.repository.findByReference(
      input.referenceId,
      input.kind,
    );

    if (existing?.status === "recovered" || existing?.status === "uncollectible") {
      throw new InvalidRetryStateError(
        `Cannot report failure for attempt in status "${existing.status}"`,
      );
    }

    const previousStatus = existing?.status;
    const attemptCount = (existing?.attemptCount ?? 0) + 1;

    let attempt: BillingRetryAttempt = {
      id: existing?.id ?? generateId("rtry"),
      kind: input.kind,
      referenceId: input.referenceId,
      status: "failed",
      attemptCount,
      maxRetries: this.policy.maxRetries,
      lastFailureReason: input.reason,
      customerId: input.customerId ?? existing?.customerId,
      amount: input.amount ?? existing?.amount,
      currency: input.currency ?? existing?.currency,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      metadata: { ...existing?.metadata, ...input.metadata },
      nextRetryAt: undefined,
      graceEndsAt: existing?.graceEndsAt,
    };

    attempt = await this.repository.save(attempt);
    await this.emit("onPaymentFailed", attempt, previousStatus);

    if (attemptCount <= this.policy.maxRetries) {
      return this.scheduleRetry(attempt, now);
    }

    return this.enterGraceOrUncollectible(attempt, now);
  }

  async reportRecovered(
    input: ReportBillingRecoveryInput,
  ): Promise<BillingRetryAttempt> {
    const now = input.now ?? new Date();
    const existing = await this.requireByReference(input.referenceId, input.kind);

    if (existing.status === "uncollectible") {
      throw new InvalidRetryStateError(
        "Cannot recover an uncollectible billing attempt",
      );
    }
    if (existing.status === "recovered") return existing;

    const previousStatus = existing.status;
    const saved = await this.repository.save({
      ...existing,
      status: "recovered",
      nextRetryAt: undefined,
      graceEndsAt: undefined,
      updatedAt: now,
    });
    await this.emit("onPaymentRecovered", saved, previousStatus);
    return saved;
  }

  async markUncollectible(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
    now = new Date(),
  ): Promise<BillingRetryAttempt> {
    const existing = await this.requireByReference(referenceId, kind);

    if (existing.status === "recovered") {
      throw new InvalidRetryStateError(
        "Cannot mark a recovered attempt as uncollectible",
      );
    }
    if (existing.status === "uncollectible") return existing;

    const previousStatus = existing.status;
    const saved = await this.repository.save({
      ...existing,
      status: "uncollectible",
      nextRetryAt: undefined,
      updatedAt: now,
    });
    await this.emit("onMarkedUncollectible", saved, previousStatus);
    await this.emit("onRecoveryEmail", saved, previousStatus);
    await this.emit("onRecoveryWebhook", saved, previousStatus);
    return saved;
  }

  async processDueRetries(now = new Date()): Promise<BillingRetryAttempt[]> {
    const due = await this.repository.list({
      status: "retrying",
      dueBefore: now,
    });

    const candidates = await this.repository.list({
      status: ["failed", "retrying"],
    });

    for (const attempt of candidates) {
      if (
        attempt.graceEndsAt &&
        attempt.graceEndsAt <= now &&
        attempt.status !== "uncollectible" &&
        attempt.status !== "recovered"
      ) {
        await this.markUncollectible(attempt.referenceId, attempt.kind, now);
      }
    }

    return due;
  }

  async getAttempt(id: string): Promise<BillingRetryAttempt> {
    const attempt = await this.repository.findById(id);
    if (!attempt) throw new RetryAttemptNotFoundError(id);
    return attempt;
  }

  async getAttemptByReference(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt | null> {
    return this.repository.findByReference(referenceId, kind);
  }

  async listAttempts(filter?: RetryAttemptFilter): Promise<BillingRetryAttempt[]> {
    return this.repository.list(filter);
  }

  private async scheduleRetry(
    attempt: BillingRetryAttempt,
    now: Date,
  ): Promise<BillingRetryAttempt> {
    const previousStatus = attempt.status;
    const delay = intervalForAttempt(
      attempt.attemptCount,
      this.policy.retryIntervalsMs,
    );
    const saved = await this.repository.save({
      ...attempt,
      status: "retrying",
      nextRetryAt: new Date(now.getTime() + delay),
      updatedAt: now,
    });
    await this.emit("onRetryScheduled", saved, previousStatus);
    await this.emit("onRecoveryEmail", saved, previousStatus);
    await this.emit("onRecoveryWebhook", saved, previousStatus);
    return saved;
  }

  private async enterGraceOrUncollectible(
    attempt: BillingRetryAttempt,
    now: Date,
  ): Promise<BillingRetryAttempt> {
    if (this.policy.gracePeriodMs <= 0) {
      return this.markUncollectible(attempt.referenceId, attempt.kind, now);
    }

    const previousStatus = attempt.status;
    const saved = await this.repository.save({
      ...attempt,
      status: "failed",
      nextRetryAt: undefined,
      graceEndsAt: new Date(now.getTime() + this.policy.gracePeriodMs),
      updatedAt: now,
    });
    await this.emit("onRecoveryEmail", saved, previousStatus);
    await this.emit("onRecoveryWebhook", saved, previousStatus);
    return saved;
  }

  private async requireByReference(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt> {
    const existing = await this.repository.findByReference(referenceId, kind);
    if (!existing) throw new RetryAttemptNotFoundError(referenceId);
    return existing;
  }

  private async emit(
    hook: RetryLifecycleEvent["hook"],
    attempt: BillingRetryAttempt,
    previousStatus?: BillingRetryAttempt["status"],
  ): Promise<void> {
    const handler = this.hooks[hook];
    if (!handler) return;
    await handler({ attempt, previousStatus, hook });
  }
}
