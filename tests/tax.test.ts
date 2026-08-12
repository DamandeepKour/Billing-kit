import {
  calculateGST,
  calculateVAT,
  calculateSalesTax,
  calculateLineItemTaxes,
  detectTaxType,
  defaultRateFor,
  isEuCountry,
  normalizeRegionCode,
  TaxEngine,
  TaxService,
} from "../src/tax";

describe("tax / GST (India)", () => {
  describe("intra-state (CGST + SGST)", () => {
    it("MH → MH splits 18% evenly into CGST and SGST", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result).toMatchObject({
        taxType: "gst",
        taxPercent: 18,
        cgst: 900,
        sgst: 900,
        igst: 0,
        totalTax: 1800,
        total: 11800,
        placeOfSupply: "MH",
      });
      expect(result.taxLines).toEqual([
        { name: "CGST", rate: 9, amount: 900 },
        { name: "SGST", rate: 9, amount: 900 },
      ]);
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

    it("rounds odd tax splits so CGST + SGST equals totalTax", () => {
      const result = calculateGST({
        amount: 10001,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result.cgst + result.sgst).toBe(result.totalTax);
      expect(result.total).toBe(result.taxableAmount + result.totalTax);
    });

    it("uses 5% GST when rate is provided", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 5,
        sellerState: "KA",
        buyerState: "KA",
      });

      expect(result.cgst).toBe(250);
      expect(result.sgst).toBe(250);
      expect(result.totalTax).toBe(500);
    });
  });

  describe("inter-state (IGST)", () => {
    it("MH → DL applies full rate as IGST", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "MH",
        buyerState: "DL",
      });

      expect(result).toMatchObject({
        taxType: "gst",
        igst: 1800,
        cgst: 0,
        sgst: 0,
        totalTax: 1800,
        placeOfSupply: "DL",
      });
      expect(result.taxLines).toEqual([{ name: "IGST", rate: 18, amount: 1800 }]);
    });

    it("treats missing seller state as inter-state (IGST)", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "",
        buyerState: "MH",
      });

      expect(result.igst).toBe(1800);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
    });

    it("treats missing buyer state as inter-state (IGST)", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 18,
        sellerState: "MH",
        buyerState: "",
      });

      expect(result.igst).toBe(1800);
      expect(result.placeOfSupply).toBe("");
    });
  });

  describe("edge cases", () => {
    it("returns zero tax lines when amount is zero", () => {
      const result = calculateGST({
        amount: 0,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result.totalTax).toBe(0);
      expect(result.total).toBe(0);
      expect(result.taxLines).toEqual([]);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
    });

    it("returns zero tax when rate is zero", () => {
      const result = calculateGST({
        amount: 10000,
        rate: 0,
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result.totalTax).toBe(0);
      expect(result.total).toBe(10000);
      expect(result.taxLines).toEqual([]);
    });

    it("defaults missing rate to standard 18% GST", () => {
      const result = calculateGST({
        amount: 10000,
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result.taxPercent).toBe(18);
      expect(result.totalTax).toBe(1800);
      expect(result.cgst).toBe(900);
      expect(result.sgst).toBe(900);
    });

    it("rejects negative amount", () => {
      expect(() =>
        calculateGST({
          amount: -1,
          rate: 18,
          sellerState: "MH",
          buyerState: "MH",
        }),
      ).toThrow(/amount must be a non-negative/);
    });

    it("rejects negative rate", () => {
      expect(() =>
        calculateGST({
          amount: 1000,
          rate: -5,
          sellerState: "MH",
          buyerState: "MH",
        }),
      ).toThrow(/rate must be a non-negative/);
    });
  });
});

describe("tax / VAT", () => {
  it("calculates standard VAT", () => {
    const result = calculateVAT({ amount: 10000, rate: 20, country: "DE" });

    expect(result).toMatchObject({
      taxType: "vat",
      vat: 2000,
      totalTax: 2000,
      total: 12000,
      reverseCharge: false,
    });
    expect(result.taxLines).toEqual([{ name: "VAT", rate: 20, amount: 2000 }]);
  });

  it("applies reverse charge for B2B with VAT ID outside India", () => {
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

  it("does not reverse-charge when tax ID is missing", () => {
    const result = calculateVAT({
      amount: 10000,
      rate: 20,
      country: "DE",
      isBusinessCustomer: true,
    });

    expect(result.reverseCharge).toBe(false);
    expect(result.vat).toBe(2000);
  });

  it("does not reverse-charge for India even with tax ID", () => {
    const result = calculateVAT({
      amount: 10000,
      rate: 18,
      country: "IN",
      isBusinessCustomer: true,
      customerTaxId: "27AAAAA0000A1Z5",
    });

    expect(result.reverseCharge).toBe(false);
    expect(result.vat).toBe(1800);
  });

  it("returns zero VAT for zero amount", () => {
    const result = calculateVAT({ amount: 0, rate: 20, country: "DE" });

    expect(result.vat).toBe(0);
    expect(result.total).toBe(0);
    expect(result.taxLines).toEqual([]);
  });

  it("rejects negative amount", () => {
    expect(() => calculateVAT({ amount: -100, rate: 20 })).toThrow(
      /amount must be a non-negative/,
    );
  });

  it("resolves the default EU rate for a country when no rate is given", () => {
    // Listed country falls back to defaultRateFor("vat", country) inside
    // calculateVAT itself (not pre-resolved by the caller).
    const listed = calculateVAT({ amount: 10000, country: "FR" });
    expect(listed.taxPercent).toBe(20);
    expect(listed.vat).toBe(2000);

    // Unlisted EU-ish country falls back to EU_VAT_RATES.default (20%).
    const unlisted = calculateVAT({ amount: 10000, country: "PT" });
    expect(unlisted.taxPercent).toBe(20);
    expect(unlisted.vat).toBe(2000);
  });

  it("defaults rate to 0 when both rate and country are omitted", () => {
    const result = calculateVAT({ amount: 10000 });
    expect(result.taxPercent).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.total).toBe(10000);
  });
});

describe("tax / sales tax (generic US)", () => {
  it("applies CA sales tax", () => {
    const result = calculateSalesTax({
      amount: 10000,
      state: "CA",
      country: "US",
    });

    expect(result).toMatchObject({
      taxType: "sales_tax",
      salesTax: 725,
      totalTax: 725,
      total: 10725,
    });
    expect(result.taxLines[0]?.name).toBe("Sales Tax");
  });

  it("uses 0% for unknown US states", () => {
    const result = calculateSalesTax({
      amount: 10000,
      state: "XX",
      country: "US",
    });

    expect(result.salesTax).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.taxLines).toEqual([]);
  });

  it("honors explicit rate over state table", () => {
    const result = calculateSalesTax({
      amount: 10000,
      state: "CA",
      rate: 10,
      country: "US",
    });

    expect(result.salesTax).toBe(1000);
  });
});

describe("tax / TaxEngine", () => {
  const engine = new TaxEngine();

  describe("autoTax detection", () => {
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

    it("detects VAT for Germany at default 19%", () => {
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

    it("defaults non-EU countries to VAT", () => {
      const result = engine.calculate({
        amount: 10000,
        autoTax: true,
        country: "AU",
      });

      expect(result.taxType).toBe("vat");
      expect(result.vat).toBe(2000);
    });
  });

  describe("edge cases", () => {
    it("short-circuits zero amount to empty breakdown", () => {
      const result = engine.calculate({
        amount: 0,
        autoTax: true,
        country: "IN",
        sellerState: "MH",
        buyerState: "MH",
      });

      expect(result).toMatchObject({
        taxType: "none",
        totalTax: 0,
        total: 0,
        taxableAmount: 0,
      });
      expect(result.taxLines).toEqual([]);
    });

    it("returns no tax when taxType is none", () => {
      const result = engine.calculate({
        amount: 10000,
        taxType: "none",
        country: "IN",
      });

      expect(result.taxType).toBe("none");
      expect(result.totalTax).toBe(0);
      expect(result.total).toBe(10000);
    });

    it("returns no tax when country and taxType are missing", () => {
      const result = engine.calculate({ amount: 5000 });

      expect(result.taxType).toBe("none");
      expect(result.totalTax).toBe(0);
    });

    it("rejects negative amount before tax routing", () => {
      expect(() =>
        engine.calculate({ amount: -1, autoTax: true, country: "DE" }),
      ).toThrow(/amount must be a non-negative/);
    });

    it("returns no tax when autoTax is true but no country is given", () => {
      const result = engine.calculate({ amount: 10000, autoTax: true });

      expect(result.taxType).toBe("none");
      expect(result.totalTax).toBe(0);
      expect(result.total).toBe(10000);
    });
  });
});

describe("tax / region helpers", () => {
  describe("isEuCountry", () => {
    it("recognizes EU member codes case-insensitively", () => {
      expect(isEuCountry("DE")).toBe(true);
      expect(isEuCountry("fr")).toBe(true);
    });

    it("returns false for non-EU or missing country codes", () => {
      expect(isEuCountry("US")).toBe(false);
      expect(isEuCountry("IN")).toBe(false);
      expect(isEuCountry(undefined)).toBe(false);
      expect(isEuCountry("")).toBe(false);
    });
  });

  describe("normalizeRegionCode", () => {
    it("trims and upper-cases region codes", () => {
      expect(normalizeRegionCode(" mh ")).toBe("MH");
      expect(normalizeRegionCode(undefined)).toBe("");
    });
  });

  describe("detectTaxType", () => {
    it("prefers an explicit taxType over country detection", () => {
      expect(detectTaxType("US", "gst")).toBe("gst");
    });

    it("ignores an explicit taxType of 'none' and detects from country", () => {
      expect(detectTaxType("IN", "none")).toBe("gst");
    });

    it("maps India to gst, the US to sales_tax, and EU countries to vat", () => {
      expect(detectTaxType("IN")).toBe("gst");
      expect(detectTaxType("US")).toBe("sales_tax");
      expect(detectTaxType("DE")).toBe("vat");
    });

    it("defaults unlisted countries to vat", () => {
      expect(detectTaxType("AU")).toBe("vat");
    });

    it("returns 'none' when there is no country and no explicit type", () => {
      expect(detectTaxType(undefined, undefined)).toBe("none");
      expect(detectTaxType("", undefined)).toBe("none");
    });
  });

  describe("defaultRateFor", () => {
    it("returns the flat 18% GST rate regardless of region", () => {
      expect(defaultRateFor("gst")).toBe(18);
      expect(defaultRateFor("gst", "IN", "MH")).toBe(18);
    });

    it("looks up US sales tax by state, defaulting unknown states to 0", () => {
      expect(defaultRateFor("sales_tax", "US", "CA")).toBe(7.25);
      expect(defaultRateFor("sales_tax", "US", "ZZ")).toBe(0);
    });

    it("looks up EU VAT by country, falling back to the EU default", () => {
      expect(defaultRateFor("vat", "FR")).toBe(20);
      expect(defaultRateFor("vat", "PT")).toBe(20); // unlisted → EU_VAT_RATES.default
    });

    it("returns 0 for taxType 'none'", () => {
      expect(defaultRateFor("none")).toBe(0);
    });
  });
});

describe("tax / calculateLineItemTaxes", () => {
  it("returns an empty, zeroed summary for an empty line item list", () => {
    const { lines, summary } = calculateLineItemTaxes({
      lineItems: [],
      base: { taxType: "gst", sellerState: "MH", buyerState: "MH", country: "IN" },
    });

    expect(lines).toEqual([]);
    expect(summary).toMatchObject({
      taxType: "gst",
      taxableAmount: 0,
      totalTax: 0,
      total: 0,
      taxLines: [],
    });
  });

  it("falls back to 'none' when the empty list has no base taxType either", () => {
    const { summary } = calculateLineItemTaxes({ lineItems: [], base: {} });

    expect(summary.taxType).toBe("none");
    expect(summary.total).toBe(0);
  });
});

describe("tax / TaxService facade", () => {
  const service = new TaxService();

  it("delegates GST, VAT, and sales tax", () => {
    expect(
      service.calculateGST({
        amount: 1000,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      }).totalTax,
    ).toBe(180);
    expect(service.calculateVAT({ amount: 1000, rate: 10 }).vat).toBe(100);
    expect(
      service.calculateSalesTax({ amount: 1000, state: "NY", country: "US" })
        .salesTax,
    ).toBe(80);
  });

  it("routes calculate() through the engine", () => {
    const result = service.calculate({
      amount: 10000,
      taxType: "vat",
      rate: 20,
      country: "FR",
    });

    expect(result.vat).toBe(2000);
  });

  it("summarizes tax breakdowns for invoices", () => {
    const breakdown = service.calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: "MH",
      buyerState: "KA",
      customerTaxId: "29AAAAA0000A1Z5",
    });
    const summary = service.summarize(breakdown);

    expect(summary).toMatchObject({
      taxType: "gst",
      igst: 1800,
      customerTaxId: "29AAAAA0000A1Z5",
      totalTax: 1800,
    });
    expect(summary.taxLines).toEqual([
      { name: "IGST", rate: 18, amount: 1800 },
    ]);
  });

  it("calculates per-line taxes and rolls up", () => {
    const { lines, summary } = service.calculateLineItems({
      lineItems: [
        { id: "a", amount: 10000, taxRate: 18 },
        { id: "b", amount: 5000, taxRate: 5 },
      ],
      base: {
        taxType: "gst",
        sellerState: "MH",
        buyerState: "MH",
        country: "IN",
      },
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]?.tax.cgst).toBe(900);
    expect(lines[1]?.tax.totalTax).toBe(250);
    expect(summary.totalTax).toBe(2050);
  });
});
