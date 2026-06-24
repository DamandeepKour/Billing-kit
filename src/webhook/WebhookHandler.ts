import type { PaymentProvider } from "../payment/providers/PaymentProvider";
import type {
  WebhookEvent,
  WebhookHandlers,
} from "../types/webhook";

export class WebhookHandler {
  constructor(private readonly provider: PaymentProvider) {}

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.provider.verifyWebhook(payload, signature);
  }

  async handleWebhook(
    event: WebhookEvent,
    handlers: WebhookHandlers = {},
  ): Promise<void> {
    const handler = handlers[event.type];
    if (handler) {
      await handler(event);
    }
  }
}
