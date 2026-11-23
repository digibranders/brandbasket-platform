import type { Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyEvent: vi.fn(async () => undefined),
  findPaymentAlertBase: vi.fn(),
  findBusinessAlertDetails: vi.fn(),
  findLatestSubscriptionForBusiness: vi.fn(async () => null),
  hasEmailContaining: vi.fn(async () => false),
  isUnappliedReason: vi.fn((reason: string | null) => reason === "unapplied"),
}));

vi.mock("./notify-event", () => ({ notifyEvent: mocks.notifyEvent }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  findPaymentAlertBase: mocks.findPaymentAlertBase,
  findBusinessAlertDetails: mocks.findBusinessAlertDetails,
  findLatestSubscriptionForBusiness: mocks.findLatestSubscriptionForBusiness,
  hasEmailContaining: mocks.hasEmailContaining,
  isUnappliedReason: mocks.isUnappliedReason,
  findBundledAddOnsForSubscription: vi.fn(async () => []),
  findTaxInvoiceByPaymentId: vi.fn(async () => null),
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
    expect(mocks.notifyEvent.mock.calls.map((call) => (call[1] as { event: string }).event)).toEqual(["billing.unapplied_payment", "billing.payment_needs_look.staff"]);
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
    expect(mocks.notifyEvent.mock.calls.map((call) => (call[1] as { dedupeKey: string }).dedupeKey)).toEqual(["CN-1", "p5:200"]);
  });
});

describe("sendFirstChargeReminder", () => {
  it("notifies once per charge date", async () => {
    await sendFirstChargeReminder(DB, deps, { businessId: BUSINESS, amountCents: 100, currency: "INR", chargeDate: new Date("2026-12-01T00:00:00Z") });
    expect(mocks.notifyEvent).toHaveBeenCalledTimes(1);
    expect(mocks.notifyEvent).toHaveBeenCalledWith(DB, expect.objectContaining({ event: "billing.renewal_upcoming", dedupeKey: `${BUSINESS}:2026-12-01T00:00:00.000Z`, data: { when: expect.any(String) } }));
  });
});
