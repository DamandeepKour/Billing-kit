import { NextResponse } from "next/server";
import { BillingKitError } from "billing-kit";
import { billing } from "../../../../lib/billing";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const invoice = await billing.getInvoice(id);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json(invoice);
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
