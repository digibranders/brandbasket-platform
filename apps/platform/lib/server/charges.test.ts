import { CheckoutVerificationError, type BillingProvider } from "@brandbasket/billing";
import type { Charge } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findChargeByProviderOrder: vi.fn(),
    findChargeForBusiness: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    openBlogPostsCharge: vi.fn(),
    setChargeProviderOrder: vi.fn(),
    withTenantScope: (_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ name: "app-tx" }),
  };
});
vi.mock("@brandbasket/shared/server/charge-payments", () => ({ recordChargePaymentWithInvoice: vi.fn() }));
vi.mock("@brandbasket/shared/server/basket-change", () => ({ finishAddOnAfterPayment: vi.fn() }));
vi.mock("./add-ons", () => ({ basketDeps: () => ({ name: "basket-deps" }) }));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./db", () => ({
  getAppDb: () => ({ name: "app-db" }),
  getStaffDb: () => ({ name: "staff-db", transaction: (fn: (tx: unknown) => unknown) => fn({ name: "staff-tx" }) }),
}));

import {
  findChargeByProviderOrder,
  findChargeForBusiness,
  lockBusinessForBilling,
  openBlogPostsCharge,
  setChargeProviderOrder,
} from "@brandbasket/db";
import { finishAddOnAfterPayment } from "@brandbasket/shared/server/basket-change";
import { recordChargePaymentWithInvoice } from "@brandbasket/shared/server/charge-payments";
import { getBillingProvider } from "./billing";
import {
  confirmFakeChargePayment,
  openBlogUnlock,
  recordRazorpayChargePayment,
  startCustomerChargePayment,
} from "./charges";

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const CHARGE_ID = "0192f3c4-3333-7000-8000-000000000003";
const NOW = new Date("2026-10-02T09:00:00Z");
const TENANT = { userId: "user-1", businessId: BUSINESS, businessName: "Chennai Cafe", role: "owner" } as const;
const CUSTOMER = { tenant: TENANT, user: { id: "user-1", email: "asha@example.com" }, billing: {} } as never;

const CHARGE: Charge = {
  id: CHARGE_ID,
  businessId: BUSINESS,
  kind: "change_hours",
  description: "Extra change hours",
  quantity: 2,
  unitAmountCents: 142_500,
  taxRateBasisPoints: 1800,
  amountCents: 336_300,
  currency: "INR",
  status: "open",
  createdByStaffId: "staff-1",
  provider: null,
  providerOrderId: null,
  paymentId: null,
  paidAt: null,
  waivedAt: null,
  createdAt: NOW,
};

function provider(overrides: Partial<BillingProvider> = {}): BillingProvider {
  return {
    name: "fake",
    startCheckout: vi.fn(),
    confirmCheckout: vi.fn(),
    cancelSubscription: vi.fn(),
    cancelSubscriptionAtPeriodEnd: vi.fn(),
    changeSubscriptionPlanAtPeriodEnd: vi.fn(),
    startChargePayment: vi.fn().mockResolvedValue({ providerOrderId: "fake_order_1", redirectTo: "/billing/charges/confirm?token=t" }),
    confirmChargePayment: vi.fn(),
    createPlan: vi.fn(),
    startAddOnSubscription: vi.fn(),
    confirmAddOnPayment: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBillingProvider).mockReturnValue(provider());
  vi.mocked(setChargeProviderOrder).mockResolvedValue(true);
  vi.mocked(recordChargePaymentWithInvoice).mockResolvedValue({ outcome: "paid", alreadyRecorded: false, payment: {} as never });
});

describe("startCustomerChargePayment", () => {
  it("opens a payment for the charge's own amount and remembers the order before sending the customer on", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValue(CHARGE);
    const fake = provider();
    vi.mocked(getBillingProvider).mockReturnValue(fake);

    await expect(startCustomerChargePayment(CUSTOMER, CHARGE_ID)).resolves.toEqual({
      kind: "redirect",
      url: "/billing/charges/confirm?token=t",
    });
    expect(fake.startChargePayment).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: CHARGE_ID, amountCents: 336_300, currency: "INR", description: "Extra change hours · 2 h" }),
    );
    expect(setChargeProviderOrder).toHaveBeenCalledWith(expect.anything(), {
      chargeId: CHARGE_ID,
      businessId: BUSINESS,
      provider: "fake",
      providerOrderId: "fake_order_1",
    });
  });

  it("hands Razorpay's order to the pay page", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValue(CHARGE);
    vi.mocked(getBillingProvider).mockReturnValue(
      provider({ name: "razorpay", startChargePayment: vi.fn().mockResolvedValue({ providerOrderId: "order_1", redirectTo: null }) }),
    );
    await expect(startCustomerChargePayment(CUSTOMER, CHARGE_ID)).resolves.toMatchObject({ kind: "razorpay", orderId: "order_1" });
  });

  it("finds nothing for another business's charge, and nothing to pay for a settled one", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValueOnce(null);
    await expect(startCustomerChargePayment(CUSTOMER, CHARGE_ID)).resolves.toEqual({ kind: "not-found" });

    vi.mocked(findChargeForBusiness).mockResolvedValueOnce({ ...CHARGE, status: "paid" });
    await expect(startCustomerChargePayment(CUSTOMER, CHARGE_ID)).resolves.toEqual({ kind: "not-open" });
  });

  it("sends nobody to pay a charge settled while the payment was opening", async () => {
    vi.mocked(findChargeForBusiness).mockResolvedValue(CHARGE);
    vi.mocked(setChargeProviderOrder).mockResolvedValue(false);
    await expect(startCustomerChargePayment(CUSTOMER, CHARGE_ID)).resolves.toEqual({ kind: "not-open" });
  });
});

describe("confirmFakeChargePayment", () => {
  const confirmed = {
    providerOrderId: "fake_order_1",
    providerPaymentId: "fake_pay_1",
    businessId: BUSINESS,
    chargeId: CHARGE_ID,
    amountCents: 336_300,
    currency: "INR" as const,
    paidAt: NOW,
    method: null,
  };

  it("records the payment under the business's billing lock", async () => {
    vi.mocked(getBillingProvider).mockReturnValue(provider({ confirmChargePayment: vi.fn().mockResolvedValue(confirmed) }));

    await expect(confirmFakeChargePayment(TENANT, { token: "t" }, NOW)).resolves.toBe("paid");
    expect(lockBusinessForBilling).toHaveBeenCalledWith({ name: "staff-tx" }, BUSINESS);
    expect(recordChargePaymentWithInvoice).toHaveBeenCalledWith(
      { name: "staff-tx" },
      expect.objectContaining({ chargeId: CHARGE_ID, providerPaymentId: "fake_pay_1", amountCents: 336_300, now: NOW }),
    );
    // A paid add-on's provider step runs after the payment's transaction: it is a no-op for any other charge.
    expect(finishAddOnAfterPayment).toHaveBeenCalledWith({ name: "basket-deps" }, { businessId: BUSINESS, chargeId: CHARGE_ID, now: NOW });
  });

  it("refuses a link for another business, and a link that does not verify, recording nothing", async () => {
    vi.mocked(getBillingProvider).mockReturnValue(
      provider({ confirmChargePayment: vi.fn().mockResolvedValue({ ...confirmed, businessId: "0192f3c4-9999-7000-8000-000000000009" }) }),
    );
    await expect(confirmFakeChargePayment(TENANT, { token: "t" }, NOW)).resolves.toBe("invalid");

    vi.mocked(getBillingProvider).mockReturnValue(
      provider({ confirmChargePayment: vi.fn().mockRejectedValue(new CheckoutVerificationError("the signature does not match")) }),
    );
    await expect(confirmFakeChargePayment(TENANT, { token: "t" }, NOW)).resolves.toBe("invalid");
    expect(recordChargePaymentWithInvoice).not.toHaveBeenCalled();
  });
});

describe("recordRazorpayChargePayment", () => {
  const event = {
    orderId: "order_1",
    paymentId: "pay_1",
    amountCents: 336_300,
    currency: "INR" as const,
    paidAt: NOW,
    method: null,
  };

  it("records the payment against the charge the order was opened for", async () => {
    vi.mocked(getBillingProvider).mockReturnValue(provider({ name: "razorpay" }));
    vi.mocked(findChargeByProviderOrder).mockResolvedValue({ ...CHARGE, provider: "razorpay", providerOrderId: "order_1" });

    await recordRazorpayChargePayment(event, NOW);

    expect(findChargeByProviderOrder).toHaveBeenCalledWith(expect.anything(), "razorpay", "order_1");
    expect(recordChargePaymentWithInvoice).toHaveBeenCalledWith(
      { name: "staff-tx" },
      expect.objectContaining({ chargeId: CHARGE_ID, businessId: BUSINESS, provider: "razorpay", providerPaymentId: "pay_1" }),
    );
  });

  it("logs and ignores an order we never opened", async () => {
    vi.mocked(findChargeByProviderOrder).mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await recordRazorpayChargePayment(event, NOW);

    expect(recordChargePaymentWithInvoice).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain("unknown-charge-order");
    warn.mockRestore();
  });
});

describe("openBlogUnlock", () => {
  it("prices the unlock from the plan, tax included", async () => {
    vi.mocked(openBlogPostsCharge).mockResolvedValue(CHARGE);
    const plan = {
      currency: "INR",
      taxRateBasisPoints: 1800,
      extraBlogPostsAmountCents: 47_500,
      blogPostBlockSize: 100,
      extraHourAmountCents: 142_500,
      extraPublishAmountCents: 95_000,
    } as never;

    await openBlogUnlock(TENANT, plan);

    expect(openBlogPostsCharge).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS,
      kind: "blog_posts",
      description: "100 more blog posts",
      quantity: 1,
      unitAmountCents: 47_500,
      taxRateBasisPoints: 1800,
      amountCents: 56_050,
      currency: "INR",
      createdByStaffId: null,
    });
  });
});
