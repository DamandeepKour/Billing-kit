import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RefundPaymentInput, RefundResult } from "../types/payment";
export class RefundService {
  constructor(private readonly gateway: PaymentGateway) {}
  refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    return this.gateway.refundPayment(input);
  }
}
