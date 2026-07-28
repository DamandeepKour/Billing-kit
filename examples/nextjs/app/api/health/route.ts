import { NextResponse } from "next/server";
import { billing } from "../../../lib/billing";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(billing.healthCheck());
}
