import { chargedAmountCents } from "@brandbasket/billing";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findSubscriptionByProviderId: vi.fn(),
    findBundledAddOnsForSubscription: vi.fn(async () => []),
    activateBundledAddOns: vi.fn(async () => []),
    removeBundledAddOnsOf: vi.fn(),
    flagPaymentForAttention: vi.fn(),
    findPlanById: vi.fn(),
    updateSubscriptionProviderStatus: vi.fn(),
    recordUnappliedPayment: vi.fn(async () => ({ alreadyRecorded: false, payment: { id: "pay_unapplied" } })),
    lockBusinessForBilling: vi.fn(),
    completePlanUpgradeAtRenewal: vi.fn(),
    completeBundledAddOnChanges: vi.fn(),
    hasEverPaid: vi.fn(async () => false),
    // Not an add-on, unless a test says otherwise.
    findAddOnSubscriptionByProviderId: vi.fn(async () => null),
    updateAddOnStatus: vi.fn(async () => true),
    recordUnappliedAddOnPayment: vi.fn(async () => ({ alreadyRecorded: false, payment: { id: "pay_addon_unapplied" } })),
  };
});
vi.mock("@brandbasket/shared/server/billing-activation", () => ({
  activateRenewalPayment: vi.fn(async () => ({ alreadyRecorded: false, payment: { id: "pay_row_1" }, discountEnded: false })),
  // A client from a setup link, unless a test says otherwise: nothing to open.
  activateFirstPayment: vi.fn(async () => ({ alreadyRecorded: false, payment: { id: "pay_row_first" }, openedMembership: null, discountEnded: false })),
  activateReactivationPayment: vi.fn(async () => ({ alreadyRecorded: false, payment: { id: "pay_row_reactivation" }, discountEnded: false })),
}));
vi.mock("@brandbasket/shared/server/add-on-activation", () => ({
  applyAddOnPayment: vi.fn(async () => ({ kind: "applied", paymentId: "pay_row_addon", cancelAtProvider: [] })),
}));
vi.mock("@brandbasket/shared/server/provider-cancellation", () => ({ cancelAtProvider: vi.fn(async () => undefined) }));
vi.mock("@brandbasket/shared/server/basket-change", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/shared/server/basket-change")>()),
  moveProviderAfterDiscountEnds: vi.fn(async () => ({ kind: "scheduled" })),
}));
vi.mock("./add-ons", () => ({ basketDeps: vi.fn(() => ({ deps: true })) }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./keep-plan", () => ({ restoreKeptPlan: vi.fn(async () => true) }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));
vi.mock("./payment-failure", () => ({ recordRazorpayPaymentFailure: vi.fn() }));
vi.mock("./teams", () => ({ announcePaymentToTeams: vi.fn(async () => undefined), announcePlanStatusToTeams: vi.fn(async () => undefined) }));
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
  activateBundledAddOns,
  completeBundledAddOnChanges,
  completePlanUpgradeAtRenewal,
  findAddOnSubscriptionByProviderId,
  findBundledAddOnsForSubscription,
  findPlanById,
  findSubscriptionByProviderId,
  flagPaymentForAttention,
  hasEverPaid,
  lockBusinessForBilling,
  recordUnappliedAddOnPayment,
  recordUnappliedPayment,
  removeBundledAddOnsOf,
  updateAddOnStatus,
  updateSubscriptionProviderStatus,
} from "@brandbasket/db";
import { applyAddOnPayment } from "@brandbasket/shared/server/add-on-activation";
import { moveProviderAfterDiscountEnds } from "@brandbasket/shared/server/basket-change";
import { cancelAtProvider } from "@brandbasket/shared/server/provider-cancellation";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "@brandbasket/shared/server/billing-activation";
import { recordRazorpayChargePayment } from "./charges";
import { recordRazorpayPaymentFailure } from "./payment-failure";
import { restoreKeptPlan } from "./keep-plan";
import { announcePaymentToTeams, announcePlanStatusToTeams } from "./teams";
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

  it("hands a failed payment to the failure path and touches no subscription", async () => {
    const event = {
      kind: "payment-failed",
      paymentId: "pay_failed_1",
      amountCents: 299_900,
      currency: "INR",
      failedAt: new Date("2026-11-28T04:30:00.000Z"),
      orderId: null,
      businessId: null,
      failureReason: "Payment was declined by the bank",
    } as const;

    await handleRazorpayWebhookEvent(event);

    expect(recordRazorpayPaymentFailure).toHaveBeenCalledWith(event);
    expect(findSubscriptionByProviderId).not.toHaveBeenCalled();
    expect(activateRenewalPayment).not.toHaveBeenCalled();
  });

  it("activates a renewal when the subscription already has an activatedAt", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_row_1",
      businessId: "biz_1",
      planId: "plan_1",
      commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
      activatedAt: new Date("2026-09-01T00:00:00.000Z"),
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
      continuesId: null,
      discountAmountCents: 1_500,
      retentionDiscountCents: 1_500,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: "plan_2",
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
      continuesId: null,
      commitmentEndsAt: new Date("2026-09-01T00:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
      continuesId: null,
      commitmentEndsAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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

  describe("a plan kept after the client's own cancel", () => {
    const KEPT = {
      id: "sub_kept",
      businessId: "biz_1",
      planId: "plan_1",
      status: "active",
      activatedAt: null,
      continuesId: "sub_old",
      commitmentEndsAt: new Date("2026-12-09T10:00:00.000Z"),
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
    } as never;

    it("records its first charge as a renewal of the old plan, never a first payment or a reactivation, with the old commitment", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(KEPT);
      vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

      await handleRazorpayWebhookEvent(CHARGED);

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subscriptionId: "sub_kept",
          commitmentEndsAt: new Date("2026-12-09T10:00:00.000Z"),
          paidThroughAt: CHARGED.currentEnd,
          amountCents: 7_500,
        }),
      );
      expect(activateReactivationPayment).not.toHaveBeenCalled();
      expect(activateFirstPayment).not.toHaveBeenCalled();
      expect(restoreKeptPlan).toHaveBeenCalledWith(expect.anything(), "sub_kept", CHARGED.paidAt);
      expect(activateBundledAddOns).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_kept", now: CHARGED.paidAt });
      expect(removeBundledAddOnsOf).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_old", now: CHARGED.paidAt });
    });

    it("keeps a charge at another amount for staff and starts nothing", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(KEPT);
      vi.mocked(findPlanById).mockResolvedValue(PLAN as never);

      await handleRazorpayWebhookEvent({ ...CHARGED, amountCents: 7_400 });

      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
      expect(activateRenewalPayment).not.toHaveBeenCalled();
      expect(restoreKeptPlan).not.toHaveBeenCalled();
    });

    it("lifts the closure when Razorpay reports the new mandate authenticated, and not for any other subscription", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(KEPT);
      fetchSubscriptionStatus.mockResolvedValue("authenticated");
      await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "authenticated" });
      expect(restoreKeptPlan).toHaveBeenCalledWith(expect.anything(), "sub_kept", expect.any(Date));

      vi.mocked(restoreKeptPlan).mockClear();
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null } as never);
      await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "authenticated" });
      expect(restoreKeptPlan).not.toHaveBeenCalled();
    });

    it("waits for the mandate to be authorised: a failed or pending status lifts nothing", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(KEPT);
      fetchSubscriptionStatus.mockResolvedValue("halted");
      await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" });
      expect(restoreKeptPlan).not.toHaveBeenCalled();
    });
  });

  it("judges a reactivation against the monthly price, not the first payment's", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
      id: "sub_back",
      businessId: "biz_1",
      planId: "plan_1",
      status: "incomplete",
      activatedAt: null,
      continuesId: null,
      commitmentEndsAt: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue({ ...PLAN, initialAmountCents: 15_000, initialTermMonths: 2 } as never);
    vi.mocked(hasEverPaid).mockResolvedValueOnce(true);

    await handleRazorpayWebhookEvent(CHARGED);

    expect(activateReactivationPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  describe("a reactivation of a package", () => {
    /** The services plan of migration 0184, in rupees: the lines are the whole price, 18% GST inside it. */
    const SERVICES_INR = { ...PLAN, currency: "INR", recurringAmountCents: 0, initialAmountCents: 0, taxRateBasisPoints: 1_800 };
    const ALL_THREE_NET_CENTS = 3_039_800;
    const reopenedAllThree = () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
        id: "sub_back",
        businessId: "biz_1",
        planId: "plan_1",
        status: "incomplete",
        activatedAt: null,
        continuesId: null,
        commitmentEndsAt: null,
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        pendingPlanId: null,
        pendingDiscountAmountCents: 0,
        bundledAddOnNetCents: ALL_THREE_NET_CENTS,
        pendingBundledAddOnNetCents: null,
        nextDiscountAmountCents: null,
        discountMonthsLeft: null,
      } as never);
      vi.mocked(findPlanById).mockResolvedValue(SERVICES_INR as never);
      vi.mocked(hasEverPaid).mockResolvedValueOnce(true);
    };

    it("accepts the package price the checkout was opened at, 20% off every line, GST included", async () => {
      reopenedAllThree();

      await handleRazorpayWebhookEvent({ ...CHARGED, currency: "INR", amountCents: 3_039_800 });

      expect(recordUnappliedPayment).not.toHaveBeenCalled();
      expect(activateReactivationPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ subscriptionId: "sub_back", plan: SERVICES_INR }));
    });

    it("sets aside a charge at the website's price: the basket was not the website alone", async () => {
      reopenedAllThree();

      await handleRazorpayWebhookEvent({ ...CHARGED, currency: "INR", amountCents: 299_900 });

      expect(activateReactivationPayment).not.toHaveBeenCalled();
      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
    });
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
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null } as never);
    fetchSubscriptionStatus.mockResolvedValue("halted");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "halted" });
    expect(updateSubscriptionProviderStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "razorpay", providerSubscriptionId: "sub_rzp_1", status: "inactive", providerStatus: "halted" }),
    );
  });

  it("tells Teams once when a running plan ends", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null, status: "active" } as never);
    fetchSubscriptionStatus.mockResolvedValue("cancelled");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "cancelled" });
    expect(announcePlanStatusToTeams).toHaveBeenCalledExactlyOnceWith({ businessId: "biz-1", subscriptionId: "sub-1", status: "cancelled", providerStatus: "cancelled" });
  });

  it.each([
    ["pending", "active"],
    ["halted", "active"],
  ])("never tells Teams about a payment that failed: a plan turning %s", async (providerStatus, was) => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null, status: was } as never);
    fetchSubscriptionStatus.mockResolvedValue(providerStatus);
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus });
    expect(announcePlanStatusToTeams).not.toHaveBeenCalled();
  });

  it("stays quiet when the plan had already ended, or came back", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null, status: "cancelled" } as never);
    fetchSubscriptionStatus.mockResolvedValue("cancelled");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "cancelled" });
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null, status: "past_due" } as never);
    fetchSubscriptionStatus.mockResolvedValue("active");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: "sub_rzp_1", providerStatus: "active" });
    expect(announcePlanStatusToTeams).not.toHaveBeenCalled();
  });

  it("stores the status Razorpay holds now, not a late event's: a halt delivered after the renewal leaves access alone", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null } as never);
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
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ id: "sub-1", businessId: "biz-1", continuesId: null } as never);
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
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
    } as never);
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
    vi.mocked(activateFirstPayment).mockResolvedValueOnce({ alreadyRecorded: false, payment: { id: "pay_row_member" }, openedMembership: { businessName: "Smile Dental" } } as never);

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
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      pendingPlanId: null,
      pendingDiscountAmountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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
        continuesId: null,
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
        nextDiscountAmountCents: null,
        discountMonthsLeft: null,
      } as never)
      .mockResolvedValueOnce({
        id: "sub_row_4",
        businessId: "biz_4",
        planId: "plan_1",
        commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
        activatedAt: new Date("2026-09-01T00:00:00.000Z"), // post-lock truth: already activated by a concurrent tx
        continuesId: null,
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
        nextDiscountAmountCents: null,
        discountMonthsLeft: null,
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
    continuesId: null,
    // 15% of the INR plan's 350,000 paise, frozen when the checkout opened.
    discountAmountCents: 52_500,
    retentionDiscountCents: 0,
    bundledAddOnNetCents: 0,
    pendingBundledAddOnNetCents: null,
    nextDiscountAmountCents: null,
    discountMonthsLeft: null,
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
      continuesId: null,
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
  // ₹2,999 plan + ₹1,899.05 Social media (after its package offer) = ₹4,898.05, GST included.
  const BUNDLED = {
    id: "sub_row_6",
    businessId: "biz_6",
    planId: "plan_gst",
    commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    activatedAt: null,
    continuesId: null,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    bundledAddOnNetCents: 189_905,
    pendingBundledAddOnNetCents: null,
    nextDiscountAmountCents: null,
    discountMonthsLeft: null,
  };
  const GST_PLAN = {
    id: "plan_gst",
    currency: "INR",
    initialAmountCents: 299_900,
    recurringAmountCents: 299_900,
    initialTermMonths: 1,
    taxRateBasisPoints: 1_800,
  };
  const BUNDLED_TOTAL = 489_805;

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

    await handleRazorpayWebhookEvent(chargedAt(299_900));

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
    // plan plus Paid advertising: ₹2,999 + ₹5,699.05, GST included.
    const WITH_REMOVAL = { ...BUNDLED, activatedAt: new Date("2026-09-01T00:00:00.000Z"), bundledAddOnNetCents: 189_905 + 569_905, pendingBundledAddOnNetCents: 569_905 };
    const LOWER_TOTAL = 869_805;
    const OLD_TOTAL = 1_059_710;
    const row = (addOn: string, endRequestedAt: Date | null) => ({ addOn, status: "active", endRequestedAt, listAmountCents: 1, offerDiscountAmountCents: 0, pendingOfferDiscountAmountCents: null, netAmountCents: 1, taxRateBasisPoints: 1_800 });

    it("accepts the renewal at the lower amount, invoices only what stays, and finishes the removal", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      const staying = row("local-seo-aeo", null);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", new Date("2026-10-02T00:00:00.000Z")), staying] as never);

      await handleRazorpayWebhookEvent(chargedAt(LOWER_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: LOWER_TOTAL, invoicedPrice: expect.objectContaining({ bundledAddOns: [staying] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalledWith(expect.anything(), { subscriptionId: "sub_row_6", now: new Date("2026-10-14T12:00:00.000Z") });
      expect(recordUnappliedPayment).not.toHaveBeenCalled();
    });

    it("still accepts the old amount if the provider had not moved yet, flags the payment for staff, without finishing the removal", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", new Date("2026-10-02T00:00:00.000Z")), row("local-seo-aeo", null)] as never);

      await handleRazorpayWebhookEvent(chargedAt(OLD_TOTAL));

      expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: OLD_TOTAL }));
      expect(completeBundledAddOnChanges).not.toHaveBeenCalled();
      expect(flagPaymentForAttention).toHaveBeenCalledWith(expect.anything(), {
        paymentId: "pay_row_1",
        businessId: "biz_6",
        reason: "add_on_provider_pending",
        now: new Date("2026-10-14T12:00:00.000Z"),
      });
    });

    it("refuses an amount that is neither", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(WITH_REMOVAL as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", new Date("2026-10-02T00:00:00.000Z")), row("local-seo-aeo", null)] as never);

      await handleRazorpayWebhookEvent(chargedAt(LOWER_TOTAL - 1));

      expect(activateRenewalPayment).not.toHaveBeenCalled();
      expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
    });
  });

  describe("after the customer added an add-on this month", () => {
    // Social Media and Ads, at a fixture price of ₹7,000, was added and its rest-of-month charge paid: the next renewal is ₹2,999 + ₹7,000, GST included.
    const SIGNED_UP = new Date("2026-09-01T00:00:00.000Z");
    const ADDED = { ...BUNDLED, activatedAt: SIGNED_UP, bundledAddOnNetCents: 0, pendingBundledAddOnNetCents: 700_000 };
    const NEW_TOTAL = 999_900;
    const OLD_TOTAL = 299_900;
    const row = (addOn: string, netAmountCents: number, billedFrom: Date | null, endRequestedAt: Date | null = null) => ({
      addOn,
      status: "active",
      billedFrom,
      endRequestedAt,
      listAmountCents: netAmountCents,
      offerDiscountAmountCents: 0,
      pendingOfferDiscountAmountCents: null,
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
      expect(flagPaymentForAttention).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentId: "pay_row_1", reason: "add_on_provider_pending" }));
    });

    it("flags nothing when the renewal arrives at the new amount", async () => {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(ADDED as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([row("digital-growth", 700_000, null)] as never);

      await handleRazorpayWebhookEvent(chargedAt(NEW_TOTAL));

      expect(flagPaymentForAttention).not.toHaveBeenCalled();
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
      // Social Media and Ads at ₹6,650 since sign-up, Local SEO + AEO added at ₹24,999.
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...ADDED, bundledAddOnNetCents: 665_000, pendingBundledAddOnNetCents: 665_000 + 2_499_900 } as never);
      vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);
      const growth = row("digital-growth", 665_000, SIGNED_UP);
      const search = row("local-seo-aeo", 2_499_900, null);
      vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([growth, search] as never);

      await handleRazorpayWebhookEvent(chargedAt(3_464_800));

      expect(activateRenewalPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amountCents: 3_464_800, invoicedPrice: expect.objectContaining({ bundledAddOns: [growth, search] }) }),
      );
      expect(completeBundledAddOnChanges).toHaveBeenCalled();
    });
  });
});

describe("a code with a length in months", () => {
  // The services plan costs nothing; one service at ₹10,000 a month with ₹1,000 off from the code, GST included.
  const SERVICES_PLAN = { id: "plan_services", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
  const PAID_AT = new Date("2026-10-14T12:00:00.000Z");
  const DISCOUNTED_TOTAL = 900_000;
  const LIST_TOTAL = 1_000_000;
  const held = (overrides: Record<string, unknown> = {}) => ({
    id: "sub_row_months",
    businessId: "biz_months",
    planId: "plan_services",
    commitmentEndsAt: new Date("2026-11-01T00:00:00.000Z"),
    activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    continuesId: null,
    referralCodeId: "0192f3c4-9999-7000-8000-000000000001",
    discountAmountCents: 100_000,
    retentionDiscountCents: 0,
    discountMonthsLeft: 1,
    nextDiscountAmountCents: null,
    pendingPlanId: null,
    pendingDiscountAmountCents: 0,
    bundledAddOnNetCents: 1_000_000,
    pendingBundledAddOnNetCents: null,
    ...overrides,
  });
  const charged = (amountCents: number) => ({
    kind: "charged",
    currentStart: null,
    method: null,
    subscriptionId: "sub_rzp_months",
    currentEnd: new Date("2026-11-14T12:00:00.000Z"),
    paidAt: PAID_AT,
    paymentId: "pay_months",
    amountCents,
    currency: "INR",
  }) as const;

  beforeEach(() => {
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([]);
  });

  it("takes the last discounted month at the discounted amount, then moves the provider once it is recorded", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held() as never);
    vi.mocked(activateRenewalPayment).mockResolvedValueOnce({ alreadyRecorded: false, payment: { id: "pay_row_1" }, discountEnded: true } as never);

    await handleRazorpayWebhookEvent(charged(DISCOUNTED_TOTAL));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: DISCOUNTED_TOTAL, atNewDiscount: false, invoicedPrice: expect.objectContaining({ discountAmountCents: 100_000 }) }),
    );
    expect(moveProviderAfterDiscountEnds).toHaveBeenCalledWith({ deps: true }, "sub_row_months", expect.any(Date));
    expect(flagPaymentForAttention).not.toHaveBeenCalled();
  });

  it("moves nothing while the discount still has months to run", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held({ discountMonthsLeft: 3 }) as never);

    await handleRazorpayWebhookEvent(charged(DISCOUNTED_TOTAL));

    expect(activateRenewalPayment).toHaveBeenCalled();
    expect(moveProviderAfterDiscountEnds).not.toHaveBeenCalled();
  });

  it("accepts the next renewal at the list amount, makes it the subscription's own, and invoices no discount", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 }) as never);

    await handleRazorpayWebhookEvent(charged(LIST_TOTAL));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: LIST_TOTAL, atNewDiscount: true, invoicedPrice: expect.objectContaining({ discountAmountCents: 0, retentionDiscountCents: 0 }) }),
    );
    expect(flagPaymentForAttention).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("records a renewal at the old discounted amount, as the provider did not move, and flags it for staff", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held({ discountMonthsLeft: 0, nextDiscountAmountCents: 0 }) as never);

    await handleRazorpayWebhookEvent(charged(DISCOUNTED_TOTAL));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: DISCOUNTED_TOTAL, atNewDiscount: false, invoicedPrice: expect.objectContaining({ discountAmountCents: 100_000 }) }),
    );
    expect(flagPaymentForAttention).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentId: "pay_row_1", reason: "add_on_provider_pending" }));
  });

  it("accepts a repriced percentage code together with the basket change that caused it", async () => {
    // A second service was added: the basket is ₹15,000 and the code now takes ₹1,500.
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held({ discountMonthsLeft: null, nextDiscountAmountCents: 150_000, pendingBundledAddOnNetCents: 1_500_000 }) as never);
    const total = 1_350_000;

    await handleRazorpayWebhookEvent(charged(total));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: total, atNewDiscount: true, invoicedPrice: expect.objectContaining({ discountAmountCents: 150_000 }) }),
    );
    expect(completeBundledAddOnChanges).toHaveBeenCalled();
    expect(flagPaymentForAttention).not.toHaveBeenCalled();
  });

  it("takes a reactivation at the discount a lapse carried, and moves the provider if that was the last month", async () => {
    vi.mocked(hasEverPaid).mockResolvedValueOnce(true);
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(held({ activatedAt: null, discountMonthsLeft: 1 }) as never);
    vi.mocked(activateReactivationPayment).mockResolvedValueOnce({ alreadyRecorded: false, payment: { id: "pay_row_reactivation" }, discountEnded: true } as never);

    await handleRazorpayWebhookEvent(charged(DISCOUNTED_TOTAL));

    expect(activateReactivationPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
    expect(moveProviderAfterDiscountEnds).toHaveBeenCalledWith({ deps: true }, "sub_row_months", expect.any(Date));
  });
});

describe("a package on the services plan, which costs nothing itself", () => {
  // Migration 0184's rupee plan: the terms at a price of 0, with the lines carrying the whole price, GST inside it.
  const SERVICES_PLAN = { id: "plan_services", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, initialTermMonths: 1, taxRateBasisPoints: 1_800 };

  /** All three services at 20% off, the saving rounded down to the whole rupee: ₹30,398 a month, GST included. */
  function allThree(activatedAt: Date | null) {
    return {
      id: "sub_row_package",
      businessId: "biz_package",
      planId: "plan_services",
      commitmentEndsAt: new Date("2026-11-21T00:00:00.000Z"),
      activatedAt,
      continuesId: null,
      discountAmountCents: 0,
      retentionDiscountCents: 0,
      bundledAddOnNetCents: 3_039_800,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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

  it("activates a first payment of the lines' nets, GST included: ₹30,398", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(allThree(null) as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);

    await handleRazorpayWebhookEvent(charged(3_039_800));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("renews at the same ₹30,398, and treats the lines at list as a mismatch", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(allThree(new Date("2026-10-21T09:00:00.000Z")) as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);

    await handleRazorpayWebhookEvent(charged(3_039_800));
    expect(activateRenewalPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 3_039_800 }));

    vi.mocked(activateRenewalPayment).mockClear();
    // ₹37,997 at list is what the package price replaced.
    await handleRazorpayWebhookEvent({ ...charged(3_799_700), paymentId: "pay_package_list" });
    expect(activateRenewalPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "amount_mismatch" }));
  });
});

describe("the renewal after a service was added to a package", () => {
  const SERVICES_PLAN = { id: "plan_services", currency: "INR", initialAmountCents: 0, recurringAmountCents: 0, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
  const BILLED_FROM = new Date("2026-10-21T09:00:00.000Z");
  const line = (addOn: string, listAmountCents: number, offerDiscountAmountCents: number, pending: number | null, billedFrom: Date | null) => ({
    addOn,
    status: "active",
    billedFrom,
    endRequestedAt: null,
    listAmountCents,
    offerDiscountAmountCents,
    pendingOfferDiscountAmountCents: pending,
    netAmountCents: listAmountCents - offerDiscountAmountCents,
    taxRateBasisPoints: 1_800,
  });
  const WEBSITE_MOVING = line("managed-website", 299_900, 0, 29_990, BILLED_FROM);
  // Social takes the 80 paise that round the package saving down to a whole rupee, being the dearest line.
  const SOCIAL_ADDED = line("digital-growth", 999_900, 99_910, null, null);
  // The website was billed alone at ₹2,999; the next renewal is website 10% off plus Social 10% off: ₹11,699, GST included.
  const SUBSCRIPTION = {
    id: "sub_row_added",
    businessId: "biz_added",
    planId: "plan_services",
    commitmentEndsAt: new Date("2026-11-21T00:00:00.000Z"),
    activatedAt: BILLED_FROM,
    continuesId: null,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    bundledAddOnNetCents: 299_900,
    pendingBundledAddOnNetCents: 1_169_900,
    nextDiscountAmountCents: null,
    discountMonthsLeft: null,
  };
  const charged = (amountCents: number) =>
    ({
      kind: "charged",
      currentStart: null,
      method: null,
      subscriptionId: "sub_rzp_added",
      currentEnd: new Date("2026-12-21T00:00:00.000Z"),
      paidAt: new Date("2026-11-21T09:00:00.000Z"),
      paymentId: "pay_added",
      amountCents,
      currency: "INR",
    }) as const;

  it("invoices each line at the offer it moved to, so the invoice adds up to the charge", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([WEBSITE_MOVING, SOCIAL_ADDED] as never);

    await handleRazorpayWebhookEvent(charged(1_169_900));

    const [, renewal] = vi.mocked(activateRenewalPayment).mock.calls[0] ?? [];
    const invoiced = renewal?.invoicedPrice.bundledAddOns ?? [];
    expect(invoiced.map((row) => [row.addOn, row.listAmountCents, row.offerDiscountAmountCents])).toEqual([
      ["managed-website", 299_900, 29_990],
      ["digital-growth", 999_900, 99_910],
    ]);
    const net = invoiced.reduce((total, row) => total + row.listAmountCents - row.offerDiscountAmountCents, 0);
    expect(chargedAmountCents(net, 0)).toBe(1_169_900);
    expect(completeBundledAddOnChanges).toHaveBeenCalled();
  });

  it("invoices the line that carries the leftover at the discount it moved to, so Website + SEO adds up to the paisa", async () => {
    // SEO was billed alone at list; the website joins, and the 80 paise that round the package saving down land on SEO, the dearest line.
    const seoMoving = line("local-seo-aeo", 2_499_900, 0, 249_910, BILLED_FROM);
    const websiteAdded = line("managed-website", 299_900, 29_990, null, null);
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...SUBSCRIPTION, bundledAddOnNetCents: 2_499_900, pendingBundledAddOnNetCents: 2_519_900 } as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([websiteAdded, seoMoving] as never);

    await handleRazorpayWebhookEvent(charged(2_519_900));

    const [, renewal] = vi.mocked(activateRenewalPayment).mock.calls[0] ?? [];
    const invoiced = renewal?.invoicedPrice.bundledAddOns ?? [];
    expect(invoiced.map((row) => [row.addOn, row.listAmountCents, row.offerDiscountAmountCents])).toEqual([
      ["managed-website", 299_900, 29_990],
      ["local-seo-aeo", 2_499_900, 249_910],
    ]);
    expect(completeBundledAddOnChanges).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("invoices the website alone at its own offer when the provider had not moved, at the old amount", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    vi.mocked(findPlanById).mockResolvedValue(SERVICES_PLAN as never);
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([WEBSITE_MOVING, SOCIAL_ADDED] as never);

    await handleRazorpayWebhookEvent(charged(299_900));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 299_900, invoicedPrice: expect.objectContaining({ bundledAddOns: [WEBSITE_MOVING] }) }),
    );
    expect(completeBundledAddOnChanges).not.toHaveBeenCalled();
  });
});

describe("a plan with GST inside its price", () => {
  // ₹2,999 with 18% GST inside it. The Razorpay plan is created at ₹2,999.
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
      continuesId: null,
      discountAmountCents,
      retentionDiscountCents: 0,
      bundledAddOnNetCents: 0,
      pendingBundledAddOnNetCents: null,
      nextDiscountAmountCents: null,
      discountMonthsLeft: null,
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

  it("activates on the price Razorpay actually takes, with nothing added on top", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(0, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(299_900));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("treats ₹3,538.82 as a mismatch, because the ₹2,999 already has GST inside it", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(0, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(353_882));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "amount_mismatch" }),
    );
  });

  it("takes a referral discount off the price: ₹500 off ₹2,999 is ₹2,499", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(50_000, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(249_900));

    expect(activateFirstPayment).toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("refuses the old GST-on-top amount less the discount, which would charge GST on a price that has it already", async () => {
    // ₹3,538.82 − a ₹500 offer. The charge should be ₹2,499.
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(subscriptionWith(50_000, null) as never);
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(303_882));

    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "amount_mismatch" }),
    );
  });

  it("keeps expecting the discounted price on every renewal", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
      subscriptionWith(50_000, new Date("2026-09-01T00:00:00.000Z")) as never,
    );
    vi.mocked(findPlanById).mockResolvedValue(GST_PLAN as never);

    await handleRazorpayWebhookEvent(charged(249_900));

    expect(activateRenewalPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 249_900 }),
    );
  });

  describe("a customer who paid to move up from Care to Premium", () => {
    const CARE = { id: "plan_care", currency: "INR", recurringAmountCents: 299_900, initialAmountCents: 299_900, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
    const PREMIUM = { id: "plan_premium", currency: "INR", recurringAmountCents: 999_900, initialAmountCents: 999_900, initialTermMonths: 1, taxRateBasisPoints: 1_800 };
    const CARE_AMOUNT = 299_900;
    const PREMIUM_AMOUNT = 999_900;

    function subscribeWithMovePending(overrides: Record<string, unknown> = {}): void {
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue({
        id: "sub_row_up",
        businessId: "biz_up",
        planId: "plan_care",
        commitmentEndsAt: new Date("2026-10-30T00:00:00.000Z"),
        activatedAt: new Date("2026-09-30T00:00:00.000Z"),
        continuesId: null,
        discountAmountCents: 0,
        retentionDiscountCents: 0,
        pendingPlanId: "plan_premium",
        pendingDiscountAmountCents: 0,
        bundledAddOnNetCents: 0,
        pendingBundledAddOnNetCents: null,
        nextDiscountAmountCents: null,
        discountMonthsLeft: null,
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
      // ₹9,999 − ₹500, GST included.
      await handleRazorpayWebhookEvent(renewal(949_900, "pay_up_2"));
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
  // Rs 2,999, GST included.
  const ROW = {
    id: "addon_row_1",
    businessId: "biz_addon",
    provider: "razorpay",
    providerSubscriptionId: "sub_rzp_addon",
    status: "incomplete",
    startAt: null,
    haltedAt: null,
    currency: "INR",
    chargedAmountCents: 299_900,
  };
  const CHARGE = {
    kind: "charged",
    subscriptionId: "sub_rzp_addon",
    currentStart: CYCLE_START,
    currentEnd: CYCLE_END,
    paidAt: PAID_AT,
    paymentId: "pay_addon_1",
    amountCents: 299_900,
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
          amountCents: 299_900,
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
        paymentId: "pay_addon_unapplied",
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
        paymentId: "pay_addon_unapplied",
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

    it("tells Teams about an add-on payment once it is recorded, and not about a redelivery", async () => {
      isAddOn({ status: "incomplete" });
      await handleRazorpayWebhookEvent(CHARGE);
      expect(announcePaymentToTeams).toHaveBeenCalledTimes(1);
      expect(announcePaymentToTeams).toHaveBeenCalledWith("pay_row_addon");

      vi.mocked(announcePaymentToTeams).mockClear();
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({ kind: "already-recorded", cancelAtProvider: [] });
      await handleRazorpayWebhookEvent(CHARGE);
      expect(announcePaymentToTeams).not.toHaveBeenCalled();
    });

    it("tells Teams about money kept for staff on an add-on whose checkout was replaced", async () => {
      isAddOn({ status: "cancelled" });
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({ kind: "refused", reason: "checkout_replaced", paymentId: "pay_addon_unapplied", cancelAtProvider: [] });
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await handleRazorpayWebhookEvent(CHARGE);
      expect(announcePaymentToTeams).toHaveBeenCalledWith("pay_addon_unapplied");
    });

    it("cancels the halted rows the payment closed at the provider, once the transaction has committed", async () => {
      isAddOn({ status: "halted" });
      vi.mocked(applyAddOnPayment).mockResolvedValueOnce({
        kind: "applied",
        paymentId: "pay_row_addon",
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

describe("telling Teams about a payment", () => {
  const SUBSCRIPTION = {
    id: "sub_row_1",
    businessId: "biz_1",
    planId: "plan_1",
    commitmentEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    activatedAt: new Date("2026-09-01T00:00:00.000Z"),
    continuesId: null,
    discountAmountCents: 0,
    retentionDiscountCents: 0,
    pendingPlanId: null,
    pendingDiscountAmountCents: 0,
    bundledAddOnNetCents: 0,
    pendingBundledAddOnNetCents: null,
    nextDiscountAmountCents: null,
    discountMonthsLeft: null,
  } as const;
  const CHARGED = {
    kind: "charged",
    currentStart: null,
    method: null,
    subscriptionId: "sub_rzp_1",
    currentEnd: new Date("2026-11-01T00:00:00.000Z"),
    paidAt: new Date("2026-10-14T12:00:00.000Z"),
    paymentId: "pay_1",
    amountCents: 7_500,
    currency: "USD",
  } as const;

  beforeEach(() => {
    vi.mocked(findPlanById).mockResolvedValue(PLAN as never);
  });

  it("announces a renewal once it has been recorded", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    await handleRazorpayWebhookEvent(CHARGED);
    expect(announcePaymentToTeams).toHaveBeenCalledTimes(1);
    expect(announcePaymentToTeams).toHaveBeenCalledWith("pay_row_1");
  });

  it("announces a customer's first payment", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue({ ...SUBSCRIPTION, activatedAt: null, commitmentEndsAt: null } as never);
    await handleRazorpayWebhookEvent(CHARGED);
    expect(announcePaymentToTeams).toHaveBeenCalledWith("pay_row_first");
  });

  it("does not announce a payment that was delivered before, so a redelivery never repeats the alert", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    vi.mocked(activateRenewalPayment).mockResolvedValueOnce({ alreadyRecorded: true, payment: { id: "pay_row_1" }, discountEnded: false } as never);
    await handleRazorpayWebhookEvent(CHARGED);
    expect(announcePaymentToTeams).not.toHaveBeenCalled();
  });

  it("announces money that arrived for the wrong amount, which bought nothing", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await handleRazorpayWebhookEvent({ ...CHARGED, amountCents: 1 });
    expect(recordUnappliedPayment).toHaveBeenCalled();
    expect(announcePaymentToTeams).toHaveBeenCalledWith("pay_unapplied");
  });

  it("announces nothing when recording the payment fails, since nothing was recorded", async () => {
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(SUBSCRIPTION as never);
    vi.mocked(activateRenewalPayment).mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(handleRazorpayWebhookEvent(CHARGED)).rejects.toThrow("database down");
    expect(announcePaymentToTeams).not.toHaveBeenCalled();
  });
});
