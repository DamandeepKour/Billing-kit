import { BillingKit, TransactionType } from "../src";
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
  company: {
    name: "Acme Corp",
    address: "123 Business Park, Mumbai, MH",
    email: "billing@acme.com",
  },
});
const tax = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});
console.log("GST:", tax);
const invoice = await billing.generateInvoice({
  customer: { name: "John Doe", email: "john@example.com" },
  billingAddress: {
    line1: "42 MG Road",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
  lineItems: [{ description: "Pro Plan (monthly)", quantity: 1, unitAmount: 99900 }],
  notes: "Thank you for your business",
});
console.log("Invoice:", invoice.number, invoice.total);
const pdf = await billing.generateInvoicePdf({ invoice });
console.log("PDF size:", pdf.length, "bytes");
const txn = await billing.recordTransaction({
  type: TransactionType.PAYMENT,
  amount: invoice.total,
  currency: "inr",
  referenceId: invoice.id,
});
console.log("Transaction:", txn.id);
