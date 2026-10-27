import type { Receipt, TaxInvoice } from "@brandbasket/db";
import { renderTaxInvoicesPdf } from "@brandbasket/shared/server/tax-invoice-pdf";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCustomerReceipts, listCustomerTaxInvoices } from "@/lib/server/billing";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerAccess: vi.fn() }));
vi.mock("@brandbasket/shared/server/tax-invoice-pdf", async (importActual) => {
  const actual = await importActual<typeof import("@brandbasket/shared/server/tax-invoice-pdf")>();
  return { ...actual, renderTaxInvoicesPdf: vi.fn(actual.renderTaxInvoicesPdf) };
});
vi.mock("@/lib/server/billing", () => ({ listCustomerReceipts: vi.fn(), listCustomerTaxInvoices: vi.fn(async () => []) }));

const mockedAccess = vi.mocked(getCustomerAccess);
const mockedReceipts = vi.mocked(listCustomerReceipts);
const mockedInvoices = vi.mocked(listCustomerTaxInvoices);

const FIRST = "0192f3c4-0000-7000-8000-000000000001";
const SECOND = "0192f3c4-0000-7000-8000-000000000002";
const FAILED = "0192f3c4-0000-7000-8000-000000000003";
const THIRD = "0192f3c4-0000-7000-8000-000000000004";
const SOMEONE_ELSES = "0192f3c4-0000-7000-8000-0000000000ff";

function receipt(id: string, sequence: number, overrides: Partial<Receipt> = {}): Receipt {
  return {
    id,
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    subscriptionId: "0192f3c4-2222-7000-8000-000000000001",
    provider: "razorpay",
    providerPaymentId: `pay_${sequence}`,
    kind: sequence === 1 ? "initial" : "renewal",
    amountCents: 6_900,
    currency: "USD",
    status: "captured",
    paidAt: new Date("2026-09-12T10:00:00Z"),
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: new Date("2026-09-12T10:00:00Z"),
    initialTermMonths: 1,
    planName: "Care",
    taxRateBasisPoints: 0,
    sequence,
    chargeDescription: null,
    chargeQuantity: null,
    chargeKind: null,
    chargeCreatedAt: null,
    taxInvoiceId: null,
    taxInvoiceNumber: null,
    addOnId: null,
    invoiceBasis: null,
    ...overrides,
  };
}

/** An invoice for a payment. The serial makes its number and the PDF title differ from the next one's. */
function invoiceFor(paymentId: string, serial: number): TaxInvoice {
  return {
    id: `0192f3c4-3333-7000-8000-00000000000${serial}`,
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    paymentId,
    prefix: "FY",
    financialYear: "26-27",
    serial,
    number: `FY/26-27/00000${serial}`,
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier: {
      legalName: "Digibranders Private Limited",
      tradeName: "Brandbasket",
      gstin: "27AAICD9268J1Z0",
      cin: "U72900MH2021PTC372344",
      addressLines: ["Thane West, Maharashtra 400607, India"],
      stateCode: "mh",
      email: "support@brandbasket.in",
      phone: "+91 866 861 0953",
    },
    recipient: {
      legalName: "Riverside",
      tradeName: null,
      gstin: null,
      cin: null,
      addressLines: ["Shop 4, Gokul Arcade, Mumbai 400080"],
      stateCode: "mh",
      email: null,
      phone: null,
    },
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "billing_address",
    supplyType: "intra_state",
    lines: [
      {
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
      },
    ],
    taxableCents: 559_920,
    cgstCents: 50_393,
    sgstCents: 50_393,
    igstCents: 0,
    roundOffCents: 0,
    totalCents: 660_706,
    paymentLabel: "Visa credit card ending 4366",
    paymentReference: "pay_2",
    createdAt: new Date("2026-10-09T06:00:00Z"),
  };
}

/** A payment that has been invoiced: the receipt row carries the invoice's id and number. */
function invoicedReceipt(id: string, sequence: number, invoice: TaxInvoice): Receipt {
  return receipt(id, sequence, { currency: "INR", taxInvoiceId: invoice.id, taxInvoiceNumber: invoice.number });
}

function get(query = ""): Promise<Response> {
  return GET(new Request(`http://app.localhost/billing/receipts${query}`));
}

async function pageCount(response: Response): Promise<number> {
  return (await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))).getPageCount();
}

/** What each page of a download is, from its fonts: an invoice embeds Hanken Grotesk, a receipt uses Helvetica. */
async function pageKinds(response: Response): Promise<Array<"invoice" | "receipt">> {
  const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
  return pdf.getPages().map((page) => {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    const names = (fonts?.entries() ?? []).map(([, ref]) => pdf.context.lookup(ref, PDFDict).get(PDFName.of("BaseFont"))?.toString() ?? "");
    return names.some((name) => name.includes("Hanken")) ? "invoice" : "receipt";
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedAccess.mockResolvedValue({
    kind: "granted",
    user: { id: "user-1", email: "owner@example.com", name: "Owner", emailConfirmed: true, phone: null },
    tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" },
  } as never);
  mockedReceipts.mockResolvedValue([
    receipt(FAILED, 3, { status: "failed" }),
    receipt(SECOND, 2),
    receipt(FIRST, 1),
  ]);
});

describe("GET /billing/receipts", () => {
  it("turns away anyone without a business", async () => {
    mockedAccess.mockResolvedValue({ kind: "signed-out" });
    const response = await get();
    expect(response.status).toBe(401);
    expect(mockedReceipts).not.toHaveBeenCalled();
  });

  it("refuses a malformed list of ids", async () => {
    expect((await get("?ids=nope")).status).toBe(400);
  });

  it("downloads one receipt, named for its number", async () => {
    const response = await get(`?ids=${SECOND}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-receipt-002.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await pageCount(response)).toBe(1);
  });

  it("downloads every receipt the customer paid, skipping the failed attempt", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-receipts.pdf"');
    expect(await pageCount(response)).toBe(2);
  });

  it("finds nothing for a payment that is not theirs, or one that failed", async () => {
    expect((await get(`?ids=${FIRST},${SOMEONE_ELSES}`)).status).toBe(404);
    expect((await get(`?ids=${FAILED}`)).status).toBe(404);
  });

  it("downloads an invoiced payment as its tax invoice, named for its number", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice)]);
    mockedInvoices.mockResolvedValue([invoice]);

    const response = await get(`?ids=${SECOND}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoice-FY-26-27-000001.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mockedInvoices).toHaveBeenCalledWith(expect.anything(), [SECOND]);
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Tax invoice FY/26-27/000001");
  });

  it("hands the invoice the customer's mobile, to print under Billed to when they gave no billing details", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice)]);
    mockedInvoices.mockResolvedValue([invoice]);
    mockedAccess.mockResolvedValue({
      kind: "granted",
      user: { id: "user-1", email: "owner@example.com", name: "Owner", emailConfirmed: true, phone: "+919820012345" },
      tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "owner" },
    } as never);

    expect((await get(`?ids=${SECOND}`)).status).toBe(200);
    expect(renderTaxInvoicesPdf).toHaveBeenCalledWith([invoice], { recipientPhone: "+91 98200 12345", brandName: "Brandbasket" });
  });

  it("hands the invoice no mobile when the signed-in member is an editor, not the owner", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice)]);
    mockedInvoices.mockResolvedValue([invoice]);
    mockedAccess.mockResolvedValue({
      kind: "granted",
      user: { id: "user-2", email: "editor@example.com", name: "Editor", emailConfirmed: true, phone: "+919811100000" },
      tenant: { userId: "user-2", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Riverside", role: "editor" },
    } as never);

    expect((await get(`?ids=${SECOND}`)).status).toBe(200);
    expect(renderTaxInvoicesPdf).toHaveBeenCalledWith([invoice], { recipientPhone: null, brandName: "Brandbasket" });
  });

  it("hands the invoice no mobile for an account that has none", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice)]);
    mockedInvoices.mockResolvedValue([invoice]);

    expect((await get(`?ids=${SECOND}`)).status).toBe(200);
    expect(renderTaxInvoicesPdf).toHaveBeenCalledWith([invoice], { recipientPhone: null, brandName: "Brandbasket" });
  });

  it("still downloads a payment from before invoicing as a receipt, and reads no invoice", async () => {
    const response = await get(`?ids=${FIRST}`);

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-receipt-001.pdf"');
    expect(mockedInvoices).not.toHaveBeenCalled();
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(pdf.getTitle()).toBe("Brandbasket Receipt #001");
  });

  it("puts invoices and older receipts in one PDF, oldest first", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice), receipt(FIRST, 1)]);
    mockedInvoices.mockResolvedValue([invoice]);

    const response = await get();

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoices-and-receipts.pdf"');
    expect(await pageKinds(response)).toEqual(["receipt", "invoice"]);
  });

  it("names a download of invoices alone for invoices", async () => {
    const first = invoiceFor(FIRST, 1);
    const second = invoiceFor(SECOND, 2);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, second), invoicedReceipt(FIRST, 1, first)]);
    mockedInvoices.mockResolvedValue([first, second]);

    const response = await get();

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoices.pdf"');
    expect(await pageKinds(response)).toEqual(["invoice", "invoice"]);
  });

  it("keeps the order when invoices and receipts alternate, skipping the failed attempt", async () => {
    const first = invoiceFor(FIRST, 1);
    const third = invoiceFor(THIRD, 3);
    mockedReceipts.mockResolvedValue([
      invoicedReceipt(THIRD, 4, third),
      receipt(FAILED, 3, { status: "failed" }),
      receipt(SECOND, 2),
      invoicedReceipt(FIRST, 1, first),
    ]);
    mockedInvoices.mockResolvedValue([third, first]);

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoices-and-receipts.pdf"');
    expect(await pageKinds(response)).toEqual(["invoice", "receipt", "invoice"]);
  });

  it("falls back to the receipt when an invoice cannot be read", async () => {
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoiceFor(SECOND, 1))]);
    mockedInvoices.mockResolvedValue([]);

    const response = await get(`?ids=${SECOND}`);

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-receipt-002.pdf"');
    expect(await pageCount(response)).toBe(1);
  });

  it("draws the invoice as stored, under Brandbasket's name", async () => {
    const invoice = invoiceFor(SECOND, 1);
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoice)]);
    mockedInvoices.mockResolvedValue([invoice]);

    const response = await get(`?ids=${SECOND}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("filename=\"brandbasket-invoice-");
    const [shown, options] = vi.mocked(renderTaxInvoicesPdf).mock.calls.at(-1) ?? [];
    expect(shown?.[0]).toEqual(invoice);
    expect(options).toMatchObject({ brandName: "Brandbasket" });
  });

  it("finds nothing for another business's payment, and reads no invoice for it", async () => {
    mockedReceipts.mockResolvedValue([invoicedReceipt(SECOND, 2, invoiceFor(SECOND, 1))]);

    expect((await get(`?ids=${SOMEONE_ELSES}`)).status).toBe(404);
    expect(mockedInvoices).not.toHaveBeenCalled();
  });

  it("finds nothing to download before any payment", async () => {
    mockedReceipts.mockResolvedValue([]);
    expect((await get()).status).toBe(404);
  });
});
