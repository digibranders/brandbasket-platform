import type { Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announcePayment } from "./payment-alerts";
import { sendTeamsAlert } from "./teams-alerts";

vi.mock("server-only", () => ({}));
vi.mock("./teams-alerts", () => ({ sendTeamsAlert: vi.fn(async () => undefined) }));

const queries = vi.hoisted(() => ({
  findAddOnSubscriptionForPayment: vi.fn(),
  findChargeByPaymentId: vi.fn(),
  findPaymentAlertBase: vi.fn(),
  findPaymentForInvoice: vi.fn(),
  findPaymentInvoiceBasis: vi.fn(),
  findSubscriptionById: vi.fn(),
  findTaxInvoiceByPaymentId: vi.fn(),
}));
vi.mock("@brandbasket/db", () => queries);

const DB = {} as Database;
const SECRET = "a-secret-of-at-least-thirty-two-characters!!";
const ORIGIN = "https://console.example";
const PAID_AT = new Date("2026-10-26T12:24:17.000Z");

function base(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    payment: { id: "pay-1", businessId: "biz-1", subscriptionId: "sub-1", provider: "razorpay", providerPaymentId: "pay_Qx", kind, amountCents: 299_900, currency: "INR", status: "captured", paidAt: PAID_AT, attentionReason: null, ...overrides },
    business: { id: "biz-1", name: "Rao Clinic", websiteUrl: null, stateCode: "mh" },
    owner: { name: "Asha Rao", email: "asha@example.com", phone: "+919820011111" },
    captured: 1,
  };
}

function sent(): string {
  expect(sendTeamsAlert).toHaveBeenCalledTimes(1);
  expect(vi.mocked(sendTeamsAlert).mock.calls[0]?.[2]).toBe("payments");
  return JSON.stringify(vi.mocked(sendTeamsAlert).mock.calls[0]?.[3]);
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.findPaymentForInvoice.mockResolvedValue({ provider: "razorpay", providerPaymentId: "pay_Qx", method: "upi", cardNetwork: null, cardType: null, cardLast4: null, upiVpa: "asha@okhdfc", manualReference: null });
  queries.findTaxInvoiceByPaymentId.mockResolvedValue({ number: "BB/2026-27/0001", totalCents: 299_900, cgstCents: 22_874, sgstCents: 22_874, igstCents: 0 });
  queries.findSubscriptionById.mockResolvedValue({ id: "sub-1", adCreditCents: 0, paidThroughAt: new Date("2026-11-26T12:24:17.000Z") });
  queries.findPaymentInvoiceBasis.mockResolvedValue({
    netAmountCents: 0,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    lines: [{ addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 0, taxRateBasisPoints: 1800 }],
  });
});

describe("announcePayment", () => {
  it("tells the Payments channel about a plan payment, with who paid and what the invoice was", async () => {
    queries.findPaymentAlertBase.mockResolvedValue(base("initial"));
    await announcePayment(DB, SECRET, "pay-1", ORIGIN);
    const card = sent();
    for (const part of ["New customer paid: ₹2,999", "Asha Rao", "asha@example.com", "Rao Clinic", "Managed Website", "UPI (asha@okhdfc)", "BB/2026-27/0001", "+91 98200 11111", "https://console.example/clients/biz-1"]) {
      expect(card).toContain(part);
    }
    expect(card).toContain("₹457.48 GST inside");
    expect(vi.mocked(sendTeamsAlert).mock.calls[0]?.[0]).toBe(DB);
    expect(vi.mocked(sendTeamsAlert).mock.calls[0]?.[1]).toBe(SECRET);
  });

  it("names the add-on of an add-on payment and the description of a one-off charge", async () => {
    queries.findPaymentAlertBase.mockResolvedValue(base("add_on"));
    queries.findAddOnSubscriptionForPayment.mockResolvedValue({ addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 99_910 });
    await announcePayment(DB, SECRET, "pay-1", ORIGIN);
    expect(sent()).toContain("Social Media and Ads");

    vi.clearAllMocks();
    queries.findPaymentAlertBase.mockResolvedValue(base("charge"));
    queries.findChargeByPaymentId.mockResolvedValue({ description: "Extra change hours", amountCents: 285_000 });
    queries.findPaymentForInvoice.mockResolvedValue({ provider: "manual", providerPaymentId: "manual_charge_1", method: null, cardNetwork: null, cardType: null, cardLast4: null, upiVpa: null, manualReference: "NEFT 123" });
    queries.findTaxInvoiceByPaymentId.mockResolvedValue(null);
      await announcePayment(DB, SECRET, "pay-1", ORIGIN);
    const card = sent();
    expect(card).toContain("Extra change hours");
    expect(card).toContain("Recorded by hand, reference NEFT 123");
  });

  it("says a payment needs attention when it bought nothing", async () => {
    queries.findPaymentAlertBase.mockResolvedValue(base("initial", { attentionReason: "amount_mismatch" }));
    await announcePayment(DB, SECRET, "pay-1", ORIGIN);
    expect(sent()).toContain("Payment needs attention");
  });

  it("sends nothing for a payment that is not there", async () => {
    queries.findPaymentAlertBase.mockResolvedValue(null);
    await announcePayment(DB, SECRET, "pay-missing", ORIGIN);
    expect(sendTeamsAlert).not.toHaveBeenCalled();
  });

  it("never throws, and logs without the customer's details, when something cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queries.findPaymentAlertBase.mockResolvedValue(base("initial"));
    queries.findTaxInvoiceByPaymentId.mockRejectedValue(new Error("connection lost for asha@example.com"));
    await expect(announcePayment(DB, SECRET, "pay-1", ORIGIN)).resolves.toBeUndefined();
    expect(sendTeamsAlert).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).toContain("[teams-alert]");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("asha@example.com");
    logged.mockRestore();
  });
});
