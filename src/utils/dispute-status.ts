import type { DisputeStatus, DisputePhase } from "../types/dispute";

const RAZORPAY_STATUS: Record<string, DisputeStatus> = {
  open: "open",
  under_review: "under_review",
  underreview: "under_review",
  action_required: "action_required",
  actionrequired: "action_required",
  won: "won",
  lost: "lost",
  closed: "closed",
};

const STRIPE_STATUS: Record<string, DisputeStatus> = {
  warning_needs_response: "warning_needs_response",
  warning_under_review: "warning_under_review",
  warning_closed: "warning_closed",
  needs_response: "needs_response",
  under_review: "under_review",
  charge_refunded: "charge_refunded",
  won: "won",
  lost: "lost",
};

export function mapRazorpayDisputeStatus(status?: string): DisputeStatus {
  if (!status) return "unknown";
  const key = status.trim().toLowerCase().replace(/\s+/g, "_");
  return RAZORPAY_STATUS[key] ?? "unknown";
}

export function mapStripeDisputeStatus(status?: string): DisputeStatus {
  if (!status) return "unknown";
  const key = status.trim().toLowerCase();
  return STRIPE_STATUS[key] ?? "unknown";
}

export function mapDisputePhase(phase?: string): DisputePhase | undefined {
  if (!phase) return undefined;
  const key = phase.trim().toLowerCase().replace(/\s+/g, "_");
  switch (key) {
    case "fraud":
    case "retrieval":
    case "chargeback":
    case "pre_arbitration":
    case "pre-arbitration":
    case "arbitration":
      return key.replace("-", "_") as DisputePhase;
    default:
      return "unknown";
  }
}
