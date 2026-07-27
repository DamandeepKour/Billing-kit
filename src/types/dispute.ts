/** Canonical dispute lifecycle shared across Razorpay and Stripe. */
export type DisputeStatus =
  | "open"
  | "under_review"
  | "action_required"
  | "won"
  | "lost"
  | "closed"
  | "needs_response"
  | "warning_needs_response"
  | "warning_under_review"
  | "warning_closed"
  | "charge_refunded"
  | "unknown";

export type DisputePhase =
  | "fraud"
  | "retrieval"
  | "chargeback"
  | "pre_arbitration"
  | "arbitration"
  | "unknown";

export interface DisputeEvidence {
  /** Free-form explanation / summary shown to the issuer. */
  explanation?: string;
  shippingProof?: string[];
  billingProof?: string[];
  cancellationProof?: string[];
  customerCommunication?: string[];
  proofOfService?: string[];
  refundConfirmation?: string[];
  accessActivityLog?: string[];
  refundPolicy?: string[];
  other?: string[];
  /** Provider-specific raw evidence fields (Stripe evidence hash, etc.). */
  providerFields?: Record<string, string | number | null>;
}

export interface Dispute {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  /** Amount already deducted / held, when the provider reports it. */
  amountDeducted?: number;
  status: DisputeStatus;
  /** Raw provider status string. */
  providerStatus?: string;
  phase?: DisputePhase;
  reasonCode?: string;
  reasonDescription?: string;
  /** Deadline to respond (when present). */
  respondBy?: Date;
  evidenceDueBy?: Date;
  evidenceSubmitted?: boolean;
  customerId?: string;
  chargeId?: string;
  provider: string;
  createdAt?: Date;
  metadata?: Record<string, string>;
  providerResponse?: unknown;
}

export interface ListDisputesInput {
  count?: number;
  skip?: number;
  /** Stripe-only: filter by charge id. */
  chargeId?: string;
  /** Stripe-only: filter by payment intent. */
  paymentIntentId?: string;
}

export interface AcceptDisputeInput {
  disputeId: string;
}

export interface ContestDisputeInput {
  disputeId: string;
  amount?: number;
  evidence?: DisputeEvidence;
  /** When true, submit evidence immediately (Razorpay/Stripe). Default true. */
  submit?: boolean;
}

export interface UpdateDisputeEvidenceInput {
  disputeId: string;
  evidence?: DisputeEvidence;
  /** Stripe: submit when true. */
  submit?: boolean;
  metadata?: Record<string, string>;
}
