import type { WebhookEvent } from "billing-kit";
import { billing } from "../billing";

/**
 * Shared webhook business logic for Express / framework examples.
 * Keep this side-effect free aside from your own fulfillment writes.
 */
export async function handleBillingWebhookEvent(
  event: WebhookEvent,
): Promise<void> {
  switch (event.normalizedType) {
    case "payment.captured":
      // fulfill order — event.entity.id
      break;
    case "payment.failed":
      // notify customer
      break;
    case "refund.processed":
      // update refund state
      break;
    case "invoice.paid":
      break;
    case "subscription.activated":
    case "subscription.charged":
      break;
    case "dispute.created":
    case "dispute.action_required":
      break;
    case "dispute.lost":
    case "dispute.won":
      break;
    default:
      break;
  }
}
