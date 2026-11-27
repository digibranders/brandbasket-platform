import {
  consumeRateLimit,
  findBillingState,
  findChargeForBusiness,
  findOpenPaymentLinkForBusiness,
  insertAdvanceCharge,
  lockBusinessForBilling,
  type Database,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startAdvancePaymentFor } from "./advance-payment";
import { billingDetailsMissing } from "./billing-details";
import { startCustomerChargePayment } from "./charges";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

vi.mock("server-only", () => ({}));
vi.mock("./billing-details", () => ({ billingDetailsMissing: vi.fn() }));
vi.mock("./charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("./checkout", () => ({ CHECKOUT_RATE_LIMIT: { limit: 10, windowSeconds: 3600 } }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class MockBillingBusinessNotFoundError extends Error {}
  return {
    BillingBusinessNotFoundError: MockBillingBusinessNotFoundError,
    consumeRateLimit: vi.fn(),
    findBillingState: vi.fn(),
    findChargeForBusiness: vi.fn(),
    findOpenPaymentLinkForBusiness: vi.fn(),
    insertAdvanceCharge: vi.fn(),
    lockBusinessForBilling: vi.fn(),
  };
});

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-11-27T09:00:00Z");
const TX = { name: "staff-tx" };
const CUSTOMER = { tenant: { userId: "user-1", businessId: BUSINESS, businessName: "Chennai Cafe", role: "owner" }, user: { id: "user-1", email: "a@example.com" }, billing: {} } as unknown as GrantedCustomer;

const LINK = {
  id: "link-1",
  businessId: BUSINESS,
  dealType: "paid",
  advanceCents: 500_000,
  advancePaidAt: null,
  advanceChargeId: null,
  websiteKind: "ecommerce",
  currency: "INR",
} as never;
const OPEN_CHARGE = { id: "charge-1", status: "open", amountCents: 500_000, currency: "INR" } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app-db" } as unknown as Database);
  vi.mocked(getStaffDb).mockReturnValue({ transaction: async (run: (tx: unknown) => unknown) => run(TX) } as unknown as Database);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(billingDetailsMissing).mockResolvedValue(false);
  vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: false } as never);
  vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(LINK);
  vi.mocked(insertAdvanceCharge).mockResolvedValue(OPEN_CHARGE);
  vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "razorpay", orderId: "order_1", charge: OPEN_CHARGE });
});

const refusedWith = (outcome: Awaited<ReturnType<typeof startAdvancePaymentFor>>) => (outcome.kind === "refused" ? outcome.problem.message : null);

describe("startAdvancePaymentFor", () => {
  it("adds the charge once, from the link's advance alone, under the billing lock, then sends the customer to the order's page", async () => {
    const outcome = await startAdvancePaymentFor(CUSTOMER, NOW);

    expect(outcome).toEqual({ kind: "redirect", url: "/checkout/charges/charge-1" });
    expect(lockBusinessForBilling).toHaveBeenCalledWith(TX, BUSINESS);
    expect(insertAdvanceCharge).toHaveBeenCalledWith(TX, {
      businessId: BUSINESS,
      linkId: "link-1",
      amountCents: 500_000,
      currency: "INR",
      description: "Website design and build: advance (Ecommerce store)",
      taxRateBasisPoints: 1800,
    });
    expect(startCustomerChargePayment).toHaveBeenCalledWith(CUSTOMER, "charge-1");
  });

  it("follows the fake provider's own page when the provider gives one", async () => {
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "redirect", url: "/billing/fake/pay?token=t" });
    expect(await startAdvancePaymentFor(CUSTOMER, NOW)).toEqual({ kind: "redirect", url: "/billing/fake/pay?token=t" });
  });

  it("reuses the link's open charge when its amount and currency still match, and adds no second", async () => {
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({ ...(LINK as object), advanceChargeId: "charge-1" } as never);
    vi.mocked(findChargeForBusiness).mockResolvedValue(OPEN_CHARGE);

    expect(await startAdvancePaymentFor(CUSTOMER, NOW)).toEqual({ kind: "redirect", url: "/checkout/charges/charge-1" });
    expect(insertAdvanceCharge).not.toHaveBeenCalled();
  });

  it.each([
    ["no longer open", { status: "paid" }],
    ["for another amount", { amountCents: 400_000 }],
    ["in another currency", { currency: "USD" }],
  ])("refuses to pay a charge that is %s, and never recomputes it", async (_name, change) => {
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({ ...(LINK as object), advanceChargeId: "charge-1" } as never);
    vi.mocked(findChargeForBusiness).mockResolvedValue({ ...(OPEN_CHARGE as object), ...change } as never);

    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/nothing to pay for/);
    expect(insertAdvanceCharge).not.toHaveBeenCalled();
    expect(startCustomerChargePayment).not.toHaveBeenCalled();
  });

  it.each([
    ["no open link", null],
    ["a free deal", { ...(LINK as object), dealType: "free", advanceCents: null }],
    ["a link bound to another business", { ...(LINK as object), businessId: "0192f3c4-9999-7000-8000-000000000009" }],
    ["a link with no website kind", { ...(LINK as object), websiteKind: null }],
  ])("refuses %s", async (_name, link) => {
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue(link as never);

    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/nothing to pay for/);
    expect(insertAdvanceCharge).not.toHaveBeenCalled();
  });

  it("says so when the advance is already paid", async () => {
    vi.mocked(findOpenPaymentLinkForBusiness).mockResolvedValue({ ...(LINK as object), advancePaidAt: NOW } as never);
    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/already paid/);
    expect(insertAdvanceCharge).not.toHaveBeenCalled();
  });

  it("refuses a business that already has an activated subscription", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ hasEverPaid: true } as never);
    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/nothing to pay for/);
    expect(insertAdvanceCharge).not.toHaveBeenCalled();
  });

  it("refuses past the rate limit, and without billing details, before anything is read or written", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false } as never);
    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/lot of attempts/);

    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(billingDetailsMissing).mockResolvedValue(true);
    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/billing details/);
    expect(lockBusinessForBilling).not.toHaveBeenCalled();
  });

  it("refuses when the order cannot be opened", async () => {
    vi.mocked(startCustomerChargePayment).mockResolvedValue({ kind: "not-open" });
    expect(refusedWith(await startAdvancePaymentFor(CUSTOMER, NOW))).toMatch(/couldn.t open your payment/);
  });
});
