import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { WebhookEvent } from "../types/webhook";
export class WebhookService {
  constructor(private readonly gateway: PaymentGateway) {}
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.gateway.verifyWebhook(payload, signature);
  }
}
