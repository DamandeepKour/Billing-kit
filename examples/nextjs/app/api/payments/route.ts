import { NextResponse } from "next/server";
import { BillingKitError } from "billing-kit";
import { billing } from "../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount, currency, customerId, description, metadata } = body ?? {};

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount (positive integer, smallest units) is required" },
        { status: 400 },
      );
    }

    const payment = await billing.createPayment({
      amount,
      currency,
      customerId: customerId ?? process.env.STRIPE_CUSTOMER_ID,
      description,
      metadata,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

function billingErrorResponse(error: unknown) {
  if (error instanceof BillingKitError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
