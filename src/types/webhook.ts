export interface WebhookEvent {
  id: string;
  type: string;
  provider: string;
  data: unknown;
}
