import type { TaxInvoice, TaxInvoiceLineRecord } from "@fynix/db";
import { listTaxInvoicesIssuedBetween } from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess, logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn(), logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return { ...actual, listTaxInvoicesIssuedBetween: vi.fn() };
});

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

function invoiceFor(name: string): TaxInvoice {
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
    recipient: { legalName: name, tradeName: null, gstin: "27AAPFU0939F1ZV", cin: null, addressLines: ["Mumbai"], stateCode: "mh", email: null, phone: null },
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
  };
}

const request = (query: string): Request => new Request(`http://admin.test/invoices/export${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as never);
  vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("QA Premium Business")]);
});

describe("GET /invoices/export", () => {
  it.each([
    ["signed out", { kind: "signed-out" }],
    ["signed in but not staff", { kind: "not-staff" }],
  ])("answers a bare 401 to a visitor who is %s, reading nothing", async (_label, access) => {
    vi.mocked(getStaffAccess).mockResolvedValue(access as never);
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
  });

  it("checks access before it looks at the month, so a visitor learns nothing about the query", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "signed-out" } as never);
    expect((await GET(request("?month=nonsense"))).status).toBe(401);
  });

  it.each(["", "?month=2026-13", "?month=2026-00", "?month=", "?month=2026-1", "?month=2026-10-01", "?month=%20", "?month=0000-05", "?month=0001-01", "?month=1999-12", "?month=3000-01", "?month=9999-12", "?other=2026-10"])(
    "answers a bare 400 to the query %j, without asking the database",
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
      expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    },
  );

  it("sends the month as a private CSV download that Excel reads as UTF-8", async () => {
    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="fynix-invoices-2026-10.csv"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(listTaxInvoicesIssuedBetween).toHaveBeenCalledWith({ name: "staff-db" }, "2026-10-01", "2026-11-01");

    const bytes = new Uint8Array(await response.arrayBuffer());
    // Response.text() would hide the byte order mark, so check the raw bytes.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1);
    const rows = text.split("\r\n");
    expect(rows[0]).toBe("Invoice number,Invoice date,Customer,GSTIN,Type,Place of supply,SAC,Taxable value,CGST,SGST,IGST,Round off,Invoice total");
    expect(rows[1]).toBe("FY/26-27/000001,09-10-2026,QA Premium Business,27AAPFU0939F1ZV,B2B,27-Maharashtra,998361,5599.20,503.93,503.93,0.00,0.00,6607.06");
    expect(rows).toHaveLength(2);
  });

  it("records the export, with the month and the number of invoices in it, before sending the file", async () => {
    await GET(request("?month=2026-10"));
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "invoice.export",
      targetType: "invoice_register",
      targetId: "2026-10",
      detail: "rows=1",
    });
  });

  it("sends nothing when the export cannot be recorded", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log unavailable"));
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  });

  it("answers a bare 403 to support staff, reading nothing, and records the refusal", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as never);
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
  });

  it("lets an admin export too", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-3" }, staff: { userId: "staff-3", role: "admin" } } as never);
    expect((await GET(request("?month=2026-10"))).status).toBe(200);
  });

  it("records nothing for a visitor who is refused", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "signed-out" } as never);
    await GET(request("?month=2026-10"));
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("asks for December up to the January after it", async () => {
    await GET(request("?month=2026-12"));
    expect(listTaxInvoicesIssuedBetween).toHaveBeenCalledWith({ name: "staff-db" }, "2026-12-01", "2027-01-01");
  });

  it("sends just the header, with the mark, for a month with no invoices", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([]);
    const response = await GET(request("?month=2026-02"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n")).toHaveLength(1);
  });

  it("defuses a customer name a spreadsheet would run as a formula", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("=HYPERLINK(1)")]);
    const response = await GET(request("?month=2026-10"));
    expect(await response.text()).toContain(",'=HYPERLINK(1),");
  });

  it("works for the first and last months it supports", async () => {
    expect((await GET(request("?month=2000-01"))).status).toBe(200);
    expect(listTaxInvoicesIssuedBetween).toHaveBeenLastCalledWith({ name: "staff-db" }, "2000-01-01", "2000-02-01");
    expect((await GET(request("?month=2999-12"))).status).toBe(200);
    expect(listTaxInvoicesIssuedBetween).toHaveBeenLastCalledWith({ name: "staff-db" }, "2999-12-01", "3000-01-01");
  });

  it("answers a generic 500 and logs which invoice could not be written, never a customer detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = { ...invoiceFor("Priya Sharma"), number: "FY/26-27/000042", placeOfSupplyStateCode: "zz" };
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("QA Premium Business"), bad]);

    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0]?.[0]);
    expect(line).toContain("invoice-register-failed");
    expect(JSON.parse(line.slice(line.indexOf("{")))).toMatchObject({
      event: "invoice-register-failed",
      month: "2026-10",
      invoiceNumber: "FY/26-27/000042",
      errorName: "UnknownStateError",
    });
    expect(line).not.toMatch(/Priya|Sharma|27AAPFU0939F1ZV|Mumbai/);
    error.mockRestore();
  });

  it("lets a database failure surface instead of sending a short register as if it were whole", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockRejectedValue(new Error("connection lost"));
    await expect(GET(request("?month=2026-10"))).rejects.toThrow("connection lost");
  });
});
