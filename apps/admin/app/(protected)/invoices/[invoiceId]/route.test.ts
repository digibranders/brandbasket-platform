import type { TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import { findBusinessOwnerPhone, findTaxInvoiceById } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn(), logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, findBusinessOwnerPhone: vi.fn(), findTaxInvoiceById: vi.fn() };
});

const INVOICE_ID = "01920000-0000-7000-8000-000000000001";
const UNKNOWN_ID = "01920000-0000-7000-8000-0000000000ff";

const line: TaxInvoiceLineRecord = {
  description: "Brandbasket Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: null,
  sac: "998361",
  quantity: 1,
  unitAmountCents: 299_900,
  grossAmountCents: 299_900,
  discountAmountCents: 0,
  taxableCents: 299_900,
  taxRateBasisPoints: 1_800,
  cgstCents: 26_991,
  sgstCents: 26_991,
  igstCents: 0,
  taxCents: 53_982,
};

const invoice: TaxInvoice = {
  id: INVOICE_ID,
  businessId: "01920000-0000-7000-8000-0000000000b1",
  paymentId: "01920000-0000-7000-8000-0000000000a1",
  prefix: "FY",
  financialYear: "26-27",
  serial: 1,
  number: "FY/26-27/000001",
  issuedOn: "2026-11-15",
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
    legalName: "QA Premium Business",
    tradeName: null,
    gstin: "27AAPFU0939F1ZV",
    cin: null,
    addressLines: ["Shop 4, Gokul Arcade, Mumbai 400080"],
    stateCode: "mh",
    email: null,
    phone: null,
  },
  placeOfSupplyStateCode: "mh",
  placeOfSupplyBasis: "gstin",
  supplyType: "intra_state",
  lines: [line],
  taxableCents: 299_900,
  cgstCents: 26_991,
  sgstCents: 26_991,
  igstCents: 0,
  roundOffCents: 0,
  totalCents: 353_882,
  paymentLabel: "Visa credit card ending 4366",
  paymentReference: "pay_TljxffN6THodkg",
  createdAt: new Date("2026-11-15T06:00:00Z"),
};

function request(): Request {
  return new Request(`http://admin.test/invoices/${INVOICE_ID}`);
}

function context(invoiceId: string): RouteContext<"/invoices/[invoiceId]"> {
  return { params: Promise.resolve({ invoiceId }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as never);
  vi.mocked(findTaxInvoiceById).mockResolvedValue(invoice);
  vi.mocked(findBusinessOwnerPhone).mockResolvedValue("+919820012345");
});

describe("GET /invoices/[invoiceId]", () => {
  it.each([
    ["signed out", { kind: "signed-out" }],
    ["signed in but not staff", { kind: "not-staff" }],
  ])("answers a bare 401 to a visitor who is %s, reading nothing", async (_label, access) => {
    vi.mocked(getStaffAccess).mockResolvedValue(access as never);
    const response = await GET(request(), context(INVOICE_ID));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(findTaxInvoiceById).not.toHaveBeenCalled();
    expect(findBusinessOwnerPhone).not.toHaveBeenCalled();
  });

  it("answers 400 to an id that is not a UUID, without asking the database", async () => {
    for (const bad of ["1", "not-an-id", "1; drop table tax_invoices", `${INVOICE_ID}x`]) {
      const response = await GET(request(), context(bad));
      expect(response.status).toBe(400);
    }
    expect(findTaxInvoiceById).not.toHaveBeenCalled();
  });

  it("answers 404 to an id that names no invoice", async () => {
    vi.mocked(findTaxInvoiceById).mockResolvedValue(null);
    const response = await GET(request(), context(UNKNOWN_ID));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(findTaxInvoiceById).toHaveBeenCalledWith({ name: "staff-db" }, UNKNOWN_ID);
  });

  it("sends the invoice as a private PDF download named for its number", async () => {
    const response = await GET(request(), context(INVOICE_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoice-FY-26-27-000001.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(findTaxInvoiceById).toHaveBeenCalledWith({ name: "staff-db" }, INVOICE_ID);
    expect(findBusinessOwnerPhone).toHaveBeenCalledWith({ name: "staff-db" }, invoice.businessId);
  });

  it("answers a bare 403 to support staff, reading nothing, and records the refusal", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as never);
    const response = await GET(request(), context(INVOICE_ID));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(findTaxInvoiceById).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
  });

  it("records which invoice was downloaded, for which business, before sending it", async () => {
    await GET(request(), context(INVOICE_ID));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "invoice.view",
      targetType: "invoice",
      targetId: INVOICE_ID,
      businessId: invoice.businessId,
    });
  });

  it("sends nothing when the download cannot be recorded", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log unavailable"));
    const response = await GET(request(), context(INVOICE_ID));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  });

  it("records nothing for an invoice that does not exist", async () => {
    vi.mocked(findTaxInvoiceById).mockResolvedValue(null);
    await GET(request(), context(UNKNOWN_ID));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("still sends the invoice when the owner has no mobile number", async () => {
    vi.mocked(findBusinessOwnerPhone).mockResolvedValue(null);
    const response = await GET(request(), context(INVOICE_ID));
    expect(response.status).toBe(200);
  });
});
