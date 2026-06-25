import { calculateGST, calculateVAT } from "../src/tax";

describe("TaxService", () => {
  describe("calculateGST", () => {
    it("splits CGST and SGST for same-state transactions", () => {
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

    it("applies IGST for inter-state transactions", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "MH",
        buyerState: "KA",
      });

      expect(result.igst).toBe(1800);
      expect(result.cgst).toBe(0);
      expect(result.total).toBe(11800);
    });
  });

  describe("calculateVAT", () => {
    it("calculates VAT correctly", () => {
      const result = calculateVAT({ amount: 10000, rate: 20 });

      expect(result.vat).toBe(2000);
      expect(result.totalTax).toBe(2000);
      expect(result.total).toBe(12000);
    });
  });
});
