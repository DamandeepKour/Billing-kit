import type { Invoice } from "./invoice";
import type { CompanyDetails } from "./config";
export interface GeneratePdfInput {
  invoice: Invoice;
  company?: CompanyDetails;
}
