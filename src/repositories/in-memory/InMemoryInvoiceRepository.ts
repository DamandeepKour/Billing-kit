import type { InvoiceRepository } from "../../interfaces/InvoiceRepository";
import type { Invoice } from "../../types/invoice";
export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly store = new Map<string, Invoice>();
  async save(invoice: Invoice): Promise<Invoice> {
    this.store.set(invoice.id, invoice);
    return invoice;
  }
  async findById(id: string): Promise<Invoice | null> {
    return this.store.get(id) ?? null;
  }
}
