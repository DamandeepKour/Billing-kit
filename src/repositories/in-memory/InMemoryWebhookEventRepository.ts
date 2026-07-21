import type { WebhookEventRepository } from "../../interfaces/WebhookEventRepository";
import type {
  ClaimWebhookEventResult,
  WebhookEventRecord,
} from "../../types/webhook";

function key(provider: string, eventId: string): string {
  return `${provider}:${eventId}`;
}

function resourceKey(record: WebhookEventRecord): string {
  return `${record.provider}:${record.resourceType}:${record.resourceId}`;
}

export class InMemoryWebhookEventRepository
  implements WebhookEventRepository
{
  private readonly store = new Map<string, WebhookEventRecord>();
  private readonly latestOccurrence = new Map<string, number>();

  async claim(record: WebhookEventRecord): Promise<ClaimWebhookEventResult> {
    const eventKey = key(record.provider, record.eventId);
    const existing = this.store.get(eventKey);

    if (existing && existing.status !== "failed") {
      return { outcome: "duplicate", record: existing };
    }

    const occurrence = record.occurredAt?.getTime();
    const latest = this.latestOccurrence.get(resourceKey(record));
    if (occurrence !== undefined && latest !== undefined && occurrence < latest) {
      const ignored: WebhookEventRecord = {
        ...record,
        status: "ignored",
        processedAt: record.receivedAt,
      };
      this.store.set(eventKey, ignored);
      return { outcome: "out_of_order", record: ignored };
    }

    this.store.set(eventKey, record);
    if (occurrence !== undefined) {
      this.latestOccurrence.set(
        resourceKey(record),
        Math.max(latest ?? occurrence, occurrence),
      );
    }
    return { outcome: "claimed", record };
  }

  async save(record: WebhookEventRecord): Promise<WebhookEventRecord> {
    this.store.set(key(record.provider, record.eventId), record);
    return record;
  }

  async find(
    provider: string,
    eventId: string,
  ): Promise<WebhookEventRecord | null> {
    return this.store.get(key(provider, eventId)) ?? null;
  }

  async list(): Promise<WebhookEventRecord[]> {
    return [...this.store.values()].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
    );
  }
}
