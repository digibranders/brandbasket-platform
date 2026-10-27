import type { Payment, TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import { listMissingTaxInvoices, listTaxInvoicesIssuedBetween } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import InvoicesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listTaxInvoicesIssuedBetween: vi.fn(), listMissingTaxInvoices: vi.fn() };
});

const line: TaxInvoiceLineRecord = {
  description: "Brandbasket Premium plan",
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

function invoiceOf(overrides: Partial<TaxInvoice> & { readonly id: string; readonly serial: number }): TaxInvoice {
  return {
    businessId: "01920000-0000-7000-8000-0000000000b1",
    paymentId: `payment-${overrides.id}`,
    prefix: "FY",
    financialYear: "26-27",
    number: `FY/26-27/${String(overrides.serial).padStart(6, "0")}`,
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier: { legalName: "Digibranders Private Limited", tradeName: "Brandbasket", gstin: "27AAICD9268J1Z0", cin: null, addressLines: ["Thane West"], stateCode: "mh", email: null, phone: null },
    recipient: { legalName: "QA Premium Business", tradeName: null, gstin: "27AAPFU0939F1ZV", cin: null, addressLines: ["Mumbai"], stateCode: "mh", email: null, phone: null },
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "gstin",
    supplyType: "intra_state",
    lines: [line],
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

const interState = (id: string, serial: number, name: string): TaxInvoice =>
  invoiceOf({
    id,
    serial,
    recipient: { legalName: name, tradeName: null, gstin: null, cin: null, addressLines: ["Bengaluru"], stateCode: "ka", email: null, phone: null },
    placeOfSupplyStateCode: "ka",
    placeOfSupplyBasis: "billing_address",
    supplyType: "inter_state",
    lines: [{ ...line, cgstCents: 0, sgstCents: 0, igstCents: 100_786 }],
    cgstCents: 0,
    sgstCents: 0,
    igstCents: 100_786,
  });

function render(page: Awaited<ReturnType<typeof InvoicesPage>>): string {
  return renderToStaticMarkup(page);
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

const search = (month?: string | string[]) => Promise.resolve(month === undefined ? {} : { month });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  vi.mocked(requireStaffAccess).mockResolvedValue({ user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as never);
  vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([]);
  vi.mocked(listMissingTaxInvoices).mockResolvedValue([]);
});

describe("the Invoices page and roles", () => {
  it("sends support staff to the no-access page before it reads anything, and records the refusal", async () => {
    vi.mocked(requireStaffAccess).mockResolvedValue({ user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as never);
    await expect(InvoicesPage({ searchParams: search("2026-10") })).rejects.toThrow("redirect:/no-access");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    expect(listMissingTaxInvoices).not.toHaveBeenCalled();
  });
});

describe("the Invoices page", () => {
  it("requires staff access before it reads anything", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("redirected to sign in"));
    await expect(InvoicesPage({ searchParams: search("2026-10") })).rejects.toThrow("redirected to sign in");
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    expect(listMissingTaxInvoices).not.toHaveBeenCalled();
  });

  it.each(["2026-13", "", "october", "0000-01", "0001-01", "1999-12", "3000-01", "9999-12", ["2026-10", "2026-11"]])("is a 404 for the month %j, reading nothing", async (month) => {
    await expect(InvoicesPage({ searchParams: search(month) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
  });

  it("shows the current Indian month when none is asked for", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-31T20:00:00Z"), toFake: ["Date"] });
    const html = render(await InvoicesPage({ searchParams: search() }));
    expect(listTaxInvoicesIssuedBetween).toHaveBeenCalledWith({ name: "staff-db" }, "2026-11-01", "2026-12-01");
    expect(html).toContain('href="/invoices/export?month=2026-11"');
  });

  it("totals the month, lists each invoice with its download, and links the CSV and the neighbouring months", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([
      invoiceOf({ id: "inv-1", serial: 1 }),
      interState("inv-2", 2, "Sharma & Rao Traders"),
    ]);
    const html = render(await InvoicesPage({ searchParams: search("2026-10") }));
    const text = visibleText(html);

    expect(listTaxInvoicesIssuedBetween).toHaveBeenCalledWith({ name: "staff-db" }, "2026-10-01", "2026-11-01");
    expect(html).toContain('href="/invoices/export?month=2026-10"');
    expect(html).toContain('href="/invoices?month=2026-09"');
    expect(html).toContain('href="/invoices?month=2026-11"');
    expect(html).toContain('value="2026-10"');

    // Totals equal the sum of the rows.
    expect(text).toContain("₹11,198.40");
    expect(text).toContain("₹13,214.12");
    expect(text).toContain("₹503.93");
    expect(text).toContain("₹1,007.86");
    expect(text).toContain("1 invoice, ₹5,599.20 taxable, ₹1,007.86 tax");

    // Each row, with the PDF link /invoices/{id}.
    expect(text).toContain("FY/26-27/000001");
    expect(text).toContain("GSTIN 27AAPFU0939F1ZV · Maharashtra · 9 October 2026");
    expect(text).toContain("Sharma & Rao Traders");
    expect(text).toContain("Unregistered · Karnataka · 9 October 2026");
    expect(html).toContain('href="/invoices/inv-1"');
    expect(html).toContain('href="/invoices/inv-2"');
    expect(html).toContain('aria-label="Download tax invoice FY/26-27/000002"');
  });

  it("reads the neighbouring month links to a screen reader as Previous month and Next month, with the visible words unchanged", async () => {
    const html = render(await InvoicesPage({ searchParams: search("2026-10") }));
    expect(html).toContain('<span class="sr-only">Previous month: </span>September 2026');
    expect(html).toContain('<span class="sr-only">Next month: </span>November 2026');
  });

  it("does not crash at the first and last supported months, and offers no link past either end", async () => {
    const first = render(await InvoicesPage({ searchParams: search("2000-01") }));
    expect(listTaxInvoicesIssuedBetween).toHaveBeenLastCalledWith({ name: "staff-db" }, "2000-01-01", "2000-02-01");
    expect(first).not.toContain("Previous month");
    expect(first).toContain('href="/invoices?month=2000-02"');

    const last = render(await InvoicesPage({ searchParams: search("2999-12") }));
    expect(listTaxInvoicesIssuedBetween).toHaveBeenLastCalledWith({ name: "staff-db" }, "2999-12-01", "3000-01-01");
    expect(last).not.toContain("Next month");
    expect(last).toContain('href="/invoices?month=2999-11"');
  });

  it("shows the list as a table, as the console's design asks", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceOf({ id: "inv-1", serial: 1 })]);
    const html = render(await InvoicesPage({ searchParams: search("2026-10") }));
    expect(html).toMatch(/<table|<tr|<td/);
  });

  it("says plainly when the month has no invoices, and shows no missing section when none are missing", async () => {
    const html = render(await InvoicesPage({ searchParams: search("2026-02") }));
    const text = visibleText(html);
    expect(text).toContain("No invoices were issued in February 2026.");
    expect(text).toContain("₹0.00");
    expect(text).not.toContain("Missing invoices");
  });

  it("lists payments missing an invoice, across clients, above the register, each linking to its client", async () => {
    const payment = (id: string, businessId: string): Payment =>
      ({ id, businessId, amountCents: 353_900, paidAt: new Date("2026-10-09T09:00:00Z") }) as Payment;
    vi.mocked(listMissingTaxInvoices).mockResolvedValue([
      { payment: payment("pay-1", "biz-1"), businessName: "Riverside Dental" },
      { payment: payment("pay-2", "biz-2"), businessName: "Thane Tailors" },
    ]);
    const html = render(await InvoicesPage({ searchParams: search("2026-10") }));
    const text = visibleText(html);

    expect(html).toContain('href="/clients/biz-1/billing#tax-invoices"');
    expect(html).toContain('href="/clients/biz-2/billing#tax-invoices"');
    expect(text).toContain("Riverside Dental");
    expect(text).toContain("₹3,539 on 9 October 2026");
    expect(text).toContain("2 to issue");
    expect(text.indexOf("Missing invoices")).toBeLessThan(text.indexOf("Taxable value"));
    // The missing list is not tied to the month shown.
    expect(listMissingTaxInvoices).toHaveBeenCalledWith({ name: "staff-db" }, 51);
  });

  it("shows the oldest 50 and says so when more are missing", async () => {
    const many = Array.from({ length: 51 }, (_, index) => ({
      payment: { id: `pay-${index}`, businessId: `biz-${index}`, amountCents: 100, paidAt: new Date("2026-10-09T09:00:00Z") } as Payment,
      businessName: `Client ${index}`,
    }));
    vi.mocked(listMissingTaxInvoices).mockResolvedValue(many);
    const text = visibleText(render(await InvoicesPage({ searchParams: search("2026-10") })));
    expect(text).toContain("50+ to issue");
    expect(text).toContain("Showing the oldest 50.");
    expect(text).toContain("Client 49");
    expect(text).not.toContain("Client 50");
  });

  it("writes no dash characters in its own words", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceOf({ id: "inv-1", serial: 1 })]);
    vi.mocked(listMissingTaxInvoices).mockResolvedValue([
      { payment: { id: "pay-1", businessId: "biz-1", amountCents: 100, paidAt: new Date("2026-10-09T09:00:00Z") } as Payment, businessName: "Riverside Dental" },
    ]);
    expect(visibleText(render(await InvoicesPage({ searchParams: search("2026-10") })))).not.toMatch(/[\u2013\u2014]/);
  });
});
