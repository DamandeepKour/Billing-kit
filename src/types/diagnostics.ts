import type { BillingProvider } from "./config";

/** Per-check outcome. */
export type DiagnosticCheckStatus = "pass" | "warn" | "fail";

/** Aggregated diagnostics / health outcome. */
export type DiagnosticsStatus = "healthy" | "degraded" | "unhealthy";

export type DiagnosticCheckCategory =
  | "credentials"
  | "provider"
  | "currency"
  | "tax"
  | "webhook"
  | "repository"
  | "runtime";

export interface DiagnosticCheck {
  id: string;
  name: string;
  category: DiagnosticCheckCategory;
  status: DiagnosticCheckStatus;
  message: string;
  /** Safe metadata only — never includes secrets. */
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: DiagnosticsStatus;
  provider: BillingProvider;
  /** True when status is `healthy`. */
  ok: boolean;
  checks: DiagnosticCheck[];
  errors: string[];
  warnings: string[];
  recommendations: string[];
  checkedAt: string;
}

export interface ProviderConfigVerification {
  status: DiagnosticsStatus;
  provider: BillingProvider;
  /** True when there are no failing checks. */
  valid: boolean;
  checks: DiagnosticCheck[];
  errors: string[];
  warnings: string[];
  recommendations: string[];
  checkedAt: string;
}

export interface DiagnosticsReport {
  status: DiagnosticsStatus;
  provider: BillingProvider;
  /** True when status is `healthy`. */
  ok: boolean;
  health: HealthCheckResult;
  config: ProviderConfigVerification;
  checks: DiagnosticCheck[];
  errors: string[];
  warnings: string[];
  recommendations: string[];
  checkedAt: string;
}
