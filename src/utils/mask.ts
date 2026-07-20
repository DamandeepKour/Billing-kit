const SENSITIVE_KEY_PATTERN =
  /^(.*?)(password|passwd|secret|token|api[_-]?key|authorization|auth|cvv|cvc|pan|card[_-]?number|account[_-]?number|iban|ssn|webhook[_-]?secret|secret[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)(.*?)$/i;

const CARD_LIKE = /\b(?:\d[ -]*?){13,19}\b/g;

function maskString(value: string): string {
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}

function maskCardLikeStrings(value: string): string {
  return value.replace(CARD_LIKE, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13) return match;
    return maskString(digits);
  });
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function maskSensitiveFields<T>(value: T): T {
  return maskValue(value) as T;
}

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskCardLikeStrings(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => maskValue(item));

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      if (typeof nested === "string") {
        output[key] = maskString(nested);
      } else if (nested === null || nested === undefined) {
        output[key] = nested;
      } else {
        output[key] = "[REDACTED]";
      }
      continue;
    }
    output[key] = maskValue(nested);
  }
  return output;
}

export function summarizePayload(
  payload?: Record<string, unknown>,
): Record<string, unknown> {
  if (!payload) return {};
  return maskSensitiveFields(payload);
}
