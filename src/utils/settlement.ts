import type {
  ExchangeRateMetadata,
  FeeBreakdown,
  SettlementFields,
} from "../types/settlement";
export function calculateFeeBreakdown(input: {
  gross: number;
  fee: number;
  taxOnFee?: number;
}): FeeBreakdown {
  const taxOnFee = input.taxOnFee ?? 0;
  return {
    gross: input.gross,
    fee: input.fee,
    taxOnFee,
    net: input.gross - input.fee - taxOnFee,
  };
}
export interface NormalizeSettlementInput {
  amount: number;
  currency: string;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: Partial<FeeBreakdown> & {
    gross?: number;
    fee?: number;
  };
  providerResponse?: Record<string, unknown>;
}
export function normalizeSettlementFields(
  input: NormalizeSettlementInput,
): SettlementFields {
  const presentmentCurrency = (input.presentmentCurrency ?? input.currency).toLowerCase();
  const settlementCurrency = (
    input.settlementCurrency ?? presentmentCurrency
  ).toLowerCase();
  const presentmentAmount = input.presentmentAmount ?? input.amount;
  let fees: FeeBreakdown | undefined;
  if (input.fees) {
    const gross = input.fees.gross ?? input.settlementAmount ?? presentmentAmount;
    const fee = input.fees.fee ?? 0;
    const taxOnFee = input.fees.taxOnFee ?? 0;
    fees =
      input.fees.net !== undefined
        ? {
            gross,
            fee,
            taxOnFee,
            net: input.fees.net,
          }
        : calculateFeeBreakdown({ gross, fee, taxOnFee });
  }
  const settlementAmount = input.settlementAmount ?? fees?.net ?? presentmentAmount;
  return {
    presentmentCurrency,
    settlementCurrency,
    presentmentAmount,
    settlementAmount,
    exchangeRate: input.exchangeRate,
    fees,
    providerResponse: input.providerResponse,
  };
}
