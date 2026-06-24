import { describe, expect, it } from "vitest";
import { calculateGST } from "../src/tax/GSTCalculator";

describe("calculateGST", () => {
  it("splits CGST and SGST for same-state transactions", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result).toEqual({
      taxableAmount: 10000,
      cgst: 900,
      sgst: 900,
      igst: 0,
      totalTax: 1800,
      total: 11800,
    });
  });

  it("applies IGST for inter-state transactions", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "KA",
    });

    expect(result).toEqual({
      taxableAmount: 10000,
      cgst: 0,
      sgst: 0,
      igst: 1800,
      totalTax: 1800,
      total: 11800,
    });
  });

  it("returns zero tax when rate is 0", () => {
    const result = calculateGST({
      amount: 5000,
      rate: 0,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result.totalTax).toBe(0);
    expect(result.total).toBe(5000);
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
    expect(result.igst).toBe(0);
  });
});
