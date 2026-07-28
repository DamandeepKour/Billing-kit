import { BillingKit } from "billing-kit";

const provider =
  process.env.PROVIDER === "razorpay" ? "razorpay" : "stripe";

export const billing =
  provider === "razorpay"
    ? new BillingKit({
        provider: "razorpay",
        keyId: process.env.RAZORPAY_KEY_ID!,
        secretKey: process.env.RAZORPAY_KEY_SECRET!,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
        currency: process.env.CURRENCY ?? "inr",
      })
    : new BillingKit({
        provider: "stripe",
        secretKey: process.env.STRIPE_SECRET_KEY!,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        currency: process.env.CURRENCY ?? "usd",
      });
