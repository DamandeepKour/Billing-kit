import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RazorpayBillingProvider } from "../interfaces/RazorpayBillingProvider";
import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../types/order";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundResult,
} from "../types/payment";
import { resolveCurrency } from "../utils/currency";
import { UnsupportedOperationError } from "../utils/stripe-errors";
function isRazorpayBillingProvider(
  gateway: PaymentGateway,
): gateway is PaymentGateway & RazorpayBillingProvider {
  const candidate = gateway as PaymentGateway & Partial<RazorpayBillingProvider>;
  return (
    gateway.name === "razorpay" &&
    typeof candidate.createOrder === "function" &&
    typeof candidate.verifyPaymentSignature === "function"
  );
}
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
  private requireRazorpay(): PaymentGateway & RazorpayBillingProvider {
    if (!isRazorpayBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError("Razorpay billing helpers", this.gateway.name);
    }
    return this.gateway;
  }
  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const currency = resolveCurrency({
      override: input.currency,
      configDefault: this.defaultCurrency,
    });
    return this.requireRazorpay().createOrder({ ...input, currency });
  }
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean {
    return this.requireRazorpay().verifyPaymentSignature(input);
  }
  async fetchPayment(paymentId: string): Promise<PaymentResult> {
    return this.requireRazorpay().fetchPayment(paymentId);
  }
  async fetchRefund(refundId: string): Promise<RefundResult> {
    return this.requireRazorpay().fetchRefund(refundId);
  }
}
