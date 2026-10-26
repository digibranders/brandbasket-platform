import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "./billing-activation";

vi.mock("server-only", () => ({}));

vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    recordPaymentAndActivate: vi.fn().mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } }),
    openMembershipForListingBusiness: vi.fn(),
    activateBundledAddOns: vi.fn().mockResolvedValue([]),
    settleDiscountAfterPayment: vi.fn().mockResolvedValue({ monthsLeft: null, ended: false }),
    findSubscriptionById: vi.fn(),
  };
});

// Earnings are covered by the referral checkout integration test; here they would need a real payment row.
vi.mock("./affiliate-accrual", () => ({ accrueAffiliateEarning: vi.fn() }));
vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));

import { activateBundledAddOns, findSubscriptionById, openMembershipForListingBusiness, recordPaymentAndActivate, settleDiscountAfterPayment, type BundledAddOn } from "@brandbasket/db";
import { accrueAffiliateEarning } from "./affiliate-accrual";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

describe("activateRenewalPayment", () => {
  it("records a renewal payment, carrying the existing commitmentEndsAt through unchanged", async () => {
    const tx = {} as never;
    const commitmentEndsAt = new Date("2026-10-15T00:00:00.000Z");
    const paidThroughAt = new Date("2026-11-15T00:00:00.000Z");
    const paidAt = new Date("2026-10-14T12:00:00.000Z");

    await activateRenewalPayment(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      commitmentEndsAt,
      provider: "razorpay",
      providerPaymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      periodStart: paidAt,
      invoicedPrice: { plan: { id: "plan_1" } as never, netAmountCents: 7_500, discountAmountCents: 0, retentionDiscountCents: 0 },
      providerStatus: "active",
    });

    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      provider: "razorpay",
      providerPaymentId: "pay_1",
      kind: "renewal",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      commitmentEndsAt,
      currentPeriodEnd: paidThroughAt,
      providerStatus: "active",
    });
  });

  it("omits providerStatus entirely when the caller does not supply it", async () => {
    const tx = {} as never;
    const commitmentEndsAt = new Date("2026-10-15T00:00:00.000Z");
    const paidThroughAt = new Date("2026-11-15T00:00:00.000Z");
    const paidAt = new Date("2026-10-14T12:00:00.000Z");

    await activateRenewalPayment(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      commitmentEndsAt,
      provider: "razorpay",
      providerPaymentId: "pay_1",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      periodStart: paidAt,
      invoicedPrice: { plan: { id: "plan_1" } as never, netAmountCents: 7_500, discountAmountCents: 0, retentionDiscountCents: 0 },
    });

    expect(recordPaymentAndActivate).toHaveBeenCalledWith(tx, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      provider: "razorpay",
      providerPaymentId: "pay_1",
      kind: "renewal",
      amountCents: 7_500,
      currency: "USD",
      paidAt,
      paidThroughAt,
      commitmentEndsAt,
      currentPeriodEnd: paidThroughAt,
    });
  });
});

describe("activateFirstPayment", () => {
  const PLAN = {
    id: "plan-inr",
    currency: "INR",
    initialAmountCents: 350_000,
    taxRateBasisPoints: 0,
    initialTermMonths: 1,
    recurringAmountCents: 350_000,
  } as never;

  const BASE = {
    businessId: "biz-1",
    subscriptionId: "sub-1",
    plan: PLAN,
    provider: "razorpay",
    providerPaymentId: "pay_1",
    paidAt: new Date("2026-09-22T12:00:00.000Z"),
  } as const;

  it("records the plan's full price when no referral code applies", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    await activateFirstPayment({} as never, BASE);
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "initial", amountCents: 350_000, currency: "INR" }),
    );
  });

  it("records what was actually taken, not the plan's list price, when a code discounted it", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    await activateFirstPayment({} as never, { ...BASE, discountAmountCents: 52_500 });
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: 297_500 }),
    );
  });

  it("gives the same term whatever the discount: a code lowers the price, not the length", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    await activateFirstPayment({} as never, BASE);
    const full = vi.mocked(recordPaymentAndActivate).mock.calls.at(-1)?.[1];
    await activateFirstPayment({} as never, { ...BASE, discountAmountCents: 52_500 });
    const discounted = vi.mocked(recordPaymentAndActivate).mock.calls.at(-1)?.[1];
    expect(discounted?.paidThroughAt).toEqual(full?.paidThroughAt);
    expect(discounted?.commitmentEndsAt).toEqual(full?.commitmentEndsAt);
  });

  it("opens the membership for a free listing business in the same transaction, and says so", async () => {
    const tx = {} as never;
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(activateBundledAddOns).mockResolvedValueOnce([{ addOn: "managed-website" } as BundledAddOn]);
    vi.mocked(openMembershipForListingBusiness).mockResolvedValue({ businessName: "Smile Dental" });
    const activation = await activateFirstPayment(tx, BASE);
    expect(openMembershipForListingBusiness).toHaveBeenCalledWith(tx, "biz-1", { withProject: true });
    expect(activation.openedMembership).toEqual({ businessName: "Smile Dental" });
  });

  it("opens no onboarding project when the basket has no Managed Website line", async () => {
    const tx = {} as never;
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(activateBundledAddOns).mockResolvedValueOnce([{ addOn: "digital-growth" } as BundledAddOn, { addOn: "local-seo-aeo" } as BundledAddOn]);
    vi.mocked(openMembershipForListingBusiness).mockResolvedValue({ businessName: "Smile Dental" });
    await activateFirstPayment(tx, BASE);
    expect(openMembershipForListingBusiness).toHaveBeenCalledWith(tx, "biz-1", { withProject: false });
  });

  it("reports no membership opened for a business that was already a client", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(openMembershipForListingBusiness).mockResolvedValue(null);
    expect((await activateFirstPayment({} as never, BASE)).openedMembership).toBeNull();
  });

  it("changes nothing about the business when the payment was already recorded", async () => {
    vi.mocked(openMembershipForListingBusiness).mockClear();
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: true } as never);
    expect((await activateFirstPayment({} as never, BASE)).openedMembership).toBeNull();
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
  });

  it("counts a payment taken with a discount as one of the code's months, and says when it was the last", async () => {
    const tx = {} as never;
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(settleDiscountAfterPayment).mockClear();
    vi.mocked(settleDiscountAfterPayment).mockResolvedValueOnce({ monthsLeft: 0, ended: true });
    const activation = await activateFirstPayment(tx, { ...BASE, discountAmountCents: 52_500 });
    expect(settleDiscountAfterPayment).toHaveBeenCalledWith(tx, { subscriptionId: "sub-1", discountTakenCents: 52_500, adoptsNewDiscount: false, now: BASE.paidAt });
    expect(activation.discountEnded).toBe(true);
  });

  it("counts nothing for a payment already recorded", async () => {
    vi.mocked(settleDiscountAfterPayment).mockClear();
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: true } as never);
    expect((await activateFirstPayment({} as never, { ...BASE, discountAmountCents: 52_500 })).discountEnded).toBe(false);
    expect(settleDiscountAfterPayment).not.toHaveBeenCalled();
  });

  it("refuses a discount that would leave nothing to record", async () => {
    await expect(activateFirstPayment({} as never, { ...BASE, discountAmountCents: 350_000 })).rejects.toThrow(RangeError);
    await expect(activateFirstPayment({} as never, { ...BASE, discountAmountCents: -1 })).rejects.toThrow(RangeError);
  });
});

describe("activateReactivationPayment", () => {
  const tx = {} as never;
  beforeEach(() => {
    vi.mocked(findSubscriptionById).mockResolvedValue({ discountAmountCents: 0 } as never);
    vi.mocked(settleDiscountAfterPayment).mockClear();
    vi.mocked(accrueAffiliateEarning).mockClear();
  });
  // Premium at ₹9,999 + 18% GST. Its first payment equals its monthly price today, but a reactivation must use the
  // monthly price whatever the first payment is, so the two are set apart here.
  const PLAN = {
    id: "plan-premium",
    currency: "INR",
    initialAmountCents: 1_999_800,
    initialTermMonths: 2,
    recurringAmountCents: 999_900,
    taxRateBasisPoints: 1_800,
  } as never;
  const PAID = new Date("2026-10-09T10:00:00.000Z");
  const THROUGH = new Date("2026-11-09T10:00:00.000Z");
  const BASE = {
    businessId: "biz-1",
    subscriptionId: "sub-back",
    plan: PLAN,
    provider: "razorpay",
    providerPaymentId: "pay_back",
    paidAt: PAID,
    paidThroughAt: THROUGH,
  } as const;

  it("records a reactivation at the monthly price, GST inside it, through the date it is given", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    await activateReactivationPayment(tx, BASE);
    expect(recordPaymentAndActivate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: "reactivation",
        amountCents: 999_900,
        currency: "INR",
        paidAt: PAID,
        paidThroughAt: THROUGH,
        commitmentEndsAt: THROUGH,
        currentPeriodEnd: THROUGH,
      }),
    );
  });

  it("opens no membership, and earns the code's affiliate as a renewal does", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(openMembershipForListingBusiness).mockClear();
    await activateReactivationPayment(tx, BASE);
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
    expect(accrueAffiliateEarning).toHaveBeenCalledWith(tx, { paymentId: "payment_1", subscriptionId: "sub-back", kind: "reactivation" });
  });

  it("takes the discount a lapse carried, counts one of its months and invoices it", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
    vi.mocked(findSubscriptionById).mockResolvedValue({ discountAmountCents: 99_990 } as never);
    vi.mocked(settleDiscountAfterPayment).mockResolvedValue({ monthsLeft: 0, ended: true });
    vi.mocked(issueTaxInvoiceSafely).mockClear();

    const activation = await activateReactivationPayment(tx, BASE);

    // 999,900 - 99,990: the price the customer pays, with its GST inside
    expect(recordPaymentAndActivate).toHaveBeenLastCalledWith(tx, expect.objectContaining({ amountCents: 899_910 }));
    expect(settleDiscountAfterPayment).toHaveBeenCalledWith(tx, { subscriptionId: "sub-back", discountTakenCents: 99_990, adoptsNewDiscount: false, now: PAID });
    expect(vi.mocked(issueTaxInvoiceSafely).mock.calls[0]?.[2]).toMatchObject({ discountAmountCents: 99_990 });
    expect(activation.discountEnded).toBe(true);
  });

  it("counts nothing for a payment already recorded", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: true, payment: { id: "payment_1" } } as never);
    expect((await activateReactivationPayment(tx, BASE)).discountEnded).toBe(false);
    expect(settleDiscountAfterPayment).not.toHaveBeenCalled();
  });
});

describe("a renewal and the code's months", () => {
  const paidAt = new Date("2026-10-14T12:00:00.000Z");
  const renewal = {
    businessId: "biz_1",
    subscriptionId: "sub_1",
    commitmentEndsAt: paidAt,
    provider: "razorpay",
    providerPaymentId: "pay_1",
    amountCents: 3_000,
    currency: "INR",
    paidAt,
    paidThroughAt: new Date("2026-11-14T12:00:00.000Z"),
    periodStart: paidAt,
    invoicedPrice: { plan: { id: "plan_1" } as never, netAmountCents: 0, discountAmountCents: 1_000, retentionDiscountCents: 0 },
  } as const;

  beforeEach(() => {
    vi.mocked(settleDiscountAfterPayment).mockClear();
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
  });

  it("counts the discount the renewal was invoiced with, and says when it was the last month", async () => {
    const tx = {} as never;
    vi.mocked(settleDiscountAfterPayment).mockResolvedValueOnce({ monthsLeft: 0, ended: true });
    const activation = await activateRenewalPayment(tx, renewal);
    expect(settleDiscountAfterPayment).toHaveBeenCalledWith(tx, { subscriptionId: "sub_1", discountTakenCents: 1_000, adoptsNewDiscount: false, now: paidAt });
    expect(activation.discountEnded).toBe(true);
  });

  it("makes the waiting discount the subscription's own when the renewal was taken at it", async () => {
    const tx = {} as never;
    await activateRenewalPayment(tx, { ...renewal, atNewDiscount: true, invoicedPrice: { ...renewal.invoicedPrice, discountAmountCents: 0 } });
    expect(settleDiscountAfterPayment).toHaveBeenCalledWith(tx, { subscriptionId: "sub_1", discountTakenCents: 0, adoptsNewDiscount: true, now: paidAt });
  });

  it("counts nothing for a payment already recorded", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: true, payment: { id: "payment_1" } } as never);
    expect((await activateRenewalPayment({} as never, renewal)).discountEnded).toBe(false);
    expect(settleDiscountAfterPayment).not.toHaveBeenCalled();
  });
});

describe("the tax invoice", () => {
  const paidAt = new Date("2026-10-14T12:00:00.000Z");
  const paidThroughAt = new Date("2026-11-14T12:00:00.000Z");
  const plan = { id: "plan_1", initialTermMonths: 1, initialAmountCents: 999_900, recurringAmountCents: 999_900, taxRateBasisPoints: 1_800, currency: "INR" } as never;
  const renewal = {
    businessId: "biz_1",
    subscriptionId: "sub_1",
    commitmentEndsAt: paidAt,
    provider: "razorpay",
    providerPaymentId: "pay_1",
    amountCents: 660_706,
    currency: "INR",
    paidAt,
    paidThroughAt,
    periodStart: new Date("2026-10-14T00:00:00.000Z"),
    invoicedPrice: { plan, netAmountCents: 999_900, discountAmountCents: 199_980, retentionDiscountCents: 0 },
  } as const;

  beforeEach(() => {
    vi.mocked(issueTaxInvoiceSafely).mockClear();
    vi.mocked(recordPaymentAndActivate).mockResolvedValue({ alreadyRecorded: false, payment: { id: "payment_1" } } as never);
  });

  it("is issued for a renewal at the price the caller verified, for the provider's own cycle", async () => {
    const tx = {} as never;
    await activateRenewalPayment(tx, renewal);
    expect(issueTaxInvoiceSafely).toHaveBeenCalledWith(tx, { id: "payment_1" }, {
      kind: "plan",
      plan,
      netAmountCents: 999_900,
      discountAmountCents: 199_980,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: new Date("2026-10-14T00:00:00.000Z"),
      periodEnd: paidThroughAt,
    });
  });

  it("earns the affiliate on the price the renewal was invoiced at, not on the services the subscription still holds", async () => {
    vi.mocked(accrueAffiliateEarning).mockClear();
    const lines = [
      { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 59_980, taxRateBasisPoints: 1_800 },
      { addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 200_020, taxRateBasisPoints: 1_800 },
    ];
    await activateRenewalPayment({} as never, { ...renewal, invoicedPrice: { plan, bundledAddOns: lines, netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0 } });
    expect(accrueAffiliateEarning).toHaveBeenCalledWith({}, { paymentId: "payment_1", subscriptionId: "sub_1", kind: "renewal", invoiced: { netCents: 1_039_800, discountCents: 0 } });
  });

  it("is not issued again for a payment recorded before", async () => {
    vi.mocked(recordPaymentAndActivate).mockResolvedValueOnce({ alreadyRecorded: true, payment: { id: "payment_1" } } as never);
    await activateRenewalPayment({} as never, renewal);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });

  it("is issued last for a first payment, for the plan's own term", async () => {
    await activateFirstPayment({} as never, {
      businessId: "biz_1",
      subscriptionId: "sub_1",
      plan,
      provider: "razorpay",
      providerPaymentId: "pay_3",
      paidAt,
      discountAmountCents: 199_980,
    });
    expect(vi.mocked(issueTaxInvoiceSafely).mock.calls[0]?.[2]).toEqual({
      kind: "plan",
      plan,
      bundledAddOns: [],
      netAmountCents: 999_900,
      discountAmountCents: 199_980,
      retentionDiscountCents: 0,
      monthly: true,
      periodStart: paidAt,
      periodEnd: new Date("2026-11-14T12:00:00.000Z"),
    });
    const invoiced = vi.mocked(issueTaxInvoiceSafely).mock.invocationCallOrder[0] ?? 0;
    const opened = vi.mocked(openMembershipForListingBusiness).mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY;
    expect(invoiced).toBeGreaterThan(opened);
  });

  it("is issued for a restart at the plan's monthly price with no discount", async () => {
    vi.mocked(findSubscriptionById).mockResolvedValue({ discountAmountCents: 0 } as never);
    await activateReactivationPayment({} as never, { businessId: "biz_1", subscriptionId: "sub_1", plan, provider: "razorpay", providerPaymentId: "pay_2", paidAt, paidThroughAt });
    expect(vi.mocked(issueTaxInvoiceSafely).mock.calls[0]?.[2]).toEqual({
      kind: "plan", plan, bundledAddOns: [], netAmountCents: 999_900, discountAmountCents: 0, retentionDiscountCents: 0, monthly: true, periodStart: paidAt, periodEnd: paidThroughAt,
    });
  });
});
