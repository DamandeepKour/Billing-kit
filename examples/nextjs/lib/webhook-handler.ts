import type { WebhookEvent } from "billing-kit";

export async function handleBillingWebhookEvent(
  event: WebhookEvent,
): Promise<void> {
  switch (event.normalizedType) {
    case "payment.captured":
      break;
    case "payment.failed":
      break;
    case "refund.processed":
      break;
    case "invoice.paid":
      break;
    case "dispute.created":
    case "dispute.action_required":
      break;
    default:
      break;
  }
}
