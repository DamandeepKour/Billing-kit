import type {
  ClaimWebhookEventResult,
  WebhookEventRecord,
} from "../types/webhook";

export interface WebhookEventRepository {
  claim(record: WebhookEventRecord): Promise<ClaimWebhookEventResult>;
  save(record: WebhookEventRecord): Promise<WebhookEventRecord>;
  find(provider: string, eventId: string): Promise<WebhookEventRecord | null>;
  list(): Promise<WebhookEventRecord[]>;
}
