import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
} from "../types/payment";
import { resolveCurrency } from "../utils/currency";

export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly defaultCurrency?: string,
  ) {}

  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const currency = resolveCurrency({
      override: input.currency,
      configDefault: this.defaultCurrency,
    });

    return this.gateway.createPayment({ ...input, currency });
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
