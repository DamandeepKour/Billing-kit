import { NextResponse } from "next/server";
import { billing } from "../../../../lib/billing";
import { handleBillingWebhookEvent } from "../../../../lib/webhook-handler";

export const runtime = "nodejs";

/**
 * Stripe webhook — read raw body with request.text(), never request.json().
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe-Signature header" },
      { status: 400 },
    );
  }

  try {
    const result = await billing.processWebhook(
      { rawBody, signature },
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
