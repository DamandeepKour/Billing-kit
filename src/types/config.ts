export type BillingProvider = "stripe";

export interface BillingKitConfig {
  provider: BillingProvider;
  secretKey: string;
  webhookSecret?: string;
  currency?: string;
  tax?: {
    enabled: boolean;
    defaultRate?: number;
    stateCode?: string;
  };
}
