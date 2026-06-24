import type { PaymentProvider } from "../payment/providers/PaymentProvider";
import type {
  CreateInvoiceInput,
  Invoice,
} from "../types/invoice";

export class InvoiceService {
  constructor(private readonly provider: PaymentProvider) {}

  createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    return this.provider.createInvoice(input);
  }

  getInvoice(invoiceId: string): Promise<Invoice> {
    return this.provider.getInvoice(invoiceId);
  }

  finalizeInvoice(invoiceId: string): Promise<Invoice> {
    return this.provider.finalizeInvoice(invoiceId);
  }
}
