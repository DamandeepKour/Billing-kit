import type { UsageEvent, UsageEventFilter } from "../types/usage";

export interface UsageEventRepository {
  save(event: UsageEvent): Promise<UsageEvent>;
  findById(id: string): Promise<UsageEvent | null>;
  list(filter?: UsageEventFilter): Promise<UsageEvent[]>;
}
