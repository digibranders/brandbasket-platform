import { InvalidGstinError, InvoiceAmountMismatchError, UnknownStateError, BillingRangeError } from "@brandbasket/billing";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, lockBusinessForBilling: vi.fn() };
});
vi.mock("@brandbasket/shared/server/tax-invoice-reissue", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/shared/server/tax-invoice-reissue")>("@brandbasket/shared/server/tax-invoice-reissue");
  return { ...actual, issueMissingTaxInvoice: vi.fn() };
});
vi.mock("./db", () => ({
  getStaffDb: () => ({ transaction: (fn: (tx: unknown) => unknown) => fn({ name: "staff-tx" }) }),
}));

import { lockBusinessForBilling } from "@brandbasket/db";
import {
  InvoiceSourceMismatchError,
  issueMissingTaxInvoice,
  NoMissingInvoiceError,
  UnsupportedPaymentKindError,
} from "@brandbasket/shared/server/tax-invoice-reissue";
import {
  InvalidServicePeriodError,
  InvoiceDatedBeforePaymentError,
  UnprintableInvoiceTextError,
} from "@brandbasket/shared/server/tax-invoicing";
import { issueClientMissingInvoice } from "./invoices-admin";

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const PAYMENT = "0192f3c4-2222-7000-8000-000000000002";
const NOW = new Date("2026-11-15T05:30:00Z");
const STAFF = "0192f3c4-3333-7000-8000-000000000003";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("issueClientMissingInvoice", () => {
  it("takes the business's billing lock before it issues, in one staff transaction, dated now", async () => {
    const calls: string[] = [];
    vi.mocked(lockBusinessForBilling).mockImplementation(async () => {
      calls.push("lock");
    });
    vi.mocked(issueMissingTaxInvoice).mockImplementation(async () => {
      calls.push("issue");
      return {} as never;
    });

    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).resolves.toBe("issued");

    expect(calls).toEqual(["lock", "issue"]);
    expect(lockBusinessForBilling).toHaveBeenCalledWith({ name: "staff-tx" }, BUSINESS);
    expect(issueMissingTaxInvoice).toHaveBeenCalledWith({ name: "staff-tx" }, BUSINESS, PAYMENT, NOW);
  });

  it("logs tax-invoice-issued after it commits, with who issued it and no customer detail", async () => {
    vi.mocked(issueMissingTaxInvoice).mockResolvedValue({
      number: "FY/26-27/000007",
      recipient: { legalName: "Priya Sharma", gstin: "27AAPFU0939F1ZV", addressLines: ["12 Lake Road, Thane"] },
    } as never);

    await issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF);

    const lines = vi.mocked(console.info).mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("tax-invoice-issued");
    expect(JSON.parse(lines[0]?.slice(lines[0].indexOf("{")) ?? "")).toEqual({
      event: "tax-invoice-issued",
      businessId: BUSINESS,
      paymentId: PAYMENT,
      provider: null,
      invoiceNumber: "FY/26-27/000007",
      issuedBy: STAFF,
    });
    expect(lines[0]).not.toMatch(/Priya|Sharma|27AAPFU0939F1ZV|Lake Road/);
  });

  it("logs nothing as issued when the transaction fails, because the log comes after the commit", async () => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(new Error("connection terminated"));
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).rejects.toThrow();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("says a payment is not missing its invoice when it is not listed as missing one", async () => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(new NoMissingInvoiceError());
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).resolves.toBe("not-missing");
  });

  it.each([
    ["a price that explains nothing", new InvoiceSourceMismatchError("renewal")],
    ["lines that do not add up to the payment", new InvoiceAmountMismatchError(100, 200)],
  ])("says the figures do not match for %s, and logs it", async (_label, error) => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(error);
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).resolves.toBe("mismatch");
    expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain("tax-invoice-failed");
  });

  it.each([
    ["a GSTIN that fails its check", new InvalidGstinError()],
    ["a state the invoice cannot place", new UnknownStateError("zz")],
  ])("refuses %s, and logs it without the customer's details", async (_label, error) => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(error);
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).resolves.toBe("refused");
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(line).toContain("tax-invoice-failed");
    expect(line).toContain(BUSINESS);
    expect(line).toContain(PAYMENT);
  });

  it.each([
    ["a name or address the invoice cannot print", new UnprintableInvoiceTextError(), "english-letters"],
    ["an issue date before the payment", new InvoiceDatedBeforePaymentError(NOW, new Date("2026-12-01T00:00:00Z")), "date-before-payment"],
    ["a service period that ends before it starts", new InvalidServicePeriodError(NOW, NOW), "bad-period"],
    ["a payment kind it cannot rebuild", new UnsupportedPaymentKindError("extra_publish"), "unsupported-kind"],
    ["any other bad figure", new BillingRangeError("Quantity must be a positive whole number"), "mismatch"],
  ])("tells staff the real reason for %s", async (_label, error, notice) => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(error);
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).resolves.toBe(notice);
    expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain("tax-invoice-failed");
    expect(console.info).not.toHaveBeenCalled();
  });

  it("rethrows anything else, such as a lost connection, rather than call it a refusal", async () => {
    vi.mocked(issueMissingTaxInvoice).mockRejectedValue(new Error("connection terminated"));
    await expect(issueClientMissingInvoice(BUSINESS, PAYMENT, NOW, STAFF)).rejects.toThrow("connection terminated");
  });
});
