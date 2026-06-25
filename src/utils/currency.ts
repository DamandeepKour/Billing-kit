const MINOR_UNIT_FACTORS: Record<string, number> = {
  inr: 100,
  usd: 100,
  eur: 100,
  gbp: 100,
};

export function normalizeCurrency(currency?: string): string {
  return (currency ?? "inr").toLowerCase();
}

export function roundAmount(value: number): number {
  return Math.round(value);
}

export function toMinorUnits(amount: number, currency: string): number {
  const factor = MINOR_UNIT_FACTORS[normalizeCurrency(currency)] ?? 100;
  return roundAmount(amount * factor);
}
