import type { EntitlementRepository } from "../interfaces/EntitlementRepository";
import type {
  CustomerEntitlement,
  CustomerFeatureAccess,
  EntitlementStatus,
  PlanFeatureMapping,
  RevokeFeatureAccessInput,
  SetPlanFeaturesInput,
  SyncSubscriptionEntitlementsInput,
} from "../types/entitlement";
import type { Subscription } from "../types/subscription";
import type { WebhookEvent } from "../types/webhook";
import { BillingKitError } from "../utils/errors";
import { generateId } from "../utils/id";

export class EntitlementError extends BillingKitError {
  constructor(message: string) {
    super(message, "ENTITLEMENT_ERROR");
    this.name = "EntitlementError";
  }
}

export class EntitlementService {
  constructor(private readonly repository: EntitlementRepository) {}

  async setPlanFeatures(
    input: SetPlanFeaturesInput,
  ): Promise<PlanFeatureMapping> {
    if (!input.planId.trim()) {
      throw new EntitlementError("planId is required");
    }
    const features = normalizeFeatures(input.features);
    const mapping = await this.repository.savePlanFeatures({
      planId: input.planId,
      features,
      updatedAt: new Date(),
    });
    const entitlements = await this.repository.listEntitlements();
    await Promise.all(
      entitlements
        .filter(
          (entitlement) =>
            entitlement.planId === input.planId &&
            entitlement.status === "active",
        )
        .map((entitlement) =>
          this.repository.saveEntitlement({
            ...entitlement,
            features,
            updatedAt: new Date(),
          }),
        ),
    );
    return mapping;
  }

  getPlanFeatures(planId: string): Promise<PlanFeatureMapping | null> {
    return this.repository.findPlanFeatures(planId);
  }

  async syncSubscriptionEntitlements(
    input: SyncSubscriptionEntitlementsInput,
  ): Promise<CustomerEntitlement | null> {
    const { subscription } = input;
    const existing = await this.repository.findBySubscription(subscription.id);
    const customerId = subscription.customerId || existing?.customerId;
    const planId = subscription.planId || existing?.planId;
    if (!customerId || !planId) return existing;

    const status = entitlementStatus(subscription);
    const mapping = await this.repository.findPlanFeatures(planId);
    const now = new Date();
    const entitlement: CustomerEntitlement = {
      id: existing?.id ?? generateId("ent"),
      customerId,
      subscriptionId: subscription.id,
      planId,
      features: mapping?.features ?? existing?.features ?? [],
      status,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      provider: subscription.provider,
      source: input.source ?? "manual",
      reason:
        status === "revoked"
          ? cancellationReason(subscription)
          : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return this.repository.saveEntitlement(entitlement);
  }

  async hasFeature(customerId: string, featureKey: string): Promise<boolean> {
    const access = await this.getCustomerFeatureAccess(customerId);
    return access.features.includes(featureKey);
  }

  async listFeatures(customerId: string): Promise<string[]> {
    return (await this.getCustomerFeatureAccess(customerId)).features;
  }

  async getCustomerFeatureAccess(
    customerId: string,
  ): Promise<CustomerFeatureAccess> {
    const entitlements = await this.repository.listByCustomer(customerId);
    const features = normalizeFeatures(
      entitlements
        .filter((entitlement) => entitlement.status === "active")
        .flatMap((entitlement) => entitlement.features),
    );
    return { customerId, features, entitlements };
  }

  getSubscriptionEntitlement(
    subscriptionId: string,
  ): Promise<CustomerEntitlement | null> {
    return this.repository.findBySubscription(subscriptionId);
  }

  async revokeFeatureAccess(
    input: RevokeFeatureAccessInput,
  ): Promise<CustomerEntitlement[]> {
    if (!input.customerId && !input.subscriptionId) {
      throw new EntitlementError(
        "customerId or subscriptionId is required",
      );
    }
    const entitlements = input.subscriptionId
      ? compact([
          await this.repository.findBySubscription(input.subscriptionId),
        ])
      : await this.repository.listByCustomer(input.customerId!);
    const now = new Date();
    return Promise.all(
      entitlements.map((entitlement) =>
        this.repository.saveEntitlement({
          ...entitlement,
          status: "revoked",
          source: input.source ?? "manual",
          reason: input.reason,
          updatedAt: now,
        }),
      ),
    );
  }

  async restoreAfterPayment(
    customerId?: string,
    subscriptionId?: string,
  ): Promise<CustomerEntitlement[]> {
    const entitlements = subscriptionId
      ? compact([
          await this.repository.findBySubscription(subscriptionId),
        ])
      : customerId
        ? await this.repository.listByCustomer(customerId)
        : [];
    const now = new Date();
    return Promise.all(
      entitlements
        .filter(
          (entitlement) =>
            entitlement.status === "revoked" &&
            entitlement.source === "payment_failure",
        )
        .map(async (entitlement) => {
          const mapping = await this.repository.findPlanFeatures(
            entitlement.planId,
          );
          return this.repository.saveEntitlement({
            ...entitlement,
            features: mapping?.features ?? entitlement.features,
            status: "active",
            subscriptionStatus: "active",
            source: "payment_recovery",
            reason: undefined,
            updatedAt: now,
          });
        }),
    );
  }

  async syncWebhookEvent(event: WebhookEvent): Promise<void> {
    const raw = webhookEntity(event);
    const customerId = stringValue(raw?.customer_id ?? raw?.customer);
    const subscriptionId =
      event.entity.kind === "subscription"
        ? event.entity.id
        : stringValue(
            raw?.subscription_id ??
              raw?.subscription ??
              event.entity.parentId,
          );

    if (
      event.normalizedType === "subscription.cancelled" ||
      event.type === "subscription.completed"
    ) {
      if (subscriptionId) {
        await this.revokeFeatureAccess({
          subscriptionId,
          source: "webhook",
          reason: event.type,
        });
      }
      return;
    }

    if (event.normalizedType === "payment.failed") {
      if (subscriptionId || customerId) {
        await this.revokeFeatureAccess({
          subscriptionId,
          customerId,
          source: "payment_failure",
          reason: event.type,
        });
      }
      return;
    }

    if (
      event.normalizedType === "subscription.charged" ||
      event.normalizedType === "invoice.paid"
    ) {
      const existing = subscriptionId
        ? await this.repository.findBySubscription(subscriptionId)
        : null;
      await this.restoreAfterPayment(customerId, subscriptionId);
      const planId =
        stringValue(raw?.plan_id) ??
        stripePlanId(raw);
      if (!existing && subscriptionId && customerId && planId) {
        const currentPeriodEndSeconds = numberValue(
          raw?.current_period_end ?? raw?.current_end,
        );
        await this.syncSubscriptionEntitlements({
          source: "webhook",
          subscription: {
            id: subscriptionId,
            customerId,
            planId,
            status: event.entity.status ?? "active",
            currentPeriodEnd:
              currentPeriodEndSeconds !== undefined
                ? new Date(currentPeriodEndSeconds * 1000)
                : new Date(),
            cancelAtPeriodEnd: false,
            provider: event.provider,
          },
        });
      }
      return;
    }

    if (
      event.normalizedType !== "subscription.activated" ||
      !subscriptionId
    ) {
      return;
    }

    const existing = await this.repository.findBySubscription(subscriptionId);
    const planId =
      stringValue(raw?.plan_id) ??
      stripePlanId(raw) ??
      event.entity.parentId ??
      existing?.planId;
    const resolvedCustomerId = customerId ?? existing?.customerId;
    if (!planId || !resolvedCustomerId) return;

    const currentPeriodEndSeconds = numberValue(
      raw?.current_period_end ?? raw?.current_end,
    );
    await this.syncSubscriptionEntitlements({
      source: "webhook",
      subscription: {
        id: subscriptionId,
        customerId: resolvedCustomerId,
        planId,
        status: event.entity.status ?? stringValue(raw?.status) ?? "active",
        currentPeriodEnd:
          currentPeriodEndSeconds !== undefined
            ? new Date(currentPeriodEndSeconds * 1000)
            : existing?.currentPeriodEnd ?? new Date(),
        cancelAtPeriodEnd:
          booleanValue(raw?.cancel_at_period_end) ?? false,
        paused: Boolean(raw?.pause_collection),
        provider: event.provider,
      },
    });
  }
}

function entitlementStatus(subscription: Subscription): EntitlementStatus {
  const status = subscription.status.toLowerCase();
  if (subscription.paused || status === "paused") return "paused";
  if (
    subscription.cancelAtPeriodEnd ||
    [
      "canceled",
      "cancelled",
      "completed",
      "expired",
      "halted",
      "unpaid",
      "past_due",
      "incomplete_expired",
    ].includes(status)
  ) {
    return "revoked";
  }
  if (["active", "trialing", "authenticated"].includes(status)) {
    return "active";
  }
  return "revoked";
}

function cancellationReason(subscription: Subscription): string {
  return subscription.cancelAtPeriodEnd
    ? "cancel_at_period_end"
    : subscription.status;
}

function normalizeFeatures(features: string[]): string[] {
  return [...new Set(features.map((feature) => feature.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function webhookEntity(
  event: WebhookEvent,
): Record<string, unknown> | undefined {
  if (!event.data || typeof event.data !== "object") return undefined;
  const data = event.data as Record<string, unknown>;
  const subscription = data.subscription;
  if (subscription && typeof subscription === "object") {
    const entity = (subscription as Record<string, unknown>).entity;
    if (entity && typeof entity === "object") {
      return entity as Record<string, unknown>;
    }
  }
  const invoice = data.invoice;
  if (invoice && typeof invoice === "object") {
    const entity = (invoice as Record<string, unknown>).entity;
    if (entity && typeof entity === "object") {
      return entity as Record<string, unknown>;
    }
  }
  const payment = data.payment;
  if (payment && typeof payment === "object") {
    const entity = (payment as Record<string, unknown>).entity;
    if (entity && typeof entity === "object") {
      return entity as Record<string, unknown>;
    }
  }
  return data;
}

function stripePlanId(
  raw: Record<string, unknown> | undefined,
): string | undefined {
  const items = raw?.items;
  if (!items || typeof items !== "object") return undefined;
  const data = (items as { data?: unknown }).data;
  if (!Array.isArray(data)) return undefined;
  const first = data[0];
  if (!first || typeof first !== "object") return undefined;
  const price = (first as Record<string, unknown>).price;
  if (typeof price === "string") return price;
  if (!price || typeof price !== "object") return undefined;
  return stringValue((price as Record<string, unknown>).id);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object") {
    return stringValue((value as Record<string, unknown>).id);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined);
}
