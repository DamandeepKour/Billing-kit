import type {
  ClaimIdempotencyRequestResult,
  IdempotencyRequestFilter,
  IdempotencyRequestRecord,
} from "../types/idempotency";

export interface IdempotencyRequestRepository {
  claim(
    record: IdempotencyRequestRecord,
  ): Promise<ClaimIdempotencyRequestResult>;
  save(record: IdempotencyRequestRecord): Promise<IdempotencyRequestRecord>;
  findByKey(idempotencyKey: string): Promise<IdempotencyRequestRecord | null>;
  list(
    filter?: IdempotencyRequestFilter,
  ): Promise<IdempotencyRequestRecord[]>;
}
