import { NextResponse } from "next/server";
import { BillingKitError } from "billing-kit";
import { billing } from "../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId, amount, reason, idempotencyKey, metadata } = body ?? {};

    if (typeof paymentId !== "string" || paymentId.length === 0) {
      return NextResponse.json(
        { error: "paymentId is required" },
        { status: 400 },
      );
    }

    const refund = await billing.refundPayment({
      paymentId,
      amount,
      reason,
      idempotencyKey,
      metadata,
    });

    return NextResponse.json(refund, { status: 201 });
  } catch (error) {
    if (error instanceof BillingKitError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
