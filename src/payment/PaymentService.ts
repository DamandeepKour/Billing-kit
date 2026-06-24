import type { PaymentProvider } from "../payment/providers/PaymentProvider";
import type {
  CreatePaymentInput,
  Payment,
} from "../types/payment";

export class PaymentService {
  constructor(private readonly provider: PaymentProvider) {}

  createPayment(input: CreatePaymentInput): Promise<Payment> {
    return this.provider.createPayment(input);
  }

  getPayment(paymentId: string): Promise<Payment> {
    return this.provider.getPayment(paymentId);
  }
}
