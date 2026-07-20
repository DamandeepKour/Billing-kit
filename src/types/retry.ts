export type BillingAttemptKind = "payment" | "invoice";

export type BillingAttemptStatus =
  | "pending"
  | "failed"
  | "retrying"
  | "recovered"
  | "uncollectible";

export interface RetryPolicyConfig {
  maxRetries?: number;
  retryIntervalsMs?: number[];
  gracePeriodMs?: number;
}

export const DEFAULT_RETRY_POLICY: Required<RetryPolicyConfig> = {
  maxRetries: 3,
  retryIntervalsMs: [
    24 * 60 * 60 * 1000,
    3 * 24 * 60 * 60 * 1000,
    5 * 24 * 60 * 60 * 1000,
  ],
  gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
};

export interface ReportBillingFailureInput {
  kind: BillingAttemptKind;
  referenceId: string;
  reason?: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string>;
  now?: Date;
}

export interface OpenBillingAttemptInput {
  kind: BillingAttemptKind;
  referenceId: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string>;
  now?: Date;
}

export interface ReportBillingRecoveryInput {
  referenceId: string;
  kind?: BillingAttemptKind;
  now?: Date;
}

export interface BillingRetryAttempt {
  id: string;
  kind: BillingAttemptKind;
  referenceId: string;
  status: BillingAttemptStatus;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  graceEndsAt?: Date;
  lastFailureReason?: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, string>;
}

export type RetryHookName =
  | "onPaymentFailed"
  | "onRetryScheduled"
  | "onPaymentRecovered"
  | "onMarkedUncollectible"
  | "onRecoveryEmail"
  | "onRecoveryWebhook";

export interface RetryLifecycleEvent {
  attempt: BillingRetryAttempt;
  previousStatus?: BillingAttemptStatus;
  hook: RetryHookName;
}

export type RetryHookHandler = (
  event: RetryLifecycleEvent,
) => void | Promise<void>;

export interface BillingRetryHooks {
  onPaymentFailed?: RetryHookHandler;
  onRetryScheduled?: RetryHookHandler;
  onPaymentRecovered?: RetryHookHandler;
  onMarkedUncollectible?: RetryHookHandler;
  onRecoveryEmail?: RetryHookHandler;
  onRecoveryWebhook?: RetryHookHandler;
}

export interface RetryAttemptFilter {
  status?: BillingAttemptStatus | BillingAttemptStatus[];
  kind?: BillingAttemptKind;
  dueBefore?: Date;
}
