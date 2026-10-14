import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { financialYearOf, formatInvoiceNumber, indianDate, INVOICE_PREFIX, invoicePrefix } from "./invoice-number";

describe("financialYearOf", () => {
  it("turns at midnight on 1 April in India, not in UTC", () => {
    expect(financialYearOf(new Date("2026-03-31T18:29:59Z"))).toBe("25-26");
    expect(financialYearOf(new Date("2026-03-31T18:30:00Z"))).toBe("26-27");
  });

  it("writes the century turn as 99-00", () => {
    expect(financialYearOf(new Date("2099-06-01T00:00:00Z"))).toBe("99-00");
  });
});

describe("indianDate", () => {
  it("is the calendar date in India", () => {
    expect(indianDate(new Date("2026-10-08T19:00:00Z"))).toBe("2026-10-09");
  });
});

describe("formatInvoiceNumber", () => {
  it("is prefix, financial year and a six digit serial, within GST's 16 characters", () => {
    const number = formatInvoiceNumber(INVOICE_PREFIX, "26-27", 147);
    expect(number).toBe("FY/26-27/000147");
    expect(number.length).toBeLessThanOrEqual(16);
  });

  it("refuses a serial outside 1 to 999999", () => {
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26-27", 0)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26-27", 1_000_000)).toThrow(RangeError);
  });

  it("refuses a financial year that is not written 26-27", () => {
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber(INVOICE_PREFIX, "26/27", 1)).toThrow(RangeError);
  });

  it("refuses a prefix that is empty, lower case or holds a slash", () => {
    expect(() => formatInvoiceNumber("", "26-27", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("fy", "26-27", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("F/F", "26-27", 1)).toThrow(RangeError);
  });

  it("throws a BillingRangeError that does not echo what it was given", () => {
    const attempts = [() => formatInvoiceNumber("Asha Rao", "26-27", 1), () => formatInvoiceNumber(INVOICE_PREFIX, "Asha Rao", 1)];
    for (const attempt of attempts) {
      expect(attempt).toThrow(BillingRangeError);
      expect(attempt).toThrow(expect.objectContaining({ message: expect.not.stringContaining("Asha") }));
    }
  });
});

describe("invoicePrefix", () => {
  it("is FY, the series every invoice starts under", () => {
    expect(invoicePrefix({})).toBe("FY");
    expect(formatInvoiceNumber(invoicePrefix({}), "26-27", 1)).toBe("FY/26-27/000001");
  });

  it("takes INVOICE_PREFIX from the environment when set", () => {
    expect(invoicePrefix({ INVOICE_PREFIX: " fyd " })).toBe("FYD");
  });

  it("refuses a prefix that could not be printed, rather than issuing an invoice that cannot be numbered", () => {
    expect(() => invoicePrefix({ INVOICE_PREFIX: "F/F" })).toThrow(/INVOICE_PREFIX/);
    expect(() => invoicePrefix({ INVOICE_PREFIX: "ABCDEFGHIJKLM" })).toThrow(/INVOICE_PREFIX/);
  });
});
