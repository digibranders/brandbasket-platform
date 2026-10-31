import type { Payment } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { registerTotals, type RegisterInvoice } from "@brandbasket/shared/lib/billing/invoice-register";
import {
  exportZipHref,
  financialYearChips,
  missingRegisterRow,
  monthLabel,
  monthLinks,
  rateLabel,
  registerMoney,
  registerRow,
  registerTotalsView,
  resolveRegisterMonth,
} from "./invoice-register-view";

const NOW = new Date("2026-10-09T06:00:00Z");

describe("resolveRegisterMonth", () => {
  it("defaults to the current Indian month", () => {
    expect(resolveRegisterMonth(undefined, NOW)).toBe("2026-10");
  });

  it("uses the Indian calendar, not UTC, at a month end", () => {
    // 20:00 UTC on 31 October is 01:30 on 1 November in India.
    expect(resolveRegisterMonth(undefined, new Date("2026-10-31T20:00:00Z"))).toBe("2026-11");
    expect(resolveRegisterMonth(undefined, new Date("2026-10-31T17:00:00Z"))).toBe("2026-10");
  });

  it("accepts a valid month as written", () => {
    expect(resolveRegisterMonth("2026-03", NOW)).toBe("2026-03");
  });

  it.each(["2026-13", "", "october", "2026-10-01", "0000-01", "0001-01", "1999-12", "3000-01", "9999-12"])("rejects %j", (value) => {
    expect(resolveRegisterMonth(value, NOW)).toBeNull();
  });

  it("rejects a month given twice", () => {
    expect(resolveRegisterMonth(["2026-10", "2026-11"], NOW)).toBeNull();
  });
});

describe("monthLabel and monthLinks", () => {
  it("names the month in words", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });

  it("links the neighbouring months and the export", () => {
    expect(monthLinks("2026-12")).toEqual({
      previous: { href: "/invoices?month=2026-11", label: "November 2026" },
      next: { href: "/invoices?month=2027-01", label: "January 2027" },
      exportHref: "/invoices/export?month=2026-12",
    });
    expect(monthLinks("2027-01").previous?.href).toBe("/invoices?month=2026-12");
  });

  it("has no previous link in January 2000 and no next link in December 2999", () => {
    expect(monthLinks("2000-01")).toEqual({
      previous: null,
      next: { href: "/invoices?month=2000-02", label: "February 2000" },
      exportHref: "/invoices/export?month=2000-01",
    });
    expect(monthLinks("2999-12")).toEqual({
      previous: { href: "/invoices?month=2999-11", label: "November 2999" },
      next: null,
      exportHref: "/invoices/export?month=2999-12",
    });
  });
});

describe("registerMoney", () => {
  it("always shows paise, with Indian digit grouping", () => {
    expect(registerMoney(660_706)).toBe("₹6,607.06");
    expect(registerMoney(500_000)).toBe("₹5,000.00");
    expect(registerMoney(12_345_678_905)).toBe("₹12,34,56,789.05");
    expect(registerMoney(0)).toBe("₹0.00");
    expect(registerMoney(5)).toBe("₹0.05");
  });

  it("writes a negative amount with the sign first", () => {
    expect(registerMoney(-1)).toBe("-₹0.01");
    expect(registerMoney(-150_000)).toBe("-₹1,500.00");
  });
});

const row = (overrides: Partial<RegisterInvoice> = {}): RegisterInvoice => ({
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

describe("registerRow", () => {
  it("says who, where and when, with the total and the download", () => {
    expect(registerRow("inv-1", row())).toEqual({
      id: "inv-1",
      number: "FY/26-27/000001",
      customer: "QA Premium Business",
      detail: "GSTIN 27AAPFU0939F1ZV · Maharashtra · 9 October 2026",
      total: "₹6,607.06",
      downloadHref: "/invoices/inv-1",
      downloadLabel: "Download tax invoice FY/26-27/000001",
    });
  });

  it("says Unregistered when the customer gave no GSTIN", () => {
    expect(registerRow("inv-2", row({ recipientGstin: null, placeOfSupplyStateCode: "ka" })).detail).toBe("Unregistered · Karnataka · 9 October 2026");
  });
});

describe("registerTotalsView", () => {
  it("shows every figure of the month in rupees and paise, and the B2B and B2C split", () => {
    const view = registerTotalsView(
      registerTotals([
        row(),
        row({ number: "FY/26-27/000002", recipientGstin: null, cgstCents: 0, sgstCents: 0, igstCents: 100_786 }),
      ]),
    );
    expect(view.count).toBe("2");
    expect(view.figures).toEqual({ taxable: "₹11,198.40", total: "₹13,214.12" });
    expect(view.tax).toEqual([
      { label: "CGST", value: "₹503.93" },
      { label: "SGST", value: "₹503.93" },
      { label: "IGST", value: "₹1,007.86" },
      { label: "Round off", value: "₹0.00" },
    ]);
    expect(view.split).toEqual([
      { label: "With a GSTIN (B2B)", value: "1 invoice, ₹5,599.20 taxable, ₹1,007.86 tax" },
      { label: "Without a GSTIN (B2C)", value: "1 invoice, ₹5,599.20 taxable, ₹1,007.86 tax" },
    ]);
  });

  it("says 0 invoices for an empty month, in the plural", () => {
    expect(registerTotalsView(registerTotals([])).split[0]?.value).toBe("0 invoices, ₹0.00 taxable, ₹0.00 tax");
  });
});

describe("missingRegisterRow", () => {
  const payment = { id: "pay-1", amountCents: 353_900, paidAt: new Date("2026-10-09T09:00:00Z") } as Payment;

  it("names the client, links to their invoices and says which payment", () => {
    expect(missingRegisterRow({ payment: { ...payment, businessId: "biz-1" } as Payment, businessName: "Riverside Dental" })).toEqual({
      paymentId: "pay-1",
      businessId: "biz-1",
      businessName: "Riverside Dental",
      detail: "₹3,539 on 9 October 2026",
      href: "/clients/biz-1/billing#tax-invoices",
    });
  });
});

describe("the CA register view", () => {
  it("labels a rate without rounding a half point away", () => {
    expect(rateLabel(1_800)).toBe("18%");
    expect(rateLabel(150)).toBe("1.50%");
  });

  it("links the twelve months of the year and marks the open one, leaving out months the register has no page for", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].map((month, index) => ({ month, count: index }));
    const chips = financialYearChips("2026-10", months);
    expect(chips).toHaveLength(12);
    expect(chips[6]).toEqual({ month: "2026-10", label: "Oct", href: "/invoices?month=2026-10", count: 6, current: true });
    expect(chips.filter((chip) => chip.current)).toHaveLength(1);
    expect(financialYearChips("2999-12", [{ month: "2999-12", count: 0 }, { month: "3000-01", count: 0 }]).map((chip) => chip.month)).toEqual(["2999-12"]);
  });

  it("links the month's ZIP", () => {
    expect(exportZipHref("2026-10")).toBe("/invoices/export/zip?month=2026-10");
  });
});
