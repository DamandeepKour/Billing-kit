import { BillingKit, TransactionType, type WebhookEvent } from "../../src";
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});
type StripeObject = {
  id: string;
  amount?: number;
  currency?: string;
  customer?: string;
  subscription?: string;
};
async function handleStripeEvent(event: WebhookEvent): Promise<void> {
  const data = event.data as StripeObject;
  switch (event.type) {
    case "payment_intent.succeeded":
    case "invoice.paid":
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
        metadata: {
          customerId: data.customer ?? "",
          subscriptionId: data.subscription ?? "",
        },
      });
      break;
    case "payment_intent.payment_failed":
    case "invoice.payment_failed":
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      break;
    case "customer.subscription.deleted":
      break;
    case "charge.refunded":
      await billing.recordTransaction({
        type: TransactionType.REFUND,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
      });
      break;
    case "charge.dispute.created":
      await billing.recordTransaction({
        type: TransactionType.CHARGEBACK,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
      });
      break;
    default:
      break;
  }
}
export async function stripeWebhookHandler(
  req: {
    body: Buffer;
    headers: Record<string, string | string[] | undefined>;
  },
  res: {
    status: (code: number) => {
      send: (body: string) => void;
      json: (body: unknown) => void;
    };
  },
): Promise<void> {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).send("Missing Stripe-Signature header");
    return;
  }
  try {
    const event = billing.verifyWebhook(req.body, signature);
    await handleStripeEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    res.status(400).send(message);
  }
}
