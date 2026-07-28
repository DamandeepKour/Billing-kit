import { NextResponse } from "next/server";
import { billing } from "../../../../lib/billing";
import { handleBillingWebhookEvent } from "../../../../lib/webhook-handler";

export const runtime = "nodejs";

/**
 * Razorpay webhook — HMAC over the raw body + X-Razorpay-Signature.
 * Forward X-Razorpay-Event-Id for dedupe when present.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id") ?? undefined;

  if (!signature) {
    return NextResponse.json(
      { error: "Missing X-Razorpay-Signature header" },
      { status: 400 },
    );
  }

  try {
    const webhookRequest = billing.parseWebhookRequest({
      rawBody,
      headers: {
        "x-razorpay-signature": signature,
        ...(eventId ? { "x-razorpay-event-id": eventId } : {}),
      },
      eventId,
    });

    const result = await billing.processWebhook(
      webhookRequest,
      async (event) => {
        await handleBillingWebhookEvent(event);
      },
    );

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
