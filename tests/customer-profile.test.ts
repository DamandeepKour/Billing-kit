import { BillingKit } from "../src/core/BillingKit";
import { CustomerProfileNotFoundError, CustomerProfileService } from "../src/customer";
import { PaymentService } from "../src/payment";
import { InMemoryCustomerProfileRepository } from "../src/repositories";
import { createMockGateway } from "./helpers";

const address = {
  line1: "14 MG Road",
  city: "Bengaluru",
  state: "KA",
  postalCode: "560001",
  country: "IN",
};

describe("Customer billing profiles", () => {
  it("creates and updates a reusable profile with tax IDs and preferences", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "inr",
    });

    const profile = await billing.createCustomerProfile({
      name: "Ada Lovelace",
      email: "ada@example.com",
      companyName: "Analytical Engines Pvt Ltd",
      gstin: "29AAAAA0000A1Z5",
      isBusinessCustomer: true,
      billingAddress: address,
      defaultCurrency: "inr",
      billingNotes: "Net 15",
      paymentPreferences: {
        allowAutoCharge: true,
        invoiceDelivery: "email",
      },
    });

    expect(profile.id).toMatch(/^cusp_/);
    expect(profile.gstin).toBe("29AAAAA0000A1Z5");
    expect(profile.paymentPreferences.allowAutoCharge).toBe(true);

    const updated = await billing.updateCustomerProfile({
      profileId: profile.id,
      vatNumber: "EU123",
      defaultCurrency: "usd",
      billingNotes: "Net 30",
    });

    expect(updated.vatNumber).toBe("EU123");
    expect(updated.defaultCurrency).toBe("usd");
    expect(updated.billingNotes).toBe("Net 30");
  });

  it("saves payment methods and sets a default", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    const profile = await billing.createCustomerProfile({
      name: "Grace",
      email: "grace@example.com",
      billingAddress: address,
    });

    const withPm = await billing.attachPaymentMethod({
      profileId: profile.id,
      paymentMethodId: "pm_card_visa",
      type: "card",
      brand: "visa",
      last4: "4242",
      setAsDefault: true,
    });

    expect(withPm.paymentMethods).toHaveLength(1);
    expect(withPm.paymentPreferences.defaultPaymentMethodId).toBe("pm_card_visa");
    expect(withPm.paymentMethods[0]?.isDefault).toBe(true);

    await billing.attachPaymentMethod({
      profileId: profile.id,
      paymentMethodId: "pm_card_mc",
      type: "card",
      brand: "mastercard",
      last4: "4444",
      setAsDefault: false,
    });

    const defaulted = await billing.setDefaultPaymentMethod({
      profileId: profile.id,
      paymentMethodId: "pm_card_mc",
    });

    expect(defaulted.paymentPreferences.defaultPaymentMethodId).toBe("pm_card_mc");
    expect(defaulted.paymentMethods.find((m) => m.id === "pm_card_mc")?.isDefault).toBe(
      true,
    );
  });

  it("reuses profile defaults across multiple invoices", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "usd",
      tax: { enabled: true, taxType: "gst", sellerState: "KA", defaultRate: 18 },
    });

    const profile = await billing.createCustomerProfile({
      name: "Billing Contact",
      email: "ap@acme.com",
      companyName: "Acme India",
      gstin: "29AAAAA0000A1Z5",
      isBusinessCustomer: true,
      billingAddress: address,
      defaultCurrency: "inr",
      billingNotes: "PO required",
    });

    const first = await billing.generateInvoice({
      customerProfileId: profile.id,
      lineItems: [{ description: "Seat", quantity: 1, unitAmount: 10000 }],
      taxType: "gst",
      sellerState: "KA",
    });

    const second = await billing.generateInvoice({
      customerProfileId: profile.id,
      lineItems: [{ description: "Addon", quantity: 2, unitAmount: 2500 }],
      taxType: "gst",
      sellerState: "KA",
    });

    expect(first.customer.id).toBe(profile.id);
    expect(first.customer.gstin).toBe("29AAAAA0000A1Z5");
    expect(first.customer.name).toBe("Acme India");
    expect(first.billingAddress.state).toBe("KA");
    expect(first.currency).toBe("inr");
    expect(first.notes).toBe("PO required");

    expect(second.customer.id).toBe(profile.id);
    expect(second.customer.gstin).toBe("29AAAAA0000A1Z5");
    expect(second.currency).toBe("inr");
    expect(second.billingAddress.city).toBe("Bengaluru");
    expect(second.total).toBeGreaterThan(0);
  });

  it("applies profile updates on later invoices and payments", async () => {
    const repo = new InMemoryCustomerProfileRepository();
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "usd",
      customerProfileRepository: repo,
    });

    const profile = await billing.createCustomerProfile({
      name: "Contact",
      email: "old@acme.com",
      companyName: "Acme",
      customerTaxId: "TAX-OLD",
      billingAddress: address,
      defaultCurrency: "inr",
      billingNotes: "Net 15",
    });

    await billing.attachPaymentMethod({
      profileId: profile.id,
      paymentMethodId: "pm_visa",
      type: "card",
      last4: "4242",
      setAsDefault: true,
    });

    await billing.updateCustomerProfile({
      profileId: profile.id,
      email: "ap@acme.com",
      customerTaxId: "TAX-NEW",
      defaultCurrency: "usd",
      billingNotes: "Net 45",
      billingAddress: {
        ...address,
        line1: "88 Residency Road",
        city: "Mysuru",
        postalCode: "570001",
      },
    });

    const invoice = await billing.generateInvoice({
      customerProfileId: profile.id,
      lineItems: [{ description: "Renewal", quantity: 1, unitAmount: 5000 }],
      taxType: "none",
    });

    expect(invoice.customer.email).toBe("ap@acme.com");
    expect(invoice.customer.customerTaxId).toBe("TAX-NEW");
    expect(invoice.currency).toBe("usd");
    expect(invoice.notes).toBe("Net 45");
    expect(invoice.billingAddress.city).toBe("Mysuru");
    expect(invoice.billingAddress.line1).toBe("88 Residency Road");

    const createPayment = jest.fn().mockImplementation(async (input) => ({
      id: "pay_profile",
      status: "captured",
      amount: input.amount,
      currency: input.currency,
      provider: "mock",
      metadata: input.metadata,
    }));
    const payments = new PaymentService(
      createMockGateway({ createPayment }),
      "inr",
      undefined,
      new CustomerProfileService(repo),
    );

    const payment = await payments.createPayment({
      amount: 5000,
      customerProfileId: profile.id,
    });

    expect(payment.currency).toBe("usd");
    expect(payment.metadata?.customerProfileId).toBe(profile.id);
    expect(payment.metadata?.defaultPaymentMethodId).toBe("pm_visa");
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "usd",
        metadata: expect.objectContaining({
          customerProfileId: profile.id,
          defaultPaymentMethodId: "pm_visa",
        }),
      }),
    );
  });

  it("throws when profile is missing", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    await expect(billing.getCustomerProfile("missing")).rejects.toBeInstanceOf(
      CustomerProfileNotFoundError,
    );
  });
});
