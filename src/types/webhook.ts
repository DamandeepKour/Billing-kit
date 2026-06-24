export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
}

export type WebhookEventHandler = (event: WebhookEvent) => void | Promise<void>;

export interface WebhookHandlers {
  [eventType: string]: WebhookEventHandler;
}
