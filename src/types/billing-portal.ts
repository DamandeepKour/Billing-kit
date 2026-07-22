export type BillingPortalFlowType =
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update"
  | "subscription_update_confirm";

export type BillingPortalAfterCompletion =
  | "portal_homepage"
  | "redirect"
  | "hosted_confirmation";

export interface BillingPortalFlowInput {
  type: BillingPortalFlowType;
  /** Required for subscription_cancel / subscription_update / subscription_update_confirm. */
  subscriptionId?: string;
  afterCompletion?: BillingPortalAfterCompletion;
  afterCompletionReturnUrl?: string;
  afterCompletionMessage?: string;
}

/**
 * Provider-neutral portal session request.
 * Today this maps to Stripe Customer Portal (`billingPortal.sessions.create`).
 */
export interface CreateBillingPortalSessionInput {
  customerId: string;
  returnUrl?: string;
  configurationId?: string;
  locale?: string;
  flow?: BillingPortalFlowInput;
}

export interface BillingPortalSession {
  id: string;
  url: string;
  customerId: string;
  returnUrl?: string | null;
  configurationId?: string | null;
  createdAt: Date;
  provider: string;
}

/** Deep-link the Stripe portal into the payment method update flow. */
export interface CreatePaymentMethodUpdateSessionInput {
  customerId: string;
  returnUrl?: string;
  configurationId?: string;
  afterCompletion?: BillingPortalAfterCompletion;
  afterCompletionReturnUrl?: string;
}
