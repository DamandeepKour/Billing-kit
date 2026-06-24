import { BillingKit } from "../src";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
  tax: {
    enabled: true,
    defaultRate: 18,
    stateCode: "MH",
  },
});

const tax = billing.calculateTax({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});

console.log("GST breakdown:", tax);

// Uncomment with a real Stripe test key and customer ID:
// const invoice = await billing.createInvoice({
//   customerId: "cus_xxx",
//   lineItems: [{ description: "Pro plan", quantity: 1, unitAmount: 99900 }],
//   buyerState: "MH",
// });
// console.log("Invoice:", invoice);
