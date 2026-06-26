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
  // Optional: plug in your own repositories (Postgres, Mongo, Redis, etc.)
  // invoiceRepository: new MyPostgresInvoiceRepository(),
  // transactionRepository: new MyPostgresTransactionRepository(),
});

// 1. GST calculation (local — no API call)
const tax = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});
console.log("GST:", tax);

// 2. Generate invoice (persisted via repository)
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

// 3. Generate PDF
const pdf = await billing.generateInvoicePdf({ invoice });
console.log("PDF size:", pdf.length, "bytes");

// 4. Stripe payment (requires real test key)
// const payment = await billing.createPayment({ amount: 99900, customerId: "cus_xxx" });

// 5. Record transaction (persisted via repository)
const txn = await billing.recordTransaction({
  type: TransactionType.PAYMENT,
  amount: invoice.total,
  currency: "inr",
  referenceId: invoice.id,
});
console.log("Transaction:", txn.id);
