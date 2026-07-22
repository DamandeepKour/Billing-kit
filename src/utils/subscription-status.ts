import type { SubscriptionStatus } from "../types/subscription";

export function mapStripeSubscriptionStatus(
  providerStatus: string,
  options?: { paused?: boolean },
): SubscriptionStatus {
  if (options?.paused) return "paused";
  switch (providerStatus.toLowerCase()) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "cancelled":
    case "incomplete_expired":
      return "cancelled";
    case "paused":
      return "paused";
    case "incomplete":
    default:
      return "pending";
  }
}

export function mapRazorpaySubscriptionStatus(
  providerStatus: string,
): SubscriptionStatus {
  switch (providerStatus.toLowerCase()) {
    case "active":
    case "authenticated":
      return "active";
    case "paused":
      return "paused";
    case "pending":
    case "halted":
      return "past_due";
    case "cancelled":
    case "canceled":
    case "completed":
    case "expired":
      return "cancelled";
    case "created":
    default:
      return "pending";
  }
}

export function mapSubscriptionStatus(
  provider: string,
  providerStatus: string,
  options?: { paused?: boolean },
): SubscriptionStatus {
  if (provider === "stripe") {
    return mapStripeSubscriptionStatus(providerStatus, options);
  }
  if (provider === "razorpay") {
    return mapRazorpaySubscriptionStatus(providerStatus);
  }
  return mapStripeSubscriptionStatus(providerStatus, options);
}
