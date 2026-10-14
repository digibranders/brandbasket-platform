import { describe, expect, it } from "vitest";
import { INVOICE_NOTICES, invoiceNoticeHref, readInvoiceNotice } from "./invoice-notices";

describe("the client page's tax invoice notices", () => {
  it("reads the notices an address names, and nothing else", () => {
    for (const key of Object.keys(INVOICE_NOTICES)) expect(readInvoiceNotice(key)).toBe(key);
    expect(readInvoiceNotice("<script>")).toBeNull();
    expect(readInvoiceNotice(["issued"])).toBeNull();
    expect(readInvoiceNotice("toString")).toBeNull();
    expect(readInvoiceNotice(undefined)).toBeNull();
  });

  it("scrolls to the Tax invoices section", () => {
    expect(invoiceNoticeHref("abc", "issued")).toBe("/clients/abc?invoice=issued#tax-invoices");
  });

  it("calls only an issued invoice a success", () => {
    const ok = Object.entries(INVOICE_NOTICES).filter(([, notice]) => notice.ok).map(([key]) => key);
    expect(ok).toEqual(["issued"]);
  });

  it("names the real reason: letters, dates, periods and payment kinds each have their own words", () => {
    expect(INVOICE_NOTICES["english-letters"].text).toBe(
      "Some text on this invoice has characters it cannot print. Check the customer’s name and address in the billing details, and the payment’s description, then try again.",
    );
    expect(INVOICE_NOTICES["english-letters"].text).not.toContain("English letters");
    expect(INVOICE_NOTICES.refused.text).not.toContain("cannot print");
    expect(INVOICE_NOTICES.refused.text).toContain("GSTIN");
    expect(INVOICE_NOTICES["date-before-payment"].text).toBe("The issue date cannot be before the payment date.");
    expect(INVOICE_NOTICES["unsupported-kind"].text).toBe("This kind of payment cannot be rebuilt here. Ask engineering to issue it.");
    expect(INVOICE_NOTICES["bad-period"].text).toContain("service period");
  });

  it("is written in plain words, with no dashes", () => {
    for (const { text } of Object.values(INVOICE_NOTICES)) expect(text).not.toMatch(/[\u2013\u2014]/);
  });
});
