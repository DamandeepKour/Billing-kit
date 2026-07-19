import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { BillingKit } from "../src";
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder",
  currency: "inr",
  company: {
    name: "Acme Soft Pvt Ltd",
    address: "12 Andheri East, Mumbai, MH 400069",
    email: "accounts@acme.example",
    gstin: "27AABCU9603R1ZM",
  },
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
});
const outDir = join(process.cwd(), "tmp");
mkdirSync(outDir, { recursive: true });
async function savePdf(name: string, buffer: Buffer): Promise<string> {
  const path = join(outDir, name);
  writeFileSync(path, buffer);
  return path;
}
async function run(): Promise<void> {
  const intra = billing.calculateGST({
    amount: 100000,
    rate: 18,
    sellerState: "MH",
    buyerState: "MH",
  });
  const inter = billing.calculateGST({
    amount: 100000,
    rate: 18,
    sellerState: "MH",
    buyerState: "KA",
  });
  const vat = billing.calculateVAT({ amount: 100000, rate: 20 });
  console.log({ intra, inter, vat });
  const intraInvoice = await billing.generateInvoice({
    invoiceNumber: "INV-2026-MH-00042",
    taxMode: "gst",
    taxRate: 18,
    sellerState: "MH",
    customer: {
      name: "Local Retailer",
      email: "buyer@mumbai.example",
      gstin: "27AAAAA0000A1Z5",
    },
    billingAddress: {
      line1: "10 Linking Road",
      city: "Mumbai",
      state: "MH",
      postalCode: "400050",
      country: "IN",
    },
    lineItems: [
      {
        description: "Cloud hosting — monthly",
        quantity: 1,
        unitAmount: 100000,
        hsnOrSac: "998315",
      },
    ],
    notes: "Intra-state supply — CGST + SGST",
  });
  const interInvoice = await billing.generateInvoice({
    invoiceNumber: "INV-2026-KA-00043",
    taxMode: "gst",
    taxRate: 18,
    sellerState: "MH",
    customer: {
      name: "Bengaluru Tech LLP",
      email: "accounts@blr.example",
      gstin: "29BBBBB0000B1Z5",
    },
    billingAddress: {
      line1: "88 Indiranagar",
      city: "Bengaluru",
      state: "KA",
      postalCode: "560038",
      country: "IN",
    },
    lineItems: [
      {
        description: "API usage credits",
        quantity: 2,
        unitAmount: 50000,
        hsnOrSac: "998314",
      },
    ],
    notes: "Inter-state supply — IGST",
  });
  const vatInvoice = await billing.generateInvoice({
    invoiceNumber: "INV-VAT-2026-0007",
    taxMode: "vat",
    taxRate: 20,
    currency: "eur",
    customer: {
      name: "Berlin GmbH",
      email: "ap@berlin.example",
      vatNumber: "DE123456789",
    },
    billingAddress: {
      line1: "Friedrichstr. 1",
      city: "Berlin",
      state: "BE",
      postalCode: "10117",
      country: "DE",
    },
    lineItems: [
      {
        description: "SaaS license",
        quantity: 1,
        unitAmount: 100000,
      },
    ],
  });
  const autoNumbered = await billing.generateInvoice({
    taxMode: "gst",
    customer: {
      name: "Walk-in Customer",
      gstin: "27CCCCC0000C1Z5",
    },
    billingAddress: {
      line1: "1 Main St",
      city: "Pune",
      state: "MH",
      postalCode: "411001",
      country: "IN",
    },
    lineItems: [{ description: "Setup fee", quantity: 1, unitAmount: 25000 }],
  });
  const retrieved = await billing.getInvoice(intraInvoice.id);
  const summary = await billing.getInvoiceSummary(interInvoice.id);
  const intraPdf = await billing.generateInvoicePdf({ invoice: intraInvoice });
  const interPdf = await billing.generateInvoicePdf({ invoice: interInvoice });
  const vatPdf = await billing.generateInvoicePdf({ invoice: vatInvoice });
  const paths = {
    intra: await savePdf("invoice-intra-state.pdf", intraPdf),
    inter: await savePdf("invoice-inter-state.pdf", interPdf),
    vat: await savePdf("invoice-vat.pdf", vatPdf),
  };
  console.log({
    autoNumber: autoNumbered.number,
    customNumber: intraInvoice.number,
    intraTax: {
      cgst: intraInvoice.tax.cgst,
      sgst: intraInvoice.tax.sgst,
      igst: intraInvoice.tax.igst,
    },
    interTax: {
      cgst: interInvoice.tax.cgst,
      sgst: interInvoice.tax.sgst,
      igst: interInvoice.tax.igst,
      total: summary.total,
    },
    vatTax: vatInvoice.tax.vat,
    customerGstin: retrieved?.customer.gstin,
    pdfs: paths,
  });
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
