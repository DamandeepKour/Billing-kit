import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
} from "../types/payment";

export class PaymentService {
  constructor(private readonly gateway: PaymentGateway) {}

  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return this.gateway.createPayment(input);
  }

  capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    return this.gateway.capturePayment(input);
  }

  cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.gateway.cancelPayment(paymentId);
  }

  getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.gateway.getPaymentStatus(paymentId);
  }
}
