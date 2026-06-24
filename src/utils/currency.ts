const MINOR_UNIT_FACTORS: Record<string, number> = {
  inr: 100,
  usd: 100,
  eur: 100,
  gbp: 100,
};

export function toMinorUnits(amount: number, currency: string): number {
  const factor = MINOR_UNIT_FACTORS[currency.toLowerCase()] ?? 100;
  return Math.round(amount * factor);
}

export function fromMinorUnits(amount: number, currency: string): number {
  const factor = MINOR_UNIT_FACTORS[currency.toLowerCase()] ?? 100;
  return amount / factor;
}

export function normalizeCurrency(currency?: string): string {
  return (currency ?? "inr").toLowerCase();
}
