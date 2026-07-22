import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { IdempotencyRequestRepository } from "../interfaces/IdempotencyRequestRepository";
import type { RefundPaymentInput, RefundResult } from "../types/payment";
import {
  executeIdempotentRequest,
  generateIdempotencyKey,
} from "../utils/idempotency";

export class RefundService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly idempotencyRequests?: IdempotencyRequestRepository,
  ) {}

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    if (!this.idempotencyRequests) {
      const key = input.idempotencyKey?.trim() || generateIdempotencyKey();
      const result = await this.gateway.refundPayment({
        ...input,
        idempotencyKey: key,
      });
      return { ...result, idempotencyKey: key, metadata: input.metadata };
    }

    const execution = await executeIdempotentRequest({
      repository: this.idempotencyRequests,
      key: input.idempotencyKey,
      kind: "refund_payment",
      request: {
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
        metadata: input.metadata,
      },
      run: async (idempotencyKey) => {
        const result = await this.gateway.refundPayment({
          ...input,
          idempotencyKey,
        });
        return { ...result, idempotencyKey, metadata: input.metadata };
      },
      providerResponse: (result) => result.providerResponse,
    });
    return {
      ...execution.result,
      idempotencyKey: execution.idempotencyKey,
      metadata: execution.result.metadata ?? input.metadata,
    };
  }
}
