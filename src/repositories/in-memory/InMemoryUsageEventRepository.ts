import type { UsageEventRepository } from "../../interfaces/UsageEventRepository";
import type { UsageEvent, UsageEventFilter } from "../../types/usage";

export class InMemoryUsageEventRepository implements UsageEventRepository {
  private readonly store = new Map<string, UsageEvent>();

  async save(event: UsageEvent): Promise<UsageEvent> {
    this.store.set(event.id, event);
    return event;
  }

  async findById(id: string): Promise<UsageEvent | null> {
    return this.store.get(id) ?? null;
  }

  async list(filter?: UsageEventFilter): Promise<UsageEvent[]> {
    let events = [...this.store.values()];

    if (filter?.customerId) {
      const customerId = filter.customerId;
      events = events.filter((event) => event.customerId === customerId);
    }
    if (filter?.meter) {
      const meters = new Set(
        Array.isArray(filter.meter) ? filter.meter : [filter.meter],
      );
      events = events.filter((event) => meters.has(event.meter));
    }
    if (filter?.subscriptionId) {
      const subscriptionId = filter.subscriptionId;
      events = events.filter(
        (event) => event.subscriptionId === subscriptionId,
      );
    }
    if (filter?.from) {
      const from = filter.from;
      events = events.filter((event) => event.timestamp >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      events = events.filter((event) => event.timestamp < to);
    }

    return events.sort(
      (a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  }
}
