import type { Payment, TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import type { BillingDetailsStart, SavedBillingDetails } from "@brandbasket/shared/lib/billing/billing-details-start";
import type { PhoneCountryOption } from "@brandbasket/shared/lib/phone/fields";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClientBillingDetails, ClientTaxInvoices } from "./client-invoicing";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/clients/[businessId]/invoice-actions", () => ({
  issueMissingInvoiceAction: vi.fn(),
  saveClientBillingDetailsAction: vi.fn(),
}));

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";

const line: TaxInvoiceLineRecord = {
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
};

const invoice = {
  id: "inv-1",
  businessId: BUSINESS,
  paymentId: "pay-1",
  number: "FY/26-27/000001",
  issuedOn: "2026-10-09",
  paidOn: "2026-10-09",
  placeOfSupplyStateCode: "mh",
  lines: [line],
  totalCents: 660_706,
} as unknown as TaxInvoice;

const missingPayment = { id: "pay-2", businessId: BUSINESS, amountCents: 353_900, paidAt: new Date("2026-10-09T09:00:00Z") } as Payment;

function taxInvoices(overrides: Partial<Parameters<typeof ClientTaxInvoices>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(ClientTaxInvoices, { businessId: BUSINESS, invoices: [invoice], missing: [], notice: null, attentionTaken: false, ...overrides }),
  );
}

const sectionTag = (html: string): string => html.match(/<section[^>]*>/)?.[0] ?? "";

describe("ClientTaxInvoices", () => {
  it("is the page's attention section when a payment lacks its invoice and nothing else has the mark", () => {
    const html = taxInvoices({ missing: [missingPayment] });
    expect(sectionTag(html)).toContain("border-accent");
    expect(html).toContain("text-accent");
    expect(html).toContain("1 missing");
  });

  it("stays plain when another section already has the attention mark", () => {
    const tag = sectionTag(taxInvoices({ missing: [missingPayment], attentionTaken: true }));
    expect(tag).toContain("border-line");
    expect(tag).not.toContain("border-accent");
  });

  it("stays plain when nothing is missing, however the page is marked", () => {
    expect(sectionTag(taxInvoices({ attentionTaken: false }))).toContain("border-line");
  });

  it("names its lists and the section, and gives each Issue invoice button the payment it is for", () => {
    const html = taxInvoices({ missing: [missingPayment] });
    expect(html).toContain('aria-labelledby="section-tax-invoices"');
    expect(html).toContain('id="tax-invoices"');
    expect(html).toContain('<ul aria-label="Payments missing an invoice"');
    expect(html).toContain('<ul aria-label="Tax invoices issued"');
    expect(html).toContain('aria-label="Issue invoice for the ₹3,539 payment of 9 October 2026"');
    expect(html).toContain('aria-label="Download tax invoice FY/26-27/000001"');
    expect(html).toContain('href="/invoices/inv-1"');
  });

  it("keeps an invoice number on one line, so a narrow column never splits it at its hyphen", () => {
    expect(taxInvoices({}).match(/<p class="[^"]*whitespace-nowrap[^"]*">FY\/26-27\/000001<\/p>/)).not.toBeNull();
  });

  it("posts the issue form with the business and the payment, so it works without JavaScript", () => {
    const html = taxInvoices({ missing: [missingPayment] });
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html).toContain('name="paymentId" value="pay-2"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Issue invoice");
  });

  it("shows a notice as a problem or a success with its fixed words", () => {
    expect(taxInvoices({ notice: "english-letters" })).toContain("Some text on this invoice has characters it cannot print.");
    expect(taxInvoices({ notice: "issued" })).toContain("Invoice issued.");
  });

  it("says plainly when there is nothing yet", () => {
    expect(taxInvoices({ invoices: [] })).toContain("No tax invoices yet.");
  });
});

const start: BillingDetailsStart = {
  legalName: "Riverside Dental LLP",
  gstin: "",
  addressLine1: "12 MG Road",
  addressLine2: "",
  city: "Mumbai",
  postalCode: "400080",
  stateCode: "mh",
  email: "",
  phoneCountry: "IN",
  phone: "",
};
const saved: SavedBillingDetails = {
  legalName: "Riverside Dental LLP",
  gstin: "27AAPFU0939F1ZV",
  address: "12 MG Road, Mumbai 400080",
  stateCode: "mh",
  email: null,
  phone: null,
};
const countries: readonly PhoneCountryOption[] = [{ code: "IN", name: "India", dialCode: "+91", flag: "IN", example: "081234 56789", digits: { min: 8, max: 13 } }];

function billingDetails(details: { readonly saved: SavedBillingDetails | null }): string {
  return renderToStaticMarkup(createElement(ClientBillingDetails, { businessId: BUSINESS, details: { ...details, start, phoneCountries: countries } }));
}

describe("ClientBillingDetails", () => {
  it("lists what was given, with the state by name, and never takes the attention mark", () => {
    const html = billingDetails({ saved });
    expect(sectionTag(html)).toContain("border-line");
    expect(html).toContain('id="billing-details"');
    expect(html).toContain('aria-labelledby="section-billing-details"');
    expect(html).toContain("27AAPFU0939F1ZV");
    expect(html).toContain("Maharashtra");
    expect(html).toContain("Edit billing details");
  });

  it("says nothing was given and what invoices use instead", () => {
    expect(billingDetails({ saved: null })).toContain("Not given. Invoices use the business name and its onboarding address.");
  });

  it("keeps the edit form inside a native disclosure, so it opens without JavaScript", () => {
    const html = billingDetails({ saved });
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Edit billing details<\/summary>/);
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
  });
});
