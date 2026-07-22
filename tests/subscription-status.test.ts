import {
  mapRazorpaySubscriptionStatus,
  mapStripeSubscriptionStatus,
  mapSubscriptionStatus,
} from "../src/utils/subscription-status";

describe("subscription status mapping", () => {
  it("maps Stripe statuses to canonical lifecycle states", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("active");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("cancelled");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("pending");
    expect(
      mapStripeSubscriptionStatus("active", { paused: true }),
    ).toBe("paused");
  });

  it("maps Razorpay statuses to canonical lifecycle states", () => {
    expect(mapRazorpaySubscriptionStatus("active")).toBe("active");
    expect(mapRazorpaySubscriptionStatus("authenticated")).toBe("active");
    expect(mapRazorpaySubscriptionStatus("paused")).toBe("paused");
    expect(mapRazorpaySubscriptionStatus("pending")).toBe("past_due");
    expect(mapRazorpaySubscriptionStatus("halted")).toBe("past_due");
    expect(mapRazorpaySubscriptionStatus("cancelled")).toBe("cancelled");
    expect(mapRazorpaySubscriptionStatus("completed")).toBe("cancelled");
    expect(mapRazorpaySubscriptionStatus("created")).toBe("pending");
  });

  it("routes by provider name", () => {
    expect(mapSubscriptionStatus("stripe", "canceled")).toBe("cancelled");
    expect(mapSubscriptionStatus("razorpay", "halted")).toBe("past_due");
  });
});
