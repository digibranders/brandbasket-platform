import type { Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyEvent: vi.fn(async (_db: unknown, _input: { event: string; dedupeKey: string }) => undefined),
  findPaymentAlertBase: vi.fn(),
  findBusinessAlertDetails: vi.fn(),
  findLatestSubscriptionForBusiness: vi.fn(async () => null),
  hasEmailContaining: vi.fn(async () => false),
  isUnappliedReason: vi.fn((reason: string | null) => reason === "unapplied"),
  findTaxInvoiceByPaymentId: vi.fn(async (): Promise<unknown> => null),
  renderTaxInvoicesPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock("./tax-invoice-pdf", () => ({ renderTaxInvoicesPdf: mocks.renderTaxInvoicesPdf }));

vi.mock("./notify-event", () => ({ notifyEvent: mocks.notifyEvent }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  findPaymentAlertBase: mocks.findPaymentAlertBase,
  findBusinessAlertDetails: mocks.findBusinessAlertDetails,
  findLatestSubscriptionForBusiness: mocks.findLatestSubscriptionForBusiness,
  hasEmailContaining: mocks.hasEmailContaining,
  isUnappliedReason: mocks.isUnappliedReason,
  findBundledAddOnsForSubscription: vi.fn(async () => []),
  findTaxInvoiceByPaymentId: mocks.findTaxInvoiceByPaymentId,
}));
vi.mock("./payment-alerts", () => ({ paymentServiceNames: vi.fn(async () => []), serviceTitle: vi.fn() }));
vi.mock("./email-preference", () => ({ emailPreferenceAllows: vi.fn(async () => false) }));
vi.mock("server-only", () => ({}));

import { sendFirstChargeReminder, sendPaymentFailed, sendPaymentReceipt, sendPaymentRefunded } from "./payment-emails";

const DB = {} as Database;
const BUSINESS = "b1";
const OWNER = { userId: "u1", name: "Asha", email: "asha@example.com" };
const send = vi.fn(async () => undefined);
const deps = { send, dashboardOrigin: "https://app.example.test" };
const customer = { kind: "customer", businessId: BUSINESS } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBusinessAlertDetails.mockResolvedValue({ owner: OWNER, businessName: "Asha Cafe" });
  mocks.hasEmailContaining.mockResolvedValue(false);
  mocks.findTaxInvoiceByPaymentId.mockResolvedValue(null);
});

describe("sendPaymentReceipt, the bell and push", () => {
  it("notifies a captured payment once, by payment id, and keeps the receipt email", async () => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: { id: "p1", businessId: BUSINESS, status: "captured", attentionReason: null, kind: "charge", amountCents: 100, currency: "INR", createdAt: new Date() }, owner: OWNER });
    await sendPaymentReceipt(DB, deps, "p1");
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEvent).toHaveBeenCalledWith(DB, { event: "billing.payment_received", audience: customer, dedupeKey: "p1", data: {} });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("tells the owner and staff about an unapplied payment, and sends no receipt", async () => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: { id: "p2", businessId: BUSINESS, status: "captured", attentionReason: "unapplied" }, owner: OWNER });
    await sendPaymentReceipt(DB, deps, "p2");
    expect(mocks.notifyEvent.mock.calls.map((call) => call[1].event)).toEqual(["billing.unapplied_payment", "billing.payment_needs_look.staff"]);
    expect(send).not.toHaveBeenCalled();
  });

  it("notifies nothing for a payment that is not captured", async () => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: { id: "p3", businessId: BUSINESS, status: "refunded", attentionReason: null }, owner: OWNER });
    await sendPaymentReceipt(DB, deps, "p3");
    expect(mocks.notifyEvent).not.toHaveBeenCalled();
  });

  it("still notifies an owner with no email address", async () => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: { id: "p4", businessId: BUSINESS, status: "captured", attentionReason: null, kind: "charge" }, owner: { ...OWNER, email: null } });
    await sendPaymentReceipt(DB, deps, "p4");
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("sendPaymentReceipt, the PDF and the set-password link", () => {
  const PAYMENT = { id: "p9", businessId: BUSINESS, status: "captured", attentionReason: null, kind: "charge", amountCents: 100, currency: "INR", createdAt: new Date() };
  const INVOICE = { number: "BB/2026-27/0001", lines: [] };
  const SET_PASSWORD = { url: "https://app.example.test/reset-password/tok-9", lifetimeDays: 3 };

  beforeEach(() => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: PAYMENT, owner: OWNER });
  });

  interface SentEmail {
    bodyText: string;
    attachments?: readonly { name: string; content: Uint8Array }[];
    outboxCopy?: { bodyText: string };
  }
  function sent(): SentEmail {
    return (send.mock.calls as unknown as [SentEmail][])[0]![0];
  }

  it("attaches the tax invoice PDF, named for its number", async () => {
    mocks.findTaxInvoiceByPaymentId.mockResolvedValue(INVOICE);
    await sendPaymentReceipt(DB, deps, "p9");
    expect(mocks.renderTaxInvoicesPdf).toHaveBeenCalledWith([INVOICE]);
    expect(sent().attachments).toEqual([{ name: "brandbasket-invoice-BB-2026-27-0001.pdf", content: new Uint8Array([37, 80, 68, 70]) }]);
    expect(sent().bodyText).toContain("Your invoice is attached to this email.");
  });

  it("attaches the receipt PDF when there is no invoice and the app can make one", async () => {
    const receipt = { name: "receipt.pdf", content: new Uint8Array([1]) };
    const renderReceiptPdf = vi.fn(async () => receipt);
    await sendPaymentReceipt(DB, { ...deps, renderReceiptPdf }, "p9");
    expect(renderReceiptPdf).toHaveBeenCalledWith(PAYMENT);
    expect(sent().attachments).toEqual([receipt]);
  });

  it("sends the email without a PDF, and never fails, when none can be made", async () => {
    mocks.findTaxInvoiceByPaymentId.mockResolvedValue(INVOICE);
    mocks.renderTaxInvoicesPdf.mockRejectedValueOnce(new Error("font"));
    await sendPaymentReceipt(DB, deps, "p9");
    expect(send).toHaveBeenCalledTimes(1);
    expect(sent().attachments).toBeUndefined();
    expect(sent().bodyText).not.toContain("attached");
  });

  it("sends the email again without the file, and without saying it is attached, when the provider refuses the first", async () => {
    mocks.findTaxInvoiceByPaymentId.mockResolvedValue(INVOICE);
    send.mockResolvedValueOnce({ status: "failed", error: "attachment rejected" } as never);
    await sendPaymentReceipt(DB, { ...deps, setPassword: vi.fn(async () => SET_PASSWORD) }, "p9");
    expect(send).toHaveBeenCalledTimes(2);
    const second = (send.mock.calls as unknown as [SentEmail][])[1]![0];
    expect(second.attachments).toBeUndefined();
    expect(second.bodyText).not.toContain("attached");
    expect(second.bodyText).toContain(SET_PASSWORD.url);
  });

  it("does not send twice when the first send worked", async () => {
    mocks.findTaxInvoiceByPaymentId.mockResolvedValue(INVOICE);
    await sendPaymentReceipt(DB, deps, "p9");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("includes the set-password block only for an account that has no password, and keeps the link out of the stored copy", async () => {
    const setPassword = vi.fn(async () => SET_PASSWORD);
    await sendPaymentReceipt(DB, { ...deps, setPassword }, "p9");
    expect(setPassword).toHaveBeenCalledWith("asha@example.com");
    expect(sent().bodyText).toContain(SET_PASSWORD.url);
    expect(sent().outboxCopy?.bodyText).not.toContain("tok-9");
    expect(sent().outboxCopy?.bodyText).toContain("/billing/receipts");
  });

  it("adds no block for an account that already has a password", async () => {
    await sendPaymentReceipt(DB, { ...deps, setPassword: vi.fn(async () => null) }, "p9");
    expect(sent().bodyText).not.toContain("Set your password");
    expect(sent().outboxCopy).toBeUndefined();
  });

  it("sends nothing, and makes no link or PDF, when this payment's email was already sent", async () => {
    mocks.hasEmailContaining.mockResolvedValue(true);
    const setPassword = vi.fn(async () => SET_PASSWORD);
    mocks.findTaxInvoiceByPaymentId.mockResolvedValue(INVOICE);
    await sendPaymentReceipt(DB, { ...deps, setPassword }, "p9");
    expect(send).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
    expect(mocks.renderTaxInvoicesPdf).not.toHaveBeenCalled();
  });
});

describe("sendPaymentFailed", () => {
  it("notifies once by the provider payment id and emails even when the billing email preference is off (mandatory)", async () => {
    await sendPaymentFailed(DB, deps, { businessId: BUSINESS, providerPaymentId: "pay_1", amountCents: 100, currency: "INR", chargeDescription: "Extra" });
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEvent).toHaveBeenCalledWith(DB, { event: "billing.payment_failed", audience: customer, dedupeKey: "pay_1", data: {} });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("sendPaymentRefunded", () => {
  it("keys the notice on the credit note, or on the payment and amount for a part refund", async () => {
    mocks.findPaymentAlertBase.mockResolvedValue({ payment: { id: "p5", businessId: BUSINESS, createdAt: new Date(), currency: "INR", amountCents: 500 }, owner: OWNER });
    await sendPaymentRefunded(DB, deps, { paymentId: "p5", refundedAmountCents: 200, reason: "x", creditNoteNumber: "CN-1" });
    await sendPaymentRefunded(DB, deps, { paymentId: "p5", refundedAmountCents: 200, reason: "x", creditNoteNumber: null });
    expect(mocks.notifyEvent.mock.calls.map((call) => call[1].dedupeKey)).toEqual(["CN-1", "p5:200"]);
  });
});

describe("sendFirstChargeReminder", () => {
  it("notifies once per charge date", async () => {
    await sendFirstChargeReminder(DB, deps, { businessId: BUSINESS, amountCents: 100, currency: "INR", chargeDate: new Date("2026-12-01T00:00:00Z") });
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEvent).toHaveBeenCalledWith(DB, expect.objectContaining({ event: "billing.renewal_upcoming", dedupeKey: `${BUSINESS}:2026-12-01T00:00:00.000Z`, data: { when: expect.any(String) } }));
  });
});
