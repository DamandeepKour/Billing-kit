import { createHash, randomUUID } from "crypto";
import type { IdempotencyRequestRepository } from "../interfaces/IdempotencyRequestRepository";
import type {
  IdempotencyRequestKind,
  IdempotencyRequestRecord,
} from "../types/idempotency";
import {
  IdempotencyConflictError,
  IdempotencyInFlightError,
  InvalidConfigError,
} from "./errors";
import { generateId } from "./id";

export function generateIdempotencyKey(): string {
  return randomUUID();
}

export function resolveIdempotencyKey(key?: string): string {
  const resolved = key?.trim() || generateIdempotencyKey();
  validateIdempotencyKey(resolved);
  return resolved;
}

export function validateIdempotencyKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{4,36}$/.test(key)) {
    throw new InvalidConfigError(
      "idempotencyKey must be 4-36 characters using letters, numbers, _ or -",
    );
  }
}

export function fingerprintRequest(request: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(request)).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${stableStringify(nested)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isAmbiguousIdempotencyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    error.name === "AbortError" ||
    error.name === "TypeError" ||
    ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(
      code ?? "",
    )
  );
}

export async function executeIdempotentRequest<T>(options: {
  repository: IdempotencyRequestRepository;
  key?: string;
  kind: IdempotencyRequestKind;
  request: Record<string, unknown>;
  run: (idempotencyKey: string) => Promise<T>;
  providerResponse?: (result: T) => Record<string, unknown> | undefined;
}): Promise<{ result: T; created: boolean; idempotencyKey: string }> {
  const idempotencyKey = resolveIdempotencyKey(options.key);
  const now = new Date();
  const request = {
    ...options.request,
    idempotencyKey,
  };
  const claim = await options.repository.claim({
    id: generateId("idm"),
    idempotencyKey,
    kind: options.kind,
    fingerprint: fingerprintRequest(request),
    status: "processing",
    request,
    createdAt: now,
    updatedAt: now,
  });

  if (claim.outcome === "conflict") {
    throw new IdempotencyConflictError(idempotencyKey);
  }
  if (claim.outcome === "in_flight") {
    throw new IdempotencyInFlightError(idempotencyKey);
  }
  if (claim.outcome === "duplicate") {
    if (claim.record.result === undefined) {
      throw new IdempotencyInFlightError(idempotencyKey);
    }
    return {
      result: claim.record.result as T,
      created: false,
      idempotencyKey,
    };
  }

  try {
    const result = await options.run(idempotencyKey);
    await options.repository.save({
      ...claim.record,
      status: "succeeded",
      result,
      providerResponse: options.providerResponse?.(result),
      error: undefined,
      updatedAt: new Date(),
    });
    return { result, created: true, idempotencyKey };
  } catch (error) {
    await options.repository.save({
      ...claim.record,
      status: isAmbiguousIdempotencyError(error) ? "uncertain" : "failed",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    });
    throw error;
  }
}

export type { IdempotencyRequestRecord };
