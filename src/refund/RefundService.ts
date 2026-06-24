import type { PaymentProvider } from "../payment/providers/PaymentProvider";
import type { Refund, RefundPaymentInput } from "../types/payment";

export class RefundService {
  constructor(private readonly provider: PaymentProvider) {}

  refundPayment(input: RefundPaymentInput): Promise<Refund> {
    return this.provider.refund(input);
  }
}
