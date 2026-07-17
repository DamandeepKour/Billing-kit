import { calculateGST, calculateVAT, TaxService } from "../src/tax";

describe("calculateGST", () => {
  it("splits CGST and SGST for intra-state supply", () => {
    expect(
      calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      }),
    ).toEqual({
      taxableAmount: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      vat: 0,
      totalTax: 1800,
      total: 11800,
    });
  });

  it("applies IGST for inter-state supply", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "KA",
    });

    expect(result.igst).toBe(1800);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.total).toBe(11800);
  });

  it("is case-insensitive for state codes", () => {
    const result = calculateGST({
      amount: 1000,
      rate: 18,
      sellerState: "mh",
      buyerState: "MH",
    });

    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
  });

  it("returns zero tax when rate is 0", () => {
    const result = calculateGST({
      amount: 5000,
      rate: 0,
      sellerState: "MH",
      buyerState: "KA",
    });

    expect(result.totalTax).toBe(0);
    expect(result.total).toBe(5000);
  });

  it("defaults rate to 0 when omitted", () => {
    const result = calculateGST({
      amount: 1000,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result.totalTax).toBe(0);
  });

  it("rejects negative amount", () => {
    expect(() =>
      calculateGST({
        amount: -1,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      }),
    ).toThrow("Amount and rate must be non-negative");
  });

  it("rejects negative rate", () => {
    expect(() =>
      calculateGST({
        amount: 1000,
        rate: -5,
        sellerState: "MH",
        buyerState: "MH",
      }),
    ).toThrow("Amount and rate must be non-negative");
  });

  it("rounds odd tax splits so CGST + SGST equals totalTax", () => {
    const result = calculateGST({
      amount: 10001,
      rate: 18,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result.cgst + result.sgst).toBe(result.totalTax);
  });
});

describe("calculateVAT", () => {
  it("calculates VAT correctly", () => {
    const result = calculateVAT({ amount: 10000, rate: 20 });

    expect(result.vat).toBe(2000);
    expect(result.totalTax).toBe(2000);
    expect(result.total).toBe(12000);
    expect(result.cgst).toBe(0);
    expect(result.igst).toBe(0);
  });

  it("defaults rate to 0 when omitted", () => {
    expect(calculateVAT({ amount: 10000 }).vat).toBe(0);
  });

  it("rejects negative inputs", () => {
    expect(() => calculateVAT({ amount: -10, rate: 20 })).toThrow();
    expect(() => calculateVAT({ amount: 100, rate: -1 })).toThrow();
  });
});

describe("TaxService", () => {
  const service = new TaxService();

  it("delegates GST and VAT", () => {
    expect(
      service.calculateGST({
        amount: 1000,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      }).totalTax,
    ).toBe(180);
    expect(service.calculateVAT({ amount: 1000, rate: 10 }).vat).toBe(100);
  });
});
