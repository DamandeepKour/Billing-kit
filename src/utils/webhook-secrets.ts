/**
 * Collect webhook signing secrets for verification.
 * Primary `webhookSecret` first, then optional previous secrets for rotation windows.
 */
export function resolveWebhookSecrets(config: {
  webhookSecret?: string;
  webhookSecrets?: string[];
}): string[] {
  const secrets: string[] = [];
  const primary = config.webhookSecret?.trim();
  if (primary) secrets.push(primary);

  for (const candidate of config.webhookSecrets ?? []) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && !secrets.includes(trimmed)) {
      secrets.push(trimmed);
    }
  }

  return secrets;
}
