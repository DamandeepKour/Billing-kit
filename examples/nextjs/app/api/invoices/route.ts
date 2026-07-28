import { NextResponse } from "next/server";
import { BillingKitError } from "billing-kit";
import { billing } from "../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer, billingAddress, lineItems, notes } = body ?? {};

    if (!customer?.name || !Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json(
        { error: "customer.name and lineItems[] are required" },
        { status: 400 },
      );
    }

    const invoice = await billing.generateInvoice({
      customer,
      billingAddress,
      lineItems,
      notes,
    });

    return NextResponse.json(invoice, { status: 201 });
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
