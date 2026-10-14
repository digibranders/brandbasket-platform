import type { TaxInvoice, TaxInvoiceLineRecord } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { adjacentMonth, monthRange, registerCsv, RegisterInvoiceError, registerInvoiceOf, registerTotals, type RegisterInvoice } from "./invoice-register";

const invoice = (overrides: Partial<RegisterInvoice>): RegisterInvoice => ({
  number: "FY/26-27/000001",
  issuedOn: "2026-10-09",
  recipientName: "QA Premium Business",
  recipientGstin: "27AAPFU0939F1ZV",
  placeOfSupplyStateCode: "mh",
  sac: "998361",
  taxableCents: 559_920,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  roundOffCents: 0,
  totalCents: 660_706,
  ...overrides,
});

const interState = (overrides: Partial<RegisterInvoice> = {}): RegisterInvoice =>
  invoice({
    number: "FY/26-27/000002",
    recipientGstin: null,
    placeOfSupplyStateCode: "ka",
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 100_786,
    ...overrides,
  });

const lineOf = (overrides: Partial<TaxInvoiceLineRecord> = {}): TaxInvoiceLineRecord => ({
  description: "Fynix Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: null,
  sac: "998361",
  quantity: 1,
  unitAmountCents: 559_920,
  grossAmountCents: 559_920,
  discountAmountCents: 0,
  taxableCents: 559_920,
  taxRateBasisPoints: 1_800,
  cgstCents: 50_393,
  sgstCents: 50_393,
  igstCents: 0,
  taxCents: 100_786,
  ...overrides,
});

function stored(overrides: Partial<TaxInvoice> = {}): TaxInvoice {
  return {
    id: "01920000-0000-7000-8000-000000000001",
    businessId: "01920000-0000-7000-8000-0000000000b1",
    paymentId: "01920000-0000-7000-8000-0000000000a1",
    prefix: "FY",
    financialYear: "26-27",
    serial: 1,
    number: "FY/26-27/000001",
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier: {
      legalName: "Digibranders Private Limited",
      tradeName: "Fynix",
      gstin: "27AAICD9268J1Z0",
      cin: null,
      addressLines: ["Thane West"],
      stateCode: "mh",
      email: null,
      phone: null,
    },
    recipient: {
      legalName: "QA Premium Business",
      tradeName: null,
      gstin: "27AAPFU0939F1ZV",
      cin: null,
      addressLines: ["Mumbai"],
      stateCode: "mh",
      email: null,
      phone: null,
    },
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "gstin",
    supplyType: "intra_state",
    lines: [lineOf()],
    taxableCents: 559_920,
    cgstCents: 50_393,
    sgstCents: 50_393,
    igstCents: 0,
    roundOffCents: 0,
    totalCents: 660_706,
    paymentLabel: "Visa credit card ending 4366",
    paymentReference: "pay_TljxffN6THodkg",
    createdAt: new Date("2026-10-09T06:00:00Z"),
    ...overrides,
  };
}

const rowsOf = (csv: string): string[] => csv.split("\r\n");

describe("registerTotals", () => {
  it("totals a month, splitting B2B (with GSTIN) from B2C", () => {
    const totals = registerTotals([invoice({}), interState()]);
    expect(totals).toEqual({
      count: 2,
      b2b: { count: 1, taxableCents: 559_920, taxCents: 100_786 },
      b2c: { count: 1, taxableCents: 559_920, taxCents: 100_786 },
      taxableCents: 1_119_840,
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 100_786,
      roundOffCents: 0,
      totalCents: 1_321_412,
    });
  });

  it("is all zeros for a month with no invoices", () => {
    expect(registerTotals([])).toEqual({
      count: 0,
      b2b: { count: 0, taxableCents: 0, taxCents: 0 },
      b2c: { count: 0, taxableCents: 0, taxCents: 0 },
      taxableCents: 0,
      cgstCents: 0,
      sgstCents: 0,
      igstCents: 0,
      roundOffCents: 0,
      totalCents: 0,
    });
  });

  it("reconciles: taxable + CGST + SGST + IGST + round off equals the total, for each invoice and for the month", () => {
    // A round off of a paisa either way is the only gap an invoice may have between its parts and its total.
    const rows = [
      invoice({}),
      interState(),
      invoice({ number: "FY/26-27/000003", taxableCents: 100_001, cgstCents: 9_000, sgstCents: 9_000, roundOffCents: -1, totalCents: 118_000 }),
      invoice({ number: "FY/26-27/000004", taxableCents: 100_005, cgstCents: 9_000, sgstCents: 9_000, roundOffCents: 5, totalCents: 118_010 }),
    ];
    const partsOf = (row: RegisterInvoice): number => row.taxableCents + row.cgstCents + row.sgstCents + row.igstCents + row.roundOffCents;
    for (const row of rows) expect(partsOf(row)).toBe(row.totalCents);

    const totals = registerTotals(rows);
    expect(totals.taxableCents + totals.cgstCents + totals.sgstCents + totals.igstCents + totals.roundOffCents).toBe(totals.totalCents);
    expect(totals.totalCents).toBe(rows.reduce((sum, row) => sum + row.totalCents, 0));
    expect(totals.b2b.taxableCents + totals.b2c.taxableCents).toBe(totals.taxableCents);
    expect(totals.b2b.taxCents + totals.b2c.taxCents).toBe(totals.cgstCents + totals.sgstCents + totals.igstCents);
    expect(totals.b2b.count + totals.b2c.count).toBe(totals.count);
  });

  it("sums the figures the CSV prints, so the page and the file agree", () => {
    const rows = [invoice({}), interState(), invoice({ number: "FY/26-27/000003", recipientGstin: null, roundOffCents: -1, totalCents: 660_705 })];
    const printed = rowsOf(registerCsv(rows)).slice(1).map((line) => line.split(","));
    const sumOfColumn = (index: number): number => printed.reduce((sum, cells) => sum + Math.round(Number(cells[index]) * 100), 0);
    const totals = registerTotals(rows);
    expect([sumOfColumn(7), sumOfColumn(8), sumOfColumn(9), sumOfColumn(10), sumOfColumn(11), sumOfColumn(12)]).toEqual([
      totals.taxableCents,
      totals.cgstCents,
      totals.sgstCents,
      totals.igstCents,
      totals.roundOffCents,
      totals.totalCents,
    ]);
  });
});

describe("monthRange", () => {
  it("gives a month's first day and the next month's", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(monthRange("2026-01")).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });

  it("rolls December into January of the next year", () => {
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });

  it("does not depend on the length of the month, in a leap year or any other", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-03-01" });
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-03-01" });
  });

  it("accepts only the years 2000 to 2999, so no month can step to a year PostgreSQL or the page cannot show", () => {
    expect(monthRange("1999-12")).toBeNull();
    expect(monthRange("0001-01")).toBeNull();
    expect(monthRange("9999-12")).toBeNull();
    expect(monthRange("3000-01")).toBeNull();
    expect(monthRange("2000-01")).toEqual({ from: "2000-01-01", to: "2000-02-01" });
    expect(monthRange("2999-12")).toEqual({ from: "2999-12-01", to: "3000-01-01" });
  });

  it("rejects anything that is not a month written YYYY-MM", () => {
    for (const bad of ["2026-13", "2026-00", "2026-1", "2026-10-01", "26-10", "2026/10", "", " 2026-10", "2026-10 ", "abcd-ef", "2026-10\n", "0000-05"]) {
      expect(monthRange(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("adjacentMonth", () => {
  it("steps forward and back, across a year end both ways", () => {
    expect(adjacentMonth("2026-10", 1)).toBe("2026-11");
    expect(adjacentMonth("2026-10", -1)).toBe("2026-09");
    expect(adjacentMonth("2026-12", 1)).toBe("2027-01");
    expect(adjacentMonth("2027-01", -1)).toBe("2026-12");
  });

  it("gives null for something that is not a month", () => {
    expect(adjacentMonth("2026-13", 1)).toBeNull();
  });

  it("gives null at the ends of the supported years instead of a month that is not one", () => {
    expect(adjacentMonth("2000-01", -1)).toBeNull();
    expect(adjacentMonth("2999-12", 1)).toBeNull();
    expect(adjacentMonth("2000-01", 1)).toBe("2000-02");
    expect(adjacentMonth("2999-12", -1)).toBe("2999-11");
    expect(adjacentMonth("2000-12", 1)).toBe("2001-01");
    expect(adjacentMonth("2999-01", -1)).toBe("2998-12");
  });
});

describe("registerCsv", () => {
  const HEAD = "Invoice number,Invoice date,Customer,GSTIN,Type,Place of supply,SAC,Taxable value,CGST,SGST,IGST,Round off,Invoice total";

  it("writes the header and one row per invoice, in rupees with the place of supply's GST code", () => {
    const rows = rowsOf(registerCsv([invoice({ recipientName: "Sharma, Rao & Co" })]));
    expect(rows[0]).toBe(HEAD);
    expect(rows[1]).toBe('FY/26-27/000001,09-10-2026,"Sharma, Rao & Co",27AAPFU0939F1ZV,B2B,27-Maharashtra,998361,5599.20,503.93,503.93,0.00,0.00,6607.06');
    expect(rows).toHaveLength(2);
  });

  it("writes only the header for a month with no invoices", () => {
    expect(registerCsv([])).toBe(HEAD);
  });

  it("marks an invoice with no GSTIN B2C and names an inter-state place of supply", () => {
    expect(rowsOf(registerCsv([interState()]))[1]).toBe("FY/26-27/000002,09-10-2026,QA Premium Business,,B2C,29-Karnataka,998361,5599.20,0.00,0.00,1007.86,0.00,6607.06");
  });

  it("prints amounts from whole paise, never floats, including a negative round off and amounts over a crore", () => {
    const [, row] = rowsOf(registerCsv([invoice({ taxableCents: 1_234_567_805, cgstCents: 7, sgstCents: 7, roundOffCents: -1, totalCents: 1_234_567_818 })]));
    expect(row?.split(",").slice(7)).toEqual(["12345678.05", "0.07", "0.07", "0.00", "-0.01", "12345678.18"]);
    const [, small] = rowsOf(registerCsv([invoice({ taxableCents: 5, cgstCents: 0, sgstCents: 0, roundOffCents: 0, totalCents: 5 })]));
    expect(small?.split(",").slice(7)).toEqual(["0.05", "0.00", "0.00", "0.00", "0.00", "0.05"]);
  });

  it("quotes names with quotes, commas and line breaks, and doubles the quotes", () => {
    expect(rowsOf(registerCsv([invoice({ recipientName: 'The "Best" Dental, Thane' })]))[1]).toContain(',"The ""Best"" Dental, Thane",');
    const multiLine = registerCsv([invoice({ recipientName: "Line one\nLine two" })]);
    expect(multiLine).toContain(',"Line one\nLine two",');
  });

  it.each(["=HYPERLINK(1)", "+91 98200", "-2+3", "@SUM(A1)", "\tTab first", "\rReturn first"])("keeps a spreadsheet from running %j as a formula", (name) => {
    const csv = registerCsv([invoice({ recipientName: name, recipientGstin: null })]);
    const body = csv.slice(csv.indexOf("\r\n") + 2);
    const quoted = /[",\r\n]/.test(`'${name}`);
    expect(body).toContain(quoted ? `,"'${name.replaceAll('"', '""')}",` : `,'${name},`);
  });

  it("defuses a formula even when the name also needs quoting", () => {
    expect(rowsOf(registerCsv([invoice({ recipientName: '=1+1,"x"', recipientGstin: null })]))[1]).toContain(`,"'=1+1,""x""",`);
  });

  it("leaves a name that merely contains those characters alone, and does not touch the money columns", () => {
    const [, row] = rowsOf(registerCsv([invoice({ recipientName: "A=B + C - D @ E", roundOffCents: -1, totalCents: 660_705 })]));
    expect(row).toContain(",A=B + C - D @ E,");
    expect(row?.endsWith(",-0.01,6607.05")).toBe(true);
  });

  it("fails loudly on a state it does not know, naming the invoice and nothing about the customer", () => {
    const bad = invoice({ number: "FY/26-27/000042", recipientName: "Priya Sharma", recipientGstin: "27AAPFU0939F1ZV", placeOfSupplyStateCode: "zz" });
    let thrown: unknown;
    try {
      registerCsv([invoice({}), bad]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RegisterInvoiceError);
    const error = thrown as RegisterInvoiceError;
    expect(error.invoiceNumber).toBe("FY/26-27/000042");
    expect(error.cause).toMatchObject({ name: "UnknownStateError" });
    expect(error.message).toContain("FY/26-27/000042");
    expect(error.message).not.toMatch(/Priya|Sharma|27AAPFU0939F1ZV/);
  });

  it("starts with no byte order mark of its own: the route adds it", () => {
    expect(registerCsv([]).charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("registerInvoiceOf", () => {
  it("maps a stored invoice to a register row", () => {
    expect(registerInvoiceOf(stored())).toEqual(invoice({}));
  });

  it("uses no GSTIN when the recipient gave none", () => {
    const base = stored();
    expect(registerInvoiceOf(stored({ recipient: { ...base.recipient, gstin: null } })).recipientGstin).toBeNull();
  });

  it("joins the different SACs of a multi-line invoice rather than printing only the first", () => {
    const lines = [lineOf({ sac: "998361" }), lineOf({ sac: "998313" }), lineOf({ sac: "998361" })];
    expect(registerInvoiceOf(stored({ lines })).sac).toBe("998361 / 998313");
  });

  it("leaves the SAC empty rather than failing when an invoice somehow has no line", () => {
    expect(registerInvoiceOf(stored({ lines: [] })).sac).toBe("");
  });
});
