import type {
  ClaimTransferRequestResult,
  TransferRequestFilter,
  TransferRequestRecord,
} from "../types/route";

export interface TransferRequestRepository {
  claim(
    record: TransferRequestRecord,
  ): Promise<ClaimTransferRequestResult>;
  save(record: TransferRequestRecord): Promise<TransferRequestRecord>;
  findByKey(idempotencyKey: string): Promise<TransferRequestRecord | null>;
  list(filter?: TransferRequestFilter): Promise<TransferRequestRecord[]>;
}
