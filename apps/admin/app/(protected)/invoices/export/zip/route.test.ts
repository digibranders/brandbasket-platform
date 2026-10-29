import type { TaxInvoice, TaxInvoiceLineRecord } from "@brandbasket/db";
import { findBusinessOwnerPhone, listTaxInvoicesIssuedBetween } from "@brandbasket/db";
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
  return { ...actual, listTaxInvoicesIssuedBetween: vi.fn(), findBusinessOwnerPhone: vi.fn() };
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

function invoiceFor(name: string, number = "FY/26-27/000001"): TaxInvoice {
  return {
    id: "01920000-0000-7000-8000-000000000001",
    businessId: "01920000-0000-7000-8000-0000000000b1",
    paymentId: "01920000-0000-7000-8000-0000000000a1",
    prefix: "FY",
    financialYear: "26-27",
    serial: 1,
    number,
    issuedOn: "2026-10-09",
    paidOn: "2026-10-09",
    supplier: {
      legalName: "Digibranders Private Limited",
      tradeName: "Brandbasket",
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

const request = (query: string): Request => new Request(`http://admin.test/invoices/export/zip${query}`);

/** The entries of a stored ZIP, read from its central directory: name to bytes. */
function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(pos + 28, true);
    const size = view.getUint32(pos + 20, true);
    const offset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    entries.set(name, bytes.subarray(start, start + size));
    pos += 46 + nameLength;
  }
  return entries;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as never);
  vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("QA Premium Business")]);
  vi.mocked(findBusinessOwnerPhone).mockResolvedValue("+919820012345");
});

describe("GET /invoices/export/zip", () => {
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

  it.each(["", "?month=2026-13", "?month=2026-00", "?month=", "?month=2026-1", "?month=2026-10-01", "?month=0001-01", "?other=2026-10"])(
    "answers a bare 400 to the query %j, without asking the database",
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
      expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    },
  );

  it("answers a bare 403 to support staff, reading nothing, and records the refusal", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as never);
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(listTaxInvoicesIssuedBetween).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
  });

  it("answers a bare 404 for a month with no invoices, and records nothing", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([]);
    const response = await GET(request("?month=2026-02"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("answers a bare 413 for more than 500 invoices, rendering none and recording nothing", async () => {
    const many = Array.from({ length: 501 }, (_, index) => invoiceFor("QA Premium Business", `FY/26-27/${String(index + 1).padStart(6, "0")}`));
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue(many);
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(findBusinessOwnerPhone).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
  });

  it("sends the month as a private ZIP holding each invoice as a PDF and the register CSV", async () => {
    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-invoices-2026-10.zip"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(listTaxInvoicesIssuedBetween).toHaveBeenCalledWith({ name: "staff-db" }, "2026-10-01", "2026-11-01");

    const entries = zipEntries(new Uint8Array(await response.arrayBuffer()));
    expect([...entries.keys()]).toEqual(["invoices/FY-26-27-000001.pdf", "register.csv"]);
    expect(new TextDecoder().decode(entries.get("invoices/FY-26-27-000001.pdf")?.slice(0, 5))).toBe("%PDF-");
    expect(findBusinessOwnerPhone).toHaveBeenCalledWith({ name: "staff-db" }, "01920000-0000-7000-8000-0000000000b1");

    const csv = entries.get("register.csv") ?? new Uint8Array();
    expect([...csv.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = new TextDecoder("utf-8", { ignoreBOM: true }).decode(csv).slice(1).split("\r\n");
    expect(rows[0]).toBe("Invoice number,Invoice date,Customer,GSTIN,Type,Place of supply,SAC,Taxable value,CGST,SGST,IGST,Round off,Invoice total");
    expect(rows[1]).toBe("FY/26-27/000001,09-10-2026,QA Premium Business,27AAPFU0939F1ZV,B2B,27-Maharashtra,998361,5599.20,503.93,503.93,0.00,0.00,6607.06");
    expect(rows).toHaveLength(2);
  });

  it("records the export, with the month and the number of invoices in it, before sending the file", async () => {
    const events: string[] = [];
    vi.mocked(logStaffAccessOrThrow).mockImplementation(async () => {
      events.push("recorded");
    });
    const response = await GET(request("?month=2026-10"));
    events.push("response");
    expect(events).toEqual(["recorded", "response"]);
    expect(response.status).toBe(200);
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "invoice.export_zip",
      targetType: "invoice_register",
      targetId: "2026-10",
      detail: "invoices=1",
    });
  });

  it("sends nothing when the export cannot be recorded", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("log unavailable"));
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("looks up each business's owner phone once, however many of its invoices the month holds", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("QA Premium Business"), invoiceFor("QA Premium Business", "FY/26-27/000002")]);
    const response = await GET(request("?month=2026-10"));
    expect(response.status).toBe(200);
    expect(findBusinessOwnerPhone).toHaveBeenCalledTimes(1);
    const entries = zipEntries(new Uint8Array(await response.arrayBuffer()));
    expect([...entries.keys()]).toEqual(["invoices/FY-26-27-000001.pdf", "invoices/FY-26-27-000002.pdf", "register.csv"]);
  });

  it("answers a generic 500 and logs which invoice could not be written, never a customer detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bad = { ...invoiceFor("Priya Sharma", "FY/26-27/000042"), placeOfSupplyStateCode: "zz" };
    vi.mocked(listTaxInvoicesIssuedBetween).mockResolvedValue([invoiceFor("QA Premium Business"), bad]);

    const response = await GET(request("?month=2026-10"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(findBusinessOwnerPhone).not.toHaveBeenCalled();
    expect(logStaffAccessOrThrow).not.toHaveBeenCalled();
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

  it("lets a database failure surface instead of sending a short ZIP as if it were whole", async () => {
    vi.mocked(listTaxInvoicesIssuedBetween).mockRejectedValue(new Error("connection lost"));
    await expect(GET(request("?month=2026-10"))).rejects.toThrow("connection lost");
  });
});
