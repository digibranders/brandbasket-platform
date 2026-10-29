import type { TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { documentSeries, financialYearOf, financialYearRange, gstSummary, monthTotals } from "./gst-summary";

const FY_2026_27_MONTHS = [
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
  "2027-03",
];

const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

const supplier = {
  legalName: "Digibranders Private Limited",
  tradeName: "Brandbasket",
  gstin: "27AAICD9268J1Z0",
  cin: null,
  addressLines: ["Thane West"],
  stateCode: "mh",
  email: null,
  phone: null,
};

const recipient = {
  legalName: "QA Premium Business",
  tradeName: null,
  gstin: "27AAPFU0939F1ZV",
  cin: null,
  addressLines: ["Mumbai"],
  stateCode: "mh",
  email: null,
  phone: null,
};

const withoutGstin = { ...recipient, gstin: null };

function lineOf(overrides: Partial<TaxInvoiceLineRecord> = {}): TaxInvoiceLineRecord {
  const cgstCents = overrides.cgstCents ?? 9_000;
  const sgstCents = overrides.sgstCents ?? 9_000;
  const igstCents = overrides.igstCents ?? 0;
  return {
    description: "Brandbasket Premium plan",
    detail: null,
    note: null,
    sac: "998361",
    quantity: 1,
    unitAmountCents: 100_000,
    grossAmountCents: 100_000,
    discountAmountCents: 0,
    taxableCents: 100_000,
    taxRateBasisPoints: 1_800,
    ...overrides,
    cgstCents,
    sgstCents,
    igstCents,
    taxCents: cgstCents + sgstCents + igstCents,
  };
}

/** A stored invoice whose headers add up to its lines. Override a header to make it disagree with them. */
function invoiceOf(lines: readonly TaxInvoiceLineRecord[], overrides: Partial<TaxInvoice> = {}): TaxInvoice {
  const serial = overrides.serial ?? 1;
  const prefix = overrides.prefix ?? "FY";
  const financialYear = overrides.financialYear ?? "26-27";
  const taxableCents = total(lines.map((line) => line.taxableCents));
  const cgstCents = total(lines.map((line) => line.cgstCents));
  const sgstCents = total(lines.map((line) => line.sgstCents));
  const igstCents = total(lines.map((line) => line.igstCents));
  return {
    id: "01920000-0000-7000-8000-000000000001",
    businessId: "01920000-0000-7000-8000-0000000000b1",
    paymentId: "01920000-0000-7000-8000-0000000000a1",
    prefix,
    financialYear,
    serial,
    number: `${prefix}/${financialYear}/${String(serial).padStart(6, "0")}`,
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier,
    recipient,
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "gstin",
    supplyType: "intra_state",
    lines,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    roundOffCents: 0,
    totalCents: taxableCents + cgstCents + sgstCents + igstCents,
    paymentLabel: "Visa credit card ending 4366",
    paymentReference: "pay_TljxffN6THodkg",
    createdAt: new Date("2026-10-09T06:00:00Z"),
    ...overrides,
  };
}

describe("financialYearOf", () => {
  it("puts October in the year that began the April before", () => {
    expect(financialYearOf("2026-10")).toEqual({ label: "2026-27", months: FY_2026_27_MONTHS });
  });

  it("puts April in the year it starts", () => {
    expect(financialYearOf("2026-04")).toEqual({ label: "2026-27", months: FY_2026_27_MONTHS });
  });

  it("puts February in the year that began the April before it", () => {
    expect(financialYearOf("2027-02")).toEqual({ label: "2026-27", months: FY_2026_27_MONTHS });
  });

  it("puts March in the year that ends with it", () => {
    expect(financialYearOf("2026-03")).toEqual({
      label: "2025-26",
      months: [
        "2025-04",
        "2025-05",
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
      ],
    });
  });

  it.each(["2026-13", "2026-00", "2026-4", "26-10", "2026-10-01", "1999-10", ""])("is null for %j", (month) => {
    expect(financialYearOf(month)).toBeNull();
  });
});

describe("financialYearRange", () => {
  it("runs from the first of April to the first of the next April", () => {
    expect(financialYearRange("2026-10")).toEqual({ from: "2026-04-01", to: "2027-04-01" });
    expect(financialYearRange("2027-02")).toEqual({ from: "2026-04-01", to: "2027-04-01" });
    expect(financialYearRange("2026-03")).toEqual({ from: "2025-04-01", to: "2026-04-01" });
  });

  it("is null for a non-month", () => {
    expect(financialYearRange("2026-13")).toBeNull();
  });
});

describe("monthTotals", () => {
  it("gives one entry per month, zero for a month with no invoices", () => {
    const invoices = [
      invoiceOf([lineOf()], { serial: 1, issuedOn: "2026-10-09" }),
      invoiceOf([lineOf({ taxableCents: 50_000, cgstCents: 4_500, sgstCents: 4_500 })], {
        serial: 2,
        issuedOn: "2026-10-30",
      }),
      invoiceOf([lineOf()], { serial: 3, issuedOn: "2026-11-02" }),
    ];
    expect(monthTotals(invoices, ["2026-09", "2026-10", "2026-11"])).toEqual([
      { month: "2026-09", count: 0, totalCents: 0 },
      { month: "2026-10", count: 2, totalCents: 177_000 },
      { month: "2026-11", count: 1, totalCents: 118_000 },
    ]);
  });
});

describe("gstSummary", () => {
  it("sums the invoice headers into the GSTR-3B outward supplies", () => {
    const invoices = [
      invoiceOf([lineOf()], { serial: 1 }),
      invoiceOf([lineOf({ cgstCents: 0, sgstCents: 0, igstCents: 18_000 })], {
        serial: 2,
        placeOfSupplyStateCode: "ka",
        supplyType: "inter_state",
        placeOfSupplyBasis: "billing_address",
        recipient: { ...withoutGstin, stateCode: "ka" },
      }),
    ];
    expect(gstSummary(invoices).outward).toEqual({
      taxableCents: 200_000,
      igstCents: 18_000,
      cgstCents: 9_000,
      sgstCents: 9_000,
      cessCents: 0,
      taxCents: 36_000,
    });
  });

  it("leaves invoices with a GSTIN out of the B2C rows", () => {
    expect(gstSummary([invoiceOf([lineOf()], { serial: 1 })]).b2cByPlace).toEqual([]);
  });

  it("splits B2C rows by state and rate, from the lines", () => {
    const invoices = [
      invoiceOf([
        lineOf(),
        lineOf({ taxRateBasisPoints: 500, taxableCents: 50_000, cgstCents: 1_250, sgstCents: 1_250 }),
      ], { serial: 1, recipient: withoutGstin }),
      invoiceOf([lineOf({ taxableCents: 200_000, cgstCents: 18_000, sgstCents: 18_000 })], {
        serial: 2,
        recipient: withoutGstin,
      }),
      invoiceOf([lineOf({ cgstCents: 0, sgstCents: 0, igstCents: 18_000 })], {
        serial: 3,
        placeOfSupplyStateCode: "ka",
        supplyType: "inter_state",
        placeOfSupplyBasis: "billing_address",
        recipient: { ...withoutGstin, stateCode: "ka" },
      }),
      invoiceOf([lineOf()], { serial: 4 }),
    ];
    expect(gstSummary(invoices).b2cByPlace).toEqual([
      {
        stateCode: "ka",
        stateName: "Karnataka",
        rateBasisPoints: 1_800,
        taxableCents: 100_000,
        cgstCents: 0,
        sgstCents: 0,
        igstCents: 18_000,
      },
      {
        stateCode: "mh",
        stateName: "Maharashtra",
        rateBasisPoints: 500,
        taxableCents: 50_000,
        cgstCents: 1_250,
        sgstCents: 1_250,
        igstCents: 0,
      },
      {
        stateCode: "mh",
        stateName: "Maharashtra",
        rateBasisPoints: 1_800,
        taxableCents: 300_000,
        cgstCents: 27_000,
        sgstCents: 27_000,
        igstCents: 0,
      },
    ]);
  });

  it("groups HSN rows by SAC and description, with the total of each", () => {
    const invoices = [
      invoiceOf([lineOf({ sac: "998361", description: "Brandbasket Premium plan" })], { serial: 1 }),
      invoiceOf(
        [
          lineOf({
            sac: "998361",
            description: "Brandbasket Premium plan",
            quantity: 2,
            taxableCents: 200_000,
            cgstCents: 18_000,
            sgstCents: 18_000,
          }),
        ],
        { serial: 2 },
      ),
      invoiceOf(
        [
          lineOf({
            sac: "998361",
            description: "Local SEO add-on",
            taxableCents: 50_000,
            cgstCents: 4_500,
            sgstCents: 4_500,
          }),
        ],
        { serial: 3 },
      ),
      invoiceOf(
        [
          lineOf({
            sac: "998313",
            description: "Website care plan",
            taxableCents: 40_000,
            cgstCents: 3_600,
            sgstCents: 3_600,
          }),
        ],
        { serial: 4 },
      ),
    ];
    expect(gstSummary(invoices).hsn).toEqual([
      {
        sac: "998313",
        description: "Website care plan",
        quantity: 1,
        taxableCents: 40_000,
        cgstCents: 3_600,
        sgstCents: 3_600,
        igstCents: 0,
        totalCents: 47_200,
      },
      {
        sac: "998361",
        description: "Brandbasket Premium plan",
        quantity: 3,
        taxableCents: 300_000,
        cgstCents: 27_000,
        sgstCents: 27_000,
        igstCents: 0,
        totalCents: 354_000,
      },
      {
        sac: "998361",
        description: "Local SEO add-on",
        quantity: 1,
        taxableCents: 50_000,
        cgstCents: 4_500,
        sgstCents: 4_500,
        igstCents: 0,
        totalCents: 59_000,
      },
    ]);
  });

  it("reports linesMatchHeaders true when every invoice adds up", () => {
    const invoices = [
      invoiceOf([lineOf()], { serial: 1 }),
      invoiceOf([lineOf(), lineOf({ taxableCents: 50_000, cgstCents: 4_500, sgstCents: 4_500 })], { serial: 2 }),
    ];
    expect(gstSummary(invoices)).toMatchObject({ linesMatchHeaders: true, mismatches: [] });
  });

  it("lists the number of an invoice whose header differs from its lines", () => {
    const invoices = [
      invoiceOf([lineOf()], { serial: 1 }),
      invoiceOf([lineOf()], { serial: 2, taxableCents: 99_999 }),
    ];
    expect(gstSummary(invoices)).toMatchObject({
      linesMatchHeaders: false,
      mismatches: ["FY/26-27/000002"],
    });
  });
});

describe("documentSeries", () => {
  it("reports the month's range and count, with no missing serials", () => {
    const year = [1, 2, 3].map((serial) => invoiceOf([lineOf()], { serial }));
    const month = [2, 3].map((serial) => invoiceOf([lineOf()], { serial }));
    expect(documentSeries(month, year)).toEqual([
      {
        prefix: "FY",
        financialYear: "26-27",
        firstNumber: "FY/26-27/000002",
        lastNumber: "FY/26-27/000003",
        count: 2,
        missingSerials: [],
      },
    ]);
  });

  it("reports a serial missing from an earlier month, whatever order the month is given in", () => {
    const year = [1, 3, 4, 5].map((serial) => invoiceOf([lineOf()], { serial }));
    const month = [5, 4].map((serial) => invoiceOf([lineOf()], { serial }));
    expect(documentSeries(month, year)).toEqual([
      {
        prefix: "FY",
        financialYear: "26-27",
        firstNumber: "FY/26-27/000004",
        lastNumber: "FY/26-27/000005",
        count: 2,
        missingSerials: [2],
      },
    ]);
  });

  it("counts the month's own invoices as present even when the year leaves them out", () => {
    const year = [invoiceOf([lineOf()], { serial: 1 })];
    const month = [invoiceOf([lineOf()], { serial: 2 })];
    expect(documentSeries(month, year)[0]?.missingSerials).toEqual([]);
  });

  it("gives one entry per prefix in the month, sorted by prefix", () => {
    const month = [
      invoiceOf([lineOf()], { serial: 1 }),
      invoiceOf([lineOf()], { serial: 2 }),
      invoiceOf([lineOf()], { serial: 1, prefix: "BB" }),
    ];
    expect(documentSeries(month, month)).toEqual([
      {
        prefix: "BB",
        financialYear: "26-27",
        firstNumber: "BB/26-27/000001",
        lastNumber: "BB/26-27/000001",
        count: 1,
        missingSerials: [],
      },
      {
        prefix: "FY",
        financialYear: "26-27",
        firstNumber: "FY/26-27/000001",
        lastNumber: "FY/26-27/000002",
        count: 2,
        missingSerials: [],
      },
    ]);
  });
});
