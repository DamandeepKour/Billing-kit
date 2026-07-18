import {
  calculateGST,
  calculateVAT,
  calculateSalesTax,
  TaxEngine,
  TaxService,
} from "../src/tax";

describe("GST engine — India", () => {
  it("MH → MH applies CGST + SGST (intra-state)", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result.taxType).toBe("gst");
    expect(result.taxPercent).toBe(18);
    expect(result.cgst).toBe(900);
    expect(result.sgst).toBe(900);
    expect(result.igst).toBe(0);
    expect(result.totalTax).toBe(1800);
    expect(result.total).toBe(11800);
    expect(result.taxLines).toEqual([
      { name: "CGST", rate: 9, amount: 900 },
      { name: "SGST", rate: 9, amount: 900 },
    ]);
    expect(result.placeOfSupply).toBe("MH");
  });

  it("MH → DL applies IGST (inter-state)", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "DL",
    });

    expect(result.taxType).toBe("gst");
    expect(result.igst).toBe(1800);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.taxLines).toEqual([
      { name: "IGST", rate: 18, amount: 1800 },
    ]);
    expect(result.placeOfSupply).toBe("DL");
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

  it("rounds odd tax splits so CGST + SGST equals totalTax", () => {
    const result = calculateGST({
      amount: 10001,
      rate: 18,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(result.cgst + result.sgst).toBe(result.totalTax);
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
});

describe("VAT engine — EU", () => {
  it("calculates standard VAT", () => {
    const result = calculateVAT({ amount: 10000, rate: 20, country: "DE" });

    expect(result.taxType).toBe("vat");
    expect(result.vat).toBe(2000);
    expect(result.taxLines).toEqual([{ name: "VAT", rate: 20, amount: 2000 }]);
    expect(result.reverseCharge).toBe(false);
  });

  it("applies reverse charge for B2B with VAT ID", () => {
    const result = calculateVAT({
      amount: 10000,
      rate: 20,
      country: "DE",
      isBusinessCustomer: true,
      customerTaxId: "DE123456789",
    });

    expect(result.vat).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.reverseCharge).toBe(true);
    expect(result.taxLines).toEqual([]);
  });
});

describe("Sales tax engine — US", () => {
  it("applies CA sales tax", () => {
    const result = calculateSalesTax({
      amount: 10000,
      state: "CA",
      country: "US",
    });

    expect(result.taxType).toBe("sales_tax");
    expect(result.salesTax).toBe(725);
    expect(result.taxLines[0]?.name).toBe("Sales Tax");
  });
});

describe("TaxEngine autoTax", () => {
  const engine = new TaxEngine();

  it("detects GST for India", () => {
    const result = engine.calculate({
      amount: 10000,
      autoTax: true,
      country: "IN",
      sellerState: "MH",
      buyerState: "MH",
      rate: 18,
    });

    expect(result.taxType).toBe("gst");
    expect(result.cgst).toBe(900);
  });

  it("detects VAT for Germany", () => {
    const result = engine.calculate({
      amount: 10000,
      autoTax: true,
      country: "DE",
    });

    expect(result.taxType).toBe("vat");
    expect(result.vat).toBe(1900);
  });

  it("detects sales tax for US", () => {
    const result = engine.calculate({
      amount: 10000,
      autoTax: true,
      country: "US",
      state: "NY",
    });

    expect(result.taxType).toBe("sales_tax");
    expect(result.salesTax).toBe(800);
  });
});

describe("TaxService facade", () => {
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
