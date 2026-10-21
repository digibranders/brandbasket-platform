import { chargedAmountCents } from "@brandbasket/billing";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findSubscriptionByProviderId: vi.fn(),
    findBundledAddOnsForSubscription: vi.fn(async () => []),
    findPlanById: vi.fn(),
    updateSubscriptionProviderStatus: vi.fn(),
    recordUnappliedPayment: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    completePlanUpgradeAtRenewal: vi.fn(),
    completeBundledAddOnChanges: vi.fn(),
    hasEverPaid: vi.fn(async () => false),
    // Not an add-on, unless a test says otherwise.
    findAddOnSubscriptionByProviderId: vi.fn(async () => null),
    updateAddOnStatus: vi.fn(async () => true),
    recordUnappliedAddOnPayment: vi.fn(),
  };
});
vi.mock("@brandbasket/shared/server/billing-activation", () => ({
  activateRenewalPayment: vi.fn(async () => ({ alreadyRecorded: false })),
  // A client from a setup link, unless a test says otherwise: nothing to open.
  activateFirstPayment: vi.fn(async () => ({ openedMembership: null })),
  activateReactivationPayment: vi.fn(async () => ({ alreadyRecorded: false })),
}));
vi.mock("@brandbasket/shared/server/add-on-activation", () => ({
  applyAddOnPayment: vi.fn(async () => ({ kind: "applied", cancelAtProvider: [] })),
}));
vi.mock("@brandbasket/shared/server/provider-cancellation", () => ({ cancelAtProvider: vi.fn(async () => undefined) }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));
// A transaction that is also its own savepoint: both run the callback straight away.
vi.mock("./db", () => {
  const db = { transaction: (fn: (tx: unknown) => unknown) => fn(db) };
  return { getStaffDb: () => db };
});
const fetchSubscriptionStatus = vi.fn();
const razorpay = { name: "razorpay", fetchSubscriptionStatus };
vi.mock("./billing", () => ({ getRazorpayProvider: () => razorpay }));

import {
  AddOnPaymentConflictError,
  completeBundledAddOnChanges,
  completePlanUpgradeAtRenewal,
  findAddOnSubscriptionByProviderId,
  findBundledAddOnsForSubscription,
  findPlanById,
  findSubscriptionByProviderId,
  hasEverPaid,
  lockBusinessForBilling,
  recordUnappliedAddOnPayment,
  recordUnappliedPayment,
  updateAddOnStatus,
  updateSubscriptionProviderStatus,
} from "@brandbasket/db";
import { applyAddOnPayment } from "@brandbasket/shared/server/add-on-activation";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "@brandbasket/shared/server/billing-activation";
import { recordRazorpayChargePayment } from "./charges";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const PLAN = {
  id: "plan_1",
  currency: "USD",
  recurringAmountCents: 7_500,
  initialAmountCents: 7_500,
  initialTermMonths: 1,
  taxRateBasisPoints: 0,
};

const VISA = {
  method: "card",
  cardNetwork: "Visa",
  cardLast4: "1234",
  cardType: "debit",
  cardIssuer: "HDFC",
  upiVpa: null,
} as const;

describe("handleRazorpayWebhookEvent", () => {
  it("hands a paid order to the charge path and touches no subscription", async () => {
    const event = {
      kind: "order-paid",
      orderId: "order_1",
      paymentId: "pay_1",
      amountCents: 336_300,
      currency: "INR",
      paidAt: new Date("2026-10-02T09:00:00.000Z"),
      method: null,
    } as const;

    await handleRazorpayWebhookEvent(event);

    expect(recordRazorpayChargePayment).toHaveBeenCalledWith(event, expect.any(Date));
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  });

  it("activates a renewal when the subscription already has an activatedAt", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: VISA,
      subscriptionId: "sub_rzp_1",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_1",
        subscriptionId: "sub_row_1",
        commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
        providerPaymentId: "pay_1",
        amountCents: 7_500,
        currency: "USD",
        paidAt: new Date("2026-10-14T12:00:00.000Z"),
        paidThroughAt: new Date("2026-11-01T00:00:00.000Z"),
        method: VISA,
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it("passes the renewal's price, stay offer and Razorpay's cycle start on, for its invoice", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 1_500,
      retentionDiscountCents: 1_500,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      method: VISA,
      subscriptionId: "sub_rzp_1",
      currentStart: new Date("2026-10-14T00:00:00.000Z"),
      currentEnd: new Date("2026-11-14T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_renewal_stay",
      amountCents: 6_000,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodStart: new Date("2026-10-14T00:00:00.000Z"),
        invoicedPrice: { plan: PLAN, bundledAddOns: [], netAmountCents: 7_500, discountAmountCents: 1_500, retentionDiscountCents: 1_500 },
      }),
    );
  });

  it("invoices a renewal at the new plan's price by that plan, and falls back on the payment time without a cycle start", async () => {
    const PREMIUM = { ...PLAN, id: "plan_2", recurringAmountCents: 9_900, initialAmountCents: 9_900 };
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: "plan_2",
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValueOnce(PLAN as never).mockResolvedValueOnce(PREMIUM as never);
    const paidAt = new Date("2026-10-14T12:00:00.000Z");

    await handleRazorpayWebhookEvent({
      kind: "charged",
      method: VISA,
      subscriptionId: "sub_rzp_1",
      currentStart: null,
      currentEnd: new Date("2026-11-14T00:00:00.000Z"),
      paidAt,
      paymentId: "pay_renewal_premium",
      amountCents: 9_900,
      currency: "USD",
    });

    expect(activateRenewalPayment).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodStart: paidAt,
        invoicedPrice: { plan: PREMIUM, bundledAddOns: [], netAmountCents: 9_900, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );
  });

  const CHARGED = {
    kind: "charged",
    currentStart: null,
    method: VISA,
    subscriptionId: "sub_rzp_1",
    currentEnd: new Date("2026-11-09T10:00:00.000Z"),
    paidAt: new Date("2026-10-09T10:00:00.000Z"),
    paymentId: "pay_1",
    amountCents: 7_500,
    currency: "USD",
  } as const;

  it("keeps a charge on a cancelled subscription for staff, and activates nothing", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_old",
      businessId: "biz_1",
      planId: "plan_1",
      status: "cancelled",
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
      commitmentEndsAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent(CHARGED);

    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subscriptionId: "sub_old", providerPaymentId: "pay_1", kind: "renewal", reason: "checkout_replaced" }),
    );
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(activateReactivationPayment).not.toHaveBeenCalled();
  });

  it("records a returning customer's first charge as a reactivation, through Razorpay's own cycle end", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_back",
      businessId: "biz_1",
      planId: "plan_1",
      status: "incomplete",
      activatedAt: null,
      commitmentEndsAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(hasEverPaid).mockResolvedValueOnce(true);

    await handleRazorpayWebhookEvent(CHARGED);

    expect(activateReactivationPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_1",
        subscriptionId: "sub_back",
        plan: PLAN,
        provider: "razorpay",
        providerPaymentId: "pay_1",
        paidAt: CHARGED.paidAt,
        paidThroughAt: CHARGED.currentEnd,
        method: VISA,
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(syncTenantForBusiness).not.toHaveBeenCalled();
  });

  it("judges a reactivation against the monthly price, not the first payment's", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_back",
      businessId: "biz_1",
      planId: "plan_1",
      status: "incomplete",
      activatedAt: null,
      commitmentEndsAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue({ ...PLAN, initialAmountCents: 15_000, initialTermMonths: 2 } as never);
    vi.mocked(hasEverPaid).mockResolvedValueOnce(true);

    await handleRazorpayWebhookEvent(CHARGED);

    expect(activateReactivationPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("does nothing (and does not throw) for an unknown subscription id", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);
    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_unknown",
      currentEnd: new Date(),
      paidAt: new Date(),
      paymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
    });
    expect(activateRenewalPayment).not.toHaveBeenCalled();
  });

  it("syncs status for a status event", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1" } as never);
    fetchSubscriptionStatus.mockResolvedValue("halted");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" });
    expect(updateSubscriptionProviderStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "razorpay", providerSubscriptionId: "sub_rzp_1", status: "inactive", providerStatus: "halted" }),
    );
  });

  it("stores the status Razorpay holds now, not a late event's: a halt delivered after the renewal leaves access alone", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1" } as never);
    fetchSubscriptionStatus.mockResolvedValue("active");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" });
    expect(fetchSubscriptionStatus).toHaveBeenCalledWith("sub_rzp_1");
    expect(updateSubscriptionProviderStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerSubscriptionId: "sub_rzp_1", status: "active", providerStatus: "active" }),
    );
  });

  it("asks Razorpay nothing about a subscription it has never recorded", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_unknown", providerStatus: "halted" });
    expect(fetchSubscriptionStatus).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  });

  it("fails, so Razorpay delivers it again, when the current status cannot be read", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1" } as never);
    fetchSubscriptionStatus.mockRejectedValue(new Error("Razorpay is down"));
    await expect(
      handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" }),
    ).rejects.toThrow("Razorpay is down");
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  });

  it("does nothing for an unhandled event, and does not touch the database", async () => {
    await handleRazorpayWebhookEvent({ kind: "unhandled" });
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  });

  it("logs an invalid event loudly and does not touch the database", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await handleRazorpayWebhookEvent({ kind: "invalid", reason: "subscription.charged payload did not match the expected shape" });
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("confirmation-refused"));
    errorSpy.mockRestore();
  });

  it("activates a first payment when the subscription has no activatedAt yet", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_2",
      businessId: "biz_2",
      planId: "plan_1",
      commitmentEndsAt: null,
      activatedAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_2",
      currentEnd: new Date("2026-11-15T00:00:00.000Z"),
      paidAt: new Date("2026-10-15T00:00:00.000Z"),
      paymentId: "pay_2",
      amountCents: 7_500,
      currency: "USD",
    });

    // This is the assertion that should have caught the "first payment gets an extra free month" bug: it must be
    // called with the event's actual paidAt (the charge time), not currentEnd (the end of the period it paid for).
    // currentEnd and paidAt are deliberately a full month apart above so a regression back to `paidAt: event.currentEnd`
    // would fail this assertion.
    expect(activateFirstPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_2",
        subscriptionId: "sub_row_2",
        plan: PLAN,
        providerPaymentId: "pay_2",
        paidAt: new Date("2026-10-15T00:00:00.000Z"),
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paidAt: new Date("2026-11-15T00:00:00.000Z") }),
    );
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(syncTenantForBusiness).not.toHaveBeenCalled();
  });

  it("gives a free listing account its client tenant when its first charge opens the Premium membership", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_member",
      businessId: "biz_member",
      planId: "plan_1",
      commitmentEndsAt: null,
      activatedAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(activateFirstPayment).mockResolvedValueOnce({ openedMembership: { businessName: "Smile Dental" } } as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_member",
      currentEnd: new Date("2026-11-15T00:00:00.000Z"),
      paidAt: new Date("2026-10-15T00:00:00.000Z"),
      paymentId: "pay_member",
      amountCents: 7_500,
      currency: "USD",
    });

    expect(syncTenantForBusiness).toHaveBeenCalledWith({ businessId: "biz_member", name: "Smile Dental" });
  });

  it("records an unapplied payment and does not activate anything when the amount doesn't match the plan", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_3",
      businessId: "biz_3",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_3",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_3",
      amountCents: 999,
      currency: "USD",
    });

    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_3",
        subscriptionId: "sub_row_3",
        provider: "razorpay",
        providerPaymentId: "pay_3",
        kind: "renewal",
        amountCents: 999,
        currency: "USD",
        reason: "amount_mismatch",
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(activateRenewalPayment).not.toHaveBeenCalled();
  });

  it("decides first-payment-vs-renewal from the post-lock re-read, not the stale pre-lock snapshot (TOCTOU)", async () => {
    // Simulates the race the fix closes: the unlocked read (before the lock is acquired) sees a subscription that
    // has not been activated yet, but by the time the lock is held, a concurrent transaction for the same business
    // (e.g. a redelivered webhook processed just before this one) has already activated it. The post-lock re-read
    // must be what drives the activateFirstPayment-vs-activateRenewalPayment decision, or this would incorrectly
    // treat an already-activated subscription's charge as a first payment.
    vi.mocked(findSubscriptionByProviderId)
      .mockResolvedValueOnce({
        id: "sub_row_4",
        businessId: "biz_4",
        planId: "plan_1",
        commitmentEndsAt: null,
        activatedAt: null, // stale pre-lock snapshot: looks like a first payment
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
      } as never)
      .mockResolvedValueOnce({
        id: "sub_row_4",
        businessId: "biz_4",
        planId: "plan_1",
        commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
        activatedAt: new Date("2026-09-01T00:00:00.000Z"), // post-lock truth: already activated by a concurrent tx
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
      } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

    await handleRazorpayWebhookEvent({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_4",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_4",
      amountCents: 7_500,
      currency: "USD",
    });

    expect(lockBusinessForBilling).toHaveBeenCalledWith(expect.anything(), "biz_4");
    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: "biz_4",
        subscriptionId: "sub_row_4",
        commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });
});

describe("a subscription carrying a referral discount", () => {
  const DISCOUNTED = {
    id: "sub_row_5",
    businessId: "biz_5",
    planId: "plan_1",
    commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    activatedAt: null,
    // 15% of the INR plan's 350,000 paise, frozen when the checkout opened.
    discountAmountCents: 52_500,
    retentionDiscountCents: 0,
    bundledAddOnNetCents: 0,
    pendingBundledAddOnNetCents: null,
  };
  const INR_PLAN = {
    id: "plan_1",
    currency: "INR",
    recurringAmountCents: 350_000,
    initialAmountCents: 350_000,
    taxRateBasisPoints: 0,
    initialTermMonths: 1,
  };

  function chargedAt(amountCents: number) {
    return {
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_5",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_5",
      amountCents,
      currency: "INR",
    } as const;
  }

  it("activates on the discounted amount, not the plan's full price", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(DISCOUNTED as never);
    vi.mocked(findPlanById).mockResolvedValue(INR_PLAN as never);

    await handleRazorpayWebhookEvent(chargedAt(297_500));

    expect(activateFirstPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ businessId: "biz_5", subscriptionId: "sub_row_5", providerPaymentId: "pay_5" }),
    );
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("treats the undiscounted amount as a mismatch, because the offer should have taken it off", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(DISCOUNTED as never);
    vi.mocked(findPlanById).mockResolvedValue(INR_PLAN as never);

    await handleRazorpayWebhookEvent(chargedAt(350_000));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "amount_mismatch", amountCents: 350_000 }),
    );
  });

  it("keeps discounting renewals, because the Razorpay offer runs forever", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      ...DISCOUNTED,
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(INR_PLAN as never);

    await handleRazorpayWebhookEvent(chargedAt(297_500));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 297_500 }),
    );
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });
});

describe("a subscription with add-ons billed in the plan's charge", () => {
  // ₹2,999 plan + ₹1,899.05 Social media (after its package offer) = ₹4,898.05 net, with 18% GST on all of it: ₹5,779.70.
  const BUNDLED = {
    id: "sub_row_6",
    businessId: "biz_6",
    planId: "plan_gst",
    commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    activatedAt: null,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    bundledAddOnNetCents: 189_905,
    pendingBundledAddOnNetCents: null,
  };
  const GST_PLAN = {
    id: "plan_gst",
    currency: "INR",
    initialAmountCents: 299_900,
    recurringAmountCents: 299_900,
    initialTermMonths: 1,
    taxRateBasisPoints: 1_800,
  };
  const BUNDLED_TOTAL = 577_970;

  function chargedAt(amountCents: number) {
    return {
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_6",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_6",
      amountCents,
      currency: "INR",
    } as const;
  }

  it("expects the plan's price plus the add-ons for the first payment, and activates on it", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(BUNDLED as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(chargedAt(BUNDLED_TOTAL));

    expect(activateFirstPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subscriptionId: "sub_row_6" }));
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("keeps the plan alone as a mismatch: the add-ons were part of what was agreed", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(BUNDLED as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(chargedAt(353_882));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
  });

  it("renews at the same combined amount, and invoices each active add-on as a line", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...BUNDLED, activatedAt: new Date("2026-09-01T00:00:00.000Z") } as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
    const addOn = { addOn: "social-media", status: "active", listAmountCents: 199_900, offerDiscountAmountCents: 9_995, netAmountCents: 189_905, taxRateBasisPoints: 1_800 };
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([addOn, { ...addOn, addOn: "advertising", status: "removed" }] as never);

    await handleRazorpayWebhookEvent(chargedAt(BUNDLED_TOTAL));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: BUNDLED_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [addOn] }) }),
    );
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  describe("after the customer asked to remove an add-on", () => {
    // Social media (₹1,899.05) and Paid advertising (₹5,699.05) were billed; Social media is going, so the next renewal is the
    // plan plus Paid advertising: (₹2,999 + ₹5,699.05) with 18% GST.
    const WITH_REMOVAL = { ...BUNDLED, activatedAt: new Date("2026-09-01T00:00:00.000Z"), bundledAddOnNetCents: 189_905 + 569_905, pendingBundledAddOnNetCents: 569_905 };
    const LOWER_TOTAL = chargedAmountCents(299_900 + 569_905, 0, 1_800);
    const OLD_TOTAL = chargedAmountCents(299_900 + 189_905 + 569_905, 0, 1_800);
    const row = (addOn: string, endRequestedAt: Date | null) => ({ addOn, status: "active", endRequestedAt, listAmountCents: 1, offerDiscountAmountCents: 0, netAmountCents: 1, taxRateBasisPoints: 1_800 });

    it("accepts the renewal at the lower amount, invoices only what stays, and finishes the removal", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      const staying = row("advertising", null);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("social-media", new Date("2026-10-02T00:00:00.000Z")), staying] as never);

      await handleRazorpayWebhookEvent(chargedAt(LOWER_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: LOWER_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [staying] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_row_6", now: new Date("2026-10-14T12:00:00.000Z") });
      expect(recordUnappliedPayment).not.toHaveBeenCalled();
    });

    it("still accepts the old amount if the provider had not moved yet, and says so, without finishing the removal", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("social-media", new Date("2026-10-02T00:00:00.000Z")), row("advertising", null)] as never);

      await handleRazorpayWebhookEvent(chargedAt(OLD_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: OLD_TOTAL }));
      expect(completeBundledAddOnChanges).not.toHaveBeenCalled();
    });

    it("refuses an amount that is neither", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

      await handleRazorpayWebhookEvent(chargedAt(LOWER_TOTAL - 1));

      expect(activateRenewalPayment).not.toHaveBeenCalled();
      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
    });
  });

  describe("after the customer added an add-on this month", () => {
    // Digital Growth (₹7,000) was added and its rest-of-month charge paid: the next renewal is (₹2,999 + ₹7,000) with GST.
    const SIGNED_UP = new Date("2026-09-01T00:00:00.000Z");
    const ADDED = { ...BUNDLED, activatedAt: SIGNED_UP, bundledAddOnNetCents: 0, pendingBundledAddOnNetCents: 700_000 };
    const NEW_TOTAL = 1_179_882;
    const OLD_TOTAL = 353_882;
    const row = (addOn: string, netAmountCents: number, billedFrom: Date | null, endRequestedAt: Date | null = null) => ({
      addOn,
      status: "active",
      billedFrom,
      endRequestedAt,
      listAmountCents: netAmountCents,
      offerDiscountAmountCents: 0,
      netAmountCents,
      taxRateBasisPoints: 1_800,
    });

    it("accepts the renewal at the higher amount, invoices the added add-on, and starts billing it", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(ADDED as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      const growth = row("digital-growth", 700_000, null);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([growth] as never);

      await handleRazorpayWebhookEvent(chargedAt(NEW_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: NEW_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [growth] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_row_6", now: new Date("2026-10-14T12:00:00.000Z") });
      expect(recordUnappliedPayment).not.toHaveBeenCalled();
    });

    it("still accepts the old amount if the provider had not moved yet, invoicing only what that amount billed", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(ADDED as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", 700_000, null)] as never);

      await handleRazorpayWebhookEvent(chargedAt(OLD_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: OLD_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [] }) }),
      );
      expect(completeBundledAddOnChanges).not.toHaveBeenCalled();
    });

    it("finishes an add-on added and then taken out in the same month at the plan's own price", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...ADDED, pendingBundledAddOnNetCents: 0 } as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", 700_000, null, new Date("2026-10-10T00:00:00.000Z"))] as never);

      await handleRazorpayWebhookEvent(chargedAt(OLD_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: OLD_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalled();
    });

    it("adds to an add-on taken at sign-up, which keeps its offer price", async () => {
      // Digital Growth at ₹6,650 since sign-up, Local SEO + AEO added at ₹25,000.
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...ADDED, bundledAddOnNetCents: 665_000, pendingBundledAddOnNetCents: 665_000 + 2_500_000 } as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      const growth = row("digital-growth", 665_000, SIGNED_UP);
      const search = row("local-seo-aeo", 2_500_000, null);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([growth, search] as never);

      await handleRazorpayWebhookEvent(chargedAt(4_088_582));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: 4_088_582, invoicedPrice: expect.objectContaining({ bundledAddOns: [growth, search] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalled();
    });
  });
});

describe("a package on the services plan, which costs nothing itself", () => {
  // Migration 0184's rupee plan: the terms at a price of 0, with 18% GST on the lines.
  const SERVICES_PLAN = { id: "plan_services", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, initialTermMonths: 1, taxRateBasisPoints: 1_800 };

  /** All three services at 30% off: ₹26,600 a month before GST. */
  function allThree(activatedAt: Date | null) {
    return {
      id: "sub_row_package",
      businessId: "biz_package",
      planId: "plan_services",
      commitmentEndsAt: new Date("2026-11-21T00:00:00.000Z"),
      activatedAt,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      bundledAddOnNetCents: 2_660_000,
      pendingBundledAddOnNetCents: null,
    };
  }

  function charged(amountCents: number) {
    return {
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_package",
      currentEnd: new Date("2026-12-21T00:00:00.000Z"),
      paidAt: new Date("2026-11-21T09:00:00.000Z"),
      paymentId: "pay_package",
      amountCents,
      currency: "INR",
    } as const;
  }

  it("activates a first payment of the lines' nets with GST on top: ₹31,388", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(allThree(null) as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);

    await handleRazorpayWebhookEvent(charged(3_138_800));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("renews at the same ₹31,388, and treats the lines at list as a mismatch", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(allThree(new Date("2026-10-21T09:00:00.000Z")) as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);

    await handleRazorpayWebhookEvent(charged(3_138_800));
    expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 3_138_800 }));

    vi.mocked(activateRenewalPayment).mockClear();
    // ₹38,000 at list plus GST is what the package price replaced.
    await handleRazorpayWebhookEvent({ ...charged(4_484_000), paymentId: "pay_package_list" });
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
  });
});

describe("a plan with GST on top", () => {
  // ₹2,999 net with 18% GST, as migration 0039 prices it. The Razorpay plan is created at ₹3,538.82.
  const GST_PLAN = {
    id: "plan_gst",
    currency: "INR",
    initialAmountCents: 299_900,
    recurringAmountCents: 299_900,
    initialTermMonths: 1,
    taxRateBasisPoints: 1_800,
  };

  function subscriptionWith(discountAmountCents: number, activatedAt: Date | null) {
    return {
      id: "sub_row_gst",
      businessId: "biz_gst",
      planId: "plan_gst",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt,
      discountAmountCents,
      retentionDiscountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    };
  }

  function charged(amountCents: number) {
    return {
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_gst",
      currentEnd: new Date("2026-11-01T00:00:00.000Z"),
      paidAt: new Date("2026-10-14T12:00:00.000Z"),
      paymentId: "pay_gst",
      amountCents,
      currency: "INR",
    } as const;
  }

  it("activates on the taxed amount Razorpay actually takes", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(0, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(353_882));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("treats the untaxed ₹2,999 as a mismatch, because GST should have been on it", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(0, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(299_900));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "amount_mismatch" }),
    );
  });

  it("takes a referral discount off before the tax: ₹500 off is ₹2,948.82, not ₹3,038.82", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(50_000, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(294_882));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("refuses an offer set up for the bare discount, which would take GST on money never paid", async () => {
    // ₹3,538.82 − a ₹500 offer. The offer should have been ₹590.
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(50_000, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(303_882));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "amount_mismatch" }),
    );
  });

  it("keeps expecting the taxed, discounted amount on every renewal", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
      subscriptionWith(50_000, new Date("2026-09-01T00:00:00.000Z")) as never,
    );
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(294_882));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 294_882 }),
    );
  });

  describe("a customer who paid to move up from Care to Premium", () => {
    const CARE = { id: "plan_care", currency: "INR", recurringAmountCents: 299_900, initialAmountCents: 299_900, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
    const PREMIUM = { id: "plan_premium", currency: "INR", recurringAmountCents: 999_900, initialAmountCents: 999_900, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
    const CARE_AMOUNT = 353_882;
    const PREMIUM_AMOUNT = 1_179_882;

    function subscribeWithMovePending(overrides: Record<string, unknown> = {}): void {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
        id: "sub_row_up",
        businessId: "biz_up",
        planId: "plan_care",
        commitmentEndsAt: new Date("2026-10-30T00:00:00.000Z"),
        activatedAt: new Date("2026-09-30T00:00:00.000Z"),
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        pendingPlanId: "plan_premium",
        pendingDiscountAmountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
        ...overrides,
      } as never);
      vi.mocked(findPlanById).mockImplementation(async (_db, id) => ({ plan_care: CARE, plan_premium: PREMIUM })[id as "plan_care"] as never);
    }

    function renewal(amountCents: number, paymentId: string) {
      return {
        kind: "charged",
        currentStart: null,
        method: null,
        subscriptionId: "sub_rzp_up",
        currentEnd: new Date("2026-11-30T00:00:00.000Z"),
        paidAt: new Date("2026-10-30T00:00:00.000Z"),
        paymentId,
        amountCents,
        currency: "INR",
      } as const;
    }

    it("records the first renewal at Premium's price and switches the subscription to Premium", async () => {
      subscribeWithMovePending();
      await handleRazorpayWebhookEvent(renewal(PREMIUM_AMOUNT, "pay_up_1"));

      expect(recordUnappliedPayment).not.toHaveBeenCalled();
      expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subscriptionId: "sub_row_up", amountCents: PREMIUM_AMOUNT, paidThroughAt: new Date("2026-11-30T00:00:00.000Z") }));
      expect(completePlanUpgradeAtRenewal).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_row_up", now: new Date("2026-10-30T00:00:00.000Z") });
    });

    it("works Premium's price after the discount that carried over", async () => {
      subscribeWithMovePending({ pendingDiscountAmountCents: 50_000 });
      // (₹9,999 − ₹500) + 18% GST.
      await handleRazorpayWebhookEvent(renewal(1_120_882, "pay_up_2"));
      expect(recordUnappliedPayment).not.toHaveBeenCalled();
      expect(completePlanUpgradeAtRenewal).toHaveBeenCalledTimes(1);
    });

    it("does not switch again when the same renewal is delivered twice", async () => {
      subscribeWithMovePending();
      vi.mocked(activateRenewalPayment).mockResolvedValueOnce({ alreadyRecorded: true } as never);
      await handleRazorpayWebhookEvent(renewal(PREMIUM_AMOUNT, "pay_up_1"));
      expect(completePlanUpgradeAtRenewal).not.toHaveBeenCalled();
    });

    it("still takes a renewal at Care's price while the move waits, warns, and leaves the move pending", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      subscribeWithMovePending();
      await handleRazorpayWebhookEvent(renewal(CARE_AMOUNT, "pay_up_3"));

      expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: CARE_AMOUNT }));
      expect(completePlanUpgradeAtRenewal).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("upgrade-renewal-at-old-price"));
      warn.mockRestore();
    });

    it("refuses a renewal at Premium's price from a subscription that never paid to move up", async () => {
      subscribeWithMovePending({ pendingPlanId: null });
      await handleRazorpayWebhookEvent(renewal(PREMIUM_AMOUNT, "pay_up_4"));

      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch", amountCents: PREMIUM_AMOUNT }));
      expect(activateRenewalPayment).not.toHaveBeenCalled();
      expect(completePlanUpgradeAtRenewal).not.toHaveBeenCalled();
    });

    it("refuses an amount that is neither plan's price, and activates nothing", async () => {
      subscribeWithMovePending();
      await handleRazorpayWebhookEvent(renewal(500_000, "pay_up_5"));

      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
      expect(activateRenewalPayment).not.toHaveBeenCalled();
      expect(completePlanUpgradeAtRenewal).not.toHaveBeenCalled();
    });

    it("refuses Premium's price in another currency", async () => {
      subscribeWithMovePending();
      await handleRazorpayWebhookEvent({ ...renewal(PREMIUM_AMOUNT, "pay_up_6"), currency: "USD" });
      expect(recordUnappliedPayment).toHaveBeenCalledTimes(1);
      expect(completePlanUpgradeAtRenewal).not.toHaveBeenCalled();
    });
  });
});

describe("an add-on subscription", () => {
  const PAID_AT = new Date("2026-10-09T10:00:00.000Z");
  const CYCLE_START = new Date("2026-10-09T00:00:00.000Z");
  const CYCLE_END = new Date("2026-11-09T00:00:00.000Z");
  // Rs 3,000 net with 18% GST.
  const ROW = {
    id: "addon_row_1",
    businessId: "biz_addon",
    provider: "razorpay",
    providerSubscriptionId: "sub_rzp_addon",
    status: "incomplete",
    startAt: null,
    haltedAt: null,
    currency: "INR",
    chargedAmountCents: 354_000,
  };
  const CHARGE = {
    kind: "charged",
    subscriptionId: "sub_rzp_addon",
    currentStart: CYCLE_START,
    currentEnd: CYCLE_END,
    paidAt: PAID_AT,
    paymentId: "pay_addon_1",
    amountCents: 354_000,
    currency: "INR",
    method: VISA,
  } as const;

  // Earlier tests leave their answers behind: start each of these from "not an add-on, nothing known".
  beforeEach(() => {
    vi.mocked(findAddOnSubscriptionByProviderId).mockResolvedValue(null);
    vi.mocked(updateAddOnStatus).mockResolvedValue(true);
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);
    fetchSubscriptionStatus.mockReset();
  });

  function isAddOn(overrides: Record<string, unknown> = {}): void {
    vi.mocked(findAddOnSubscriptionByProviderId).mockResolvedValue({ ...ROW, ...overrides } as never);
  }

  function expectNothingOnThePlanPath(): void {
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(activateReactivationPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
    expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
  }

  describe("a charge", () => {
    it("locks the business, re-reads the row, and records the payment for Razorpay's billing cycle", async () => {
      isAddOn();

      await handleRazorpayWebhookEvent(CHARGE);

      expect(lockBusinessForBilling).toHaveBeenCalledWith(expect.anything(), "biz_addon");
      expect(findAddOnSubscriptionByProviderId).toHaveBeenCalledTimes(2);
      expect(applyAddOnPayment).toHaveBeenCalledWith(
        expect.anything(),
        {
          addOnSubscriptionId: "addon_row_1",
          provider: "razorpay",
          providerPaymentId: "pay_addon_1",
          amountCents: 354_000,
          currency: "INR",
          paidAt: PAID_AT,
          periodStart: CYCLE_START,
          periodEnd: CYCLE_END,
          method: VISA,
        },
        expect.any(Date),
      );
      expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
      expectNothingOnThePlanPath();
    });

    it("starts the period at the payment time when Razorpay sent no cycle start", async () => {
      isAddOn();

      await handleRazorpayWebhookEvent({ ...CHARGE, currentStart: null });

      expect(applyAddOnPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ periodStart: PAID_AT, periodEnd: CYCLE_END }), expect.any(Date));
    });

    it("decides from the row read under the lock, not the one read before it", async () => {
      vi.mocked(findAddOnSubscriptionByProviderId)
        .mockResolvedValueOnce({ ...ROW } as never)
        .mockResolvedValueOnce({ ...ROW, chargedAmountCents: 400_000 } as never);

      await handleRazorpayWebhookEvent(CHARGE);

      expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
      expect(applyAddOnPayment).not.toHaveBeenCalled();
    });

    it("fails, so Razorpay delivers it again, if the row has gone between the two reads", async () => {
      vi.mocked(findAddOnSubscriptionByProviderId).mockResolvedValueOnce({ ...ROW } as never).mockResolvedValueOnce(null);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(handleRazorpayWebhookEvent(CHARGE)).rejects.toThrow("disappeared");

      expect(applyAddOnPayment).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("webhook-processing-failed"));
      errorSpy.mockRestore();
    });

    it("keeps a charge of the wrong amount for staff and opens nothing", async () => {
      isAddOn();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await handleRazorpayWebhookEvent({ ...CHARGE, amountCents: 300_000 });

      expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          addOnSubscriptionId: "addon_row_1",
          providerPaymentId: "pay_addon_1",
          amountCents: 300_000,
          reason: "amount_mismatch",
        }),
      );
      expect(applyAddOnPayment).not.toHaveBeenCalled();
      expect(cancelAtProvider).not.toHaveBeenCalled();
    });

    it("keeps a charge in the wrong currency for staff and opens nothing", async () => {
      isAddOn();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await handleRazorpayWebhookEvent({ ...CHARGE, currency: "USD" });

      expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ currency: "USD", reason: "amount_mismatch" }));
      expect(applyAddOnPayment).not.toHaveBeenCalled();
    });

    it("cancels the subscription of a checkout that was replaced when a charge still arrives on it, after the commit", async () => {
      isAddOn({ status: "cancelled" });
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({
        kind: "refused",
        reason: "checkout_replaced",
        cancelAtProvider: [{ provider: "razorpay", providerSubscriptionId: "sub_rzp_addon" }],
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await handleRazorpayWebhookEvent(CHARGE);

      expect(cancelAtProvider).toHaveBeenCalledTimes(1);
      expect(cancelAtProvider).toHaveBeenCalledWith(razorpay, {
        businessId: "biz_addon",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: "sub_rzp_addon",
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("checkout_replaced"));
      expectNothingOnThePlanPath();
      warn.mockRestore();
    });

    it("a Pay now charge refused as already_paid cancels its own Razorpay subscription after commit", async () => {
      isAddOn({ status: "incomplete" });
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({
        kind: "refused",
        reason: "already_paid",
        cancelAtProvider: [{ provider: "razorpay", providerSubscriptionId: "sub_rzp_addon" }],
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await handleRazorpayWebhookEvent(CHARGE);

      expect(cancelAtProvider).toHaveBeenCalledTimes(1);
      expect(cancelAtProvider).toHaveBeenCalledWith(razorpay, expect.objectContaining({ providerSubscriptionId: "sub_rzp_addon" }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("already_paid"));
      warn.mockRestore();
    });

    it("cancels nothing at the provider when the refusal itself failed to commit", async () => {
      isAddOn();
      vi.mocked(applyAddOnPayment).mockImplementationOnce(async () => {
        throw new Error("unapplied write failed");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(handleRazorpayWebhookEvent(CHARGE)).rejects.toThrow("unapplied write failed");

      expect(cancelAtProvider).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("lets a payment id that belongs to something else throw, to be investigated", async () => {
      isAddOn();
      vi.mocked(applyAddOnPayment).mockRejectedValueOnce(new AddOnPaymentConflictError("razorpay", "pay_addon_1", "addon_row_1"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(handleRazorpayWebhookEvent(CHARGE)).rejects.toBeInstanceOf(AddOnPaymentConflictError);

      expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("webhook-processing-failed"));
      errorSpy.mockRestore();
    });

    it("lets any other failure throw, so Razorpay delivers it again", async () => {
      isAddOn();
      vi.mocked(applyAddOnPayment).mockRejectedValueOnce(new Error("connection reset"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(handleRazorpayWebhookEvent(CHARGE)).rejects.toThrow("connection reset");

      expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("accepts a charge on a halted row long after the grace, and the add-on runs again", async () => {
      isAddOn({ status: "halted", haltedAt: new Date("2026-08-01T00:00:00.000Z") });

      await handleRazorpayWebhookEvent(CHARGE);

      expect(applyAddOnPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ providerPaymentId: "pay_addon_1" }), expect.any(Date));
      expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
    });

    it("cancels the halted rows the payment closed at the provider, once the transaction has committed", async () => {
      isAddOn({ status: "halted" });
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({
        kind: "applied",
        cancelAtProvider: [
          { provider: "razorpay", providerSubscriptionId: "sub_rzp_old_1" },
          { provider: "razorpay", providerSubscriptionId: "sub_rzp_old_2" },
        ],
      });

      await handleRazorpayWebhookEvent(CHARGE);

      expect(cancelAtProvider).toHaveBeenCalledTimes(2);
      expect(cancelAtProvider).toHaveBeenCalledWith(razorpay, {
        businessId: "biz_addon",
        subscriptionId: null,
        provider: "razorpay",
        providerSubscriptionId: "sub_rzp_old_1",
      });
      expect(cancelAtProvider).toHaveBeenCalledWith(razorpay, expect.objectContaining({ providerSubscriptionId: "sub_rzp_old_2" }));
    });

    it("does not cancel anything at the provider when the transaction fails", async () => {
      isAddOn({ status: "halted" });
      vi.mocked(applyAddOnPayment).mockImplementationOnce(async () => {
        throw new Error("invoice write failed");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(handleRazorpayWebhookEvent(CHARGE)).rejects.toThrow("invoice write failed");

      expect(cancelAtProvider).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("writes nothing a second time when the same delivery arrives again", async () => {
      isAddOn();
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({ kind: "already-recorded", cancelAtProvider: [] });

      await expect(handleRazorpayWebhookEvent(CHARGE)).resolves.toBeUndefined();

      expect(cancelAtProvider).not.toHaveBeenCalled();
      expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
      expect(syncTenantForBusiness).not.toHaveBeenCalled();
    });

    it("is logged as unknown and ignored when the id is in neither table", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);

      await handleRazorpayWebhookEvent(CHARGE);

      expect(findAddOnSubscriptionByProviderId).toHaveBeenCalledWith(expect.anything(), "razorpay", "sub_rzp_addon");
      expect(findSubscriptionByProviderId).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown-subscription"));
      expect(applyAddOnPayment).not.toHaveBeenCalled();
      expect(activateRenewalPayment).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("a status event", () => {
    const EVENT = { kind: "status", subscriptionId: "sub_rzp_addon", providerStatus: "halted" } as const;

    it("asks Razorpay for the current status, applies it, and leaves the main plan alone", async () => {
      isAddOn({ status: "active" });
      fetchSubscriptionStatus.mockResolvedValue("halted");

      await handleRazorpayWebhookEvent(EVENT);

      expect(fetchSubscriptionStatus).toHaveBeenCalledWith("sub_rzp_addon");
      expect(updateAddOnStatus).toHaveBeenCalledWith(expect.anything(), {
        id: "addon_row_1",
        status: "halted",
        providerStatus: "halted",
        haltedAt: expect.any(Date),
        now: expect.any(Date),
        expectedFrom: "active",
      });
      expectNothingOnThePlanPath();
    });

    it("stores what Razorpay holds now, not a late event's: a halt delivered after the renewal changes nothing", async () => {
      isAddOn({ status: "active" });
      fetchSubscriptionStatus.mockResolvedValue("active");

      await handleRazorpayWebhookEvent(EVENT);

      expect(updateAddOnStatus).not.toHaveBeenCalled();
    });

    it("schedules a kept add-on once Razorpay has authenticated it", async () => {
      const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      isAddOn({ status: "incomplete", startAt });
      fetchSubscriptionStatus.mockResolvedValue("authenticated");

      await handleRazorpayWebhookEvent({ ...EVENT, providerStatus: "authenticated" });

      expect(updateAddOnStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "scheduled", providerStatus: "authenticated", expectedFrom: "incomplete" }),
      );
    });

    it("moves a kept add-on whose first charge is being retried to past_due, and records no halt time", async () => {
      isAddOn({ status: "scheduled", startAt: new Date("2026-11-01T00:00:00.000Z") });
      fetchSubscriptionStatus.mockResolvedValue("pending");

      await handleRazorpayWebhookEvent({ ...EVENT, providerStatus: "pending" });

      expect(updateAddOnStatus).toHaveBeenCalledWith(expect.anything(), {
        id: "addon_row_1",
        status: "past_due",
        providerStatus: "pending",
        now: expect.any(Date),
        expectedFrom: "scheduled",
      });
    });

    it("halts a kept add-on whose first charge failed for good, and writes when the 7 days to pay began", async () => {
      isAddOn({ status: "scheduled", startAt: new Date("2026-11-01T00:00:00.000Z") });
      fetchSubscriptionStatus.mockResolvedValue("halted");

      await handleRazorpayWebhookEvent(EVENT);

      expect(updateAddOnStatus).toHaveBeenCalledWith(expect.anything(), {
        id: "addon_row_1",
        status: "halted",
        providerStatus: "halted",
        haltedAt: expect.any(Date),
        now: expect.any(Date),
        expectedFrom: "scheduled",
      });
    });

    it("halts a kept add-on that was past_due, from the row it was read in", async () => {
      isAddOn({ status: "past_due", startAt: new Date("2026-11-01T00:00:00.000Z") });
      fetchSubscriptionStatus.mockResolvedValue("halted");

      await handleRazorpayWebhookEvent(EVENT);

      expect(updateAddOnStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "halted", haltedAt: expect.any(Date), expectedFrom: "past_due" }));
    });

    it("ends the row when Razorpay says it is over", async () => {
      isAddOn({ status: "active" });
      fetchSubscriptionStatus.mockResolvedValue("completed");

      await handleRazorpayWebhookEvent({ ...EVENT, providerStatus: "completed" });

      expect(updateAddOnStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "cancelled", providerStatus: "completed", endedAt: expect.any(Date), expectedFrom: "active" }),
      );
    });

    it("treats a lost race as nothing to do", async () => {
      isAddOn({ status: "active" });
      fetchSubscriptionStatus.mockResolvedValue("halted");
      vi.mocked(updateAddOnStatus).mockResolvedValueOnce(false);

      await expect(handleRazorpayWebhookEvent(EVENT)).resolves.toBeUndefined();
    });

    it("fails, so Razorpay delivers it again, when the current status cannot be read", async () => {
      isAddOn({ status: "active" });
      fetchSubscriptionStatus.mockRejectedValue(new Error("Razorpay is down"));

      await expect(handleRazorpayWebhookEvent(EVENT)).rejects.toThrow("Razorpay is down");

      expect(updateAddOnStatus).not.toHaveBeenCalled();
    });

    it("is logged as unknown and ignored when the id is in neither table", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);

      await handleRazorpayWebhookEvent(EVENT);

      expect(findAddOnSubscriptionByProviderId).toHaveBeenCalledWith(expect.anything(), "razorpay", "sub_rzp_addon");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown-subscription"));
      expect(fetchSubscriptionStatus).not.toHaveBeenCalled();
      expect(updateAddOnStatus).not.toHaveBeenCalled();
      expect(updateSubscriptionProviderStatus).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it("leaves a paid press release alone: order.paid goes to the charge path", async () => {
    const event = {
      kind: "order-paid",
      orderId: "order_press",
      paymentId: "pay_press",
      amountCents: 354_000,
      currency: "INR",
      paidAt: PAID_AT,
      method: null,
    } as const;

    await handleRazorpayWebhookEvent(event);

    expect(recordRazorpayChargePayment).toHaveBeenCalledWith(event, expect.any(Date));
    expect(findAddOnSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(applyAddOnPayment).not.toHaveBeenCalled();
  });
});
