import type { CustomerProfileRepository } from "../interfaces/CustomerProfileRepository";
import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { StripeBillingProvider } from "../interfaces/StripeBillingProvider";
import type {
  AttachProfilePaymentMethodInput,
  CreateCustomerProfileInput,
  CustomerBillingProfile,
  SavedPaymentMethod,
  SetDefaultProfilePaymentMethodInput,
  UpdateCustomerProfileInput,
} from "../types/customer-profile";
import { BillingKitError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency } from "../utils/currency";

export class CustomerProfileNotFoundError extends BillingKitError {
  constructor(id: string) {
    super(`Customer profile not found: ${id}`, "CUSTOMER_PROFILE_NOT_FOUND");
    this.name = "CustomerProfileNotFoundError";
  }
}

function isStripeBillingProvider(
  gateway: PaymentGateway | undefined,
): gateway is PaymentGateway & StripeBillingProvider {
  if (!gateway) return false;
  const candidate = gateway as PaymentGateway & Partial<StripeBillingProvider>;
  return (
    gateway.name === "stripe" &&
    typeof candidate.createCustomer === "function" &&
    typeof candidate.attachPaymentMethod === "function"
  );
}

export class CustomerProfileService {
  constructor(
    private readonly repository: CustomerProfileRepository,
    private readonly gateway?: PaymentGateway,
  ) {}

  async createCustomerProfile(
    input: CreateCustomerProfileInput,
  ): Promise<CustomerBillingProfile> {
    const now = new Date();
    let providerCustomerId = input.providerCustomerId;

    if (input.syncProvider === true && isStripeBillingProvider(this.gateway)) {
      const providerCustomer = await this.gateway.createCustomer({
        name: input.companyName ?? input.name,
        email: input.email,
        phone: input.phone,
        description: input.billingNotes,
        metadata: input.metadata,
      });
      providerCustomerId = providerCustomer.id;
    }

    const profile: CustomerBillingProfile = {
      id: generateId("cusp"),
      name: input.name,
      email: input.email,
      phone: input.phone,
      companyName: input.companyName,
      gstin: input.gstin,
      vatNumber: input.vatNumber,
      customerTaxId: input.customerTaxId,
      isBusinessCustomer: input.isBusinessCustomer,
      billingAddress: input.billingAddress,
      defaultCurrency: input.defaultCurrency
        ? normalizeCurrency(input.defaultCurrency)
        : undefined,
      paymentPreferences: {
        allowAutoCharge: input.paymentPreferences?.allowAutoCharge ?? false,
        invoiceDelivery: input.paymentPreferences?.invoiceDelivery ?? "email",
        preferredPaymentMethodTypes:
          input.paymentPreferences?.preferredPaymentMethodTypes,
        defaultPaymentMethodId: input.paymentPreferences?.defaultPaymentMethodId,
      },
      paymentMethods: [],
      providerCustomerId,
      billingNotes: input.billingNotes,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.save(profile);
  }

  async updateCustomerProfile(
    input: UpdateCustomerProfileInput,
  ): Promise<CustomerBillingProfile> {
    const existing = await this.requireProfile(input.profileId);
    const updated: CustomerBillingProfile = {
      ...existing,
      name: input.name ?? existing.name,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      companyName: input.companyName ?? existing.companyName,
      gstin: input.gstin ?? existing.gstin,
      vatNumber: input.vatNumber ?? existing.vatNumber,
      customerTaxId: input.customerTaxId ?? existing.customerTaxId,
      isBusinessCustomer: input.isBusinessCustomer ?? existing.isBusinessCustomer,
      billingAddress: input.billingAddress ?? existing.billingAddress,
      defaultCurrency: input.defaultCurrency
        ? normalizeCurrency(input.defaultCurrency)
        : existing.defaultCurrency,
      paymentPreferences: {
        ...existing.paymentPreferences,
        ...input.paymentPreferences,
      },
      providerCustomerId: input.providerCustomerId ?? existing.providerCustomerId,
      billingNotes: input.billingNotes ?? existing.billingNotes,
      metadata: input.metadata
        ? { ...existing.metadata, ...input.metadata }
        : existing.metadata,
      updatedAt: new Date(),
    };

    return this.repository.save(updated);
  }

  async getCustomerProfile(profileId: string): Promise<CustomerBillingProfile> {
    return this.requireProfile(profileId);
  }

  async listCustomerProfiles(): Promise<CustomerBillingProfile[]> {
    return this.repository.list();
  }

  async attachPaymentMethod(
    input: AttachProfilePaymentMethodInput,
  ): Promise<CustomerBillingProfile> {
    const profile = await this.requireProfile(input.profileId);
    const paymentMethodId = input.paymentMethodId;
    let providerPaymentMethodId = input.providerPaymentMethodId ?? paymentMethodId;

    if (
      input.syncProvider === true &&
      profile.providerCustomerId &&
      isStripeBillingProvider(this.gateway)
    ) {
      const attached = await this.gateway.attachPaymentMethod({
        customerId: profile.providerCustomerId,
        paymentMethodId,
      });
      providerPaymentMethodId = attached.id;

      if (input.setAsDefault !== false) {
        await this.gateway.setDefaultPaymentMethod({
          customerId: profile.providerCustomerId,
          paymentMethodId: attached.id,
        });
      }
    }

    const method: SavedPaymentMethod = {
      id: paymentMethodId.startsWith("pm_") || paymentMethodId.startsWith("pmd_")
        ? paymentMethodId
        : generateId("pmd"),
      type: input.type ?? "card",
      providerPaymentMethodId,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
      isDefault: false,
      createdAt: new Date(),
      metadata: input.metadata,
    };

    const paymentMethods = [
      ...profile.paymentMethods.filter((m) => m.id !== method.id),
      method,
    ];

    const setAsDefault =
      input.setAsDefault === true ||
      !profile.paymentPreferences.defaultPaymentMethodId;

    const withDefaults = setAsDefault
      ? this.applyDefaultPaymentMethod(paymentMethods, method.id)
      : paymentMethods;

    return this.repository.save({
      ...profile,
      paymentMethods: withDefaults,
      paymentPreferences: {
        ...profile.paymentPreferences,
        defaultPaymentMethodId: setAsDefault
          ? method.id
          : profile.paymentPreferences.defaultPaymentMethodId,
      },
      updatedAt: new Date(),
    });
  }

  async setDefaultPaymentMethod(
    input: SetDefaultProfilePaymentMethodInput,
  ): Promise<CustomerBillingProfile> {
    const profile = await this.requireProfile(input.profileId);
    const method = profile.paymentMethods.find((m) => m.id === input.paymentMethodId);
    if (!method) {
      throw new BillingKitError(
        `Payment method "${input.paymentMethodId}" not found on profile`,
        "PAYMENT_METHOD_NOT_FOUND",
      );
    }

    if (
      input.syncProvider === true &&
      profile.providerCustomerId &&
      method.providerPaymentMethodId &&
      isStripeBillingProvider(this.gateway)
    ) {
      await this.gateway.setDefaultPaymentMethod({
        customerId: profile.providerCustomerId,
        paymentMethodId: method.providerPaymentMethodId,
      });
    }

    return this.repository.save({
      ...profile,
      paymentMethods: this.applyDefaultPaymentMethod(
        profile.paymentMethods,
        method.id,
      ),
      paymentPreferences: {
        ...profile.paymentPreferences,
        defaultPaymentMethodId: method.id,
      },
      updatedAt: new Date(),
    });
  }

  private applyDefaultPaymentMethod(
    methods: SavedPaymentMethod[],
    defaultId: string,
  ): SavedPaymentMethod[] {
    return methods.map((m) => ({ ...m, isDefault: m.id === defaultId }));
  }

  private async requireProfile(id: string): Promise<CustomerBillingProfile> {
    const profile = await this.repository.findById(id);
    if (!profile) throw new CustomerProfileNotFoundError(id);
    return profile;
  }
}
