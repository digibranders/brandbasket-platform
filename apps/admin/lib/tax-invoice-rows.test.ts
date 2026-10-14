import type { Payment, TaxInvoice } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { missingInvoiceRow, taxInvoiceRow } from "./tax-invoice-rows";

const INVOICE = {
  id: "01920000-0000-7000-8000-000000000001",
  number: "FF/26-27/000001",
  issuedOn: "2026-10-09",
  paidOn: "2026-10-09",
  placeOfSupplyStateCode: "mh",
  totalCents: 353_882,
} as TaxInvoice;

describe("taxInvoiceRow", () => {
  it("names the number, the day, the place of supply and the total, and links the download", () => {
    expect(taxInvoiceRow(INVOICE)).toEqual({
      id: INVOICE.id,
      number: "FF/26-27/000001",
      detail: "Issued 9 October 2026 · Maharashtra",
      total: "₹3,538.82",
      downloadHref: `/invoices/${INVOICE.id}`,
      downloadLabel: "Download tax invoice FF/26-27/000001",
    });
  });

  it("adds the day the payment was made when staff issued the invoice on a later day", () => {
    expect(taxInvoiceRow({ ...INVOICE, issuedOn: "2026-11-15", paidOn: "2026-10-09", placeOfSupplyStateCode: "ka" }).detail).toBe(
      "Issued 15 November 2026 · paid 9 October 2026 · Karnataka",
    );
  });

  it("keeps a state code it does not know rather than hiding it", () => {
    expect(taxInvoiceRow({ ...INVOICE, placeOfSupplyStateCode: "zz" }).detail).toBe("Issued 9 October 2026 · zz");
  });
});

describe("missingInvoiceRow", () => {
  const PAYMENT = { id: "01920000-0000-7000-8000-0000000000a1", amountCents: 353_882, paidAt: new Date("2026-10-09T09:00:00Z") };

  it("says how much and on which day, so the button can be told apart from the next one", () => {
    expect(missingInvoiceRow(PAYMENT)).toEqual({
      paymentId: PAYMENT.id,
      summary: "₹3,538.82 on 9 October 2026",
      text: "Invoice missing for the payment of ₹3,538.82 on 9 October 2026",
      buttonLabel: "Issue invoice for the ₹3,538.82 payment of 9 October 2026",
    });
  });

  it("uses the Indian day, as the invoice prints it, for a payment made just before midnight UTC", () => {
    expect(missingInvoiceRow({ ...PAYMENT, paidAt: new Date("2026-10-09T20:00:00Z") }).text).toContain("on 10 October 2026");
  });

  it("refuses a payment with no paid date", () => {
    expect(() => missingInvoiceRow({ ...PAYMENT, paidAt: null } as Pick<Payment, "id" | "amountCents" | "paidAt">)).toThrow(RangeError);
  });
});
