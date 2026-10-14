import { addMonthsUtc, createFakeBillingProvider, FAKE_PAYMENT_METHOD, type BillingProvider } from "@firstfold/billing";
import {
  findBillingState,
  findOpenProject,
  findPaymentByProviderId,
  findPlanById,
  findSubscriptionByProviderId,
  flagPaymentForAttention,
  lockBusinessForBilling,
  OnboardingLockedError,
  recordUnappliedPayment,
  withCustomerRole,
  type BillingState,
  type Database,
  type Payment,
  type Plan,
  type Project,
  type ScopedTransaction,
  type Subscription,
} from "@firstfold/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { getBillingProvider } from "./billing";
import { activateFirstPayment, activateReactivationPayment } from "@firstfold/shared/server/billing-activation";
import { getStaffDb } from "./db";
import { sendOnboardingWithin, StepRefusedError } from "./onboarding";
import { syncTenantForBusiness } from "./payload-tenant-sync";
import { confirmFirstPayment, verifyCheckoutFor } from "./payment-confirmation";

// The database is a double: that the payment, the subscription, the lead and the submission really commit (or roll
// back) together is proven in packages/db's payment-confirmation integration test. The provider is the real fake
// one, so every token check here is the real check.
vi.mock("server-only", () => ({}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@firstfold/shared/server/billing-activation", () => ({ activateFirstPayment: vi.fn(), activateReactivationPayment: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./onboarding", () => {
  class MockStepRefusedError extends Error {}
  return { sendOnboardingWithin: vi.fn(), StepRefusedError: MockStepRefusedError };
});
vi.mock("@firstfold/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firstfold/db")>();
  class MockOnboardingLockedError extends Error {}
  class MockProjectNotInOnboardingError extends Error {}
  return {
    isUnappliedReason: actual.isUnappliedReason,
    findBillingState: vi.fn(),
    flagPaymentForAttention: vi.fn(),
    recordUnappliedPayment: vi.fn(),
    findOpenProject: vi.fn(),
    findPaymentByProviderId: vi.fn(),
    findPlanById: vi.fn(),
    findSubscriptionByProviderId: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    OnboardingLockedError: MockOnboardingLockedError,
    ProjectNotInOnboardingError: MockProjectNotInOnboardingError,
    withCustomerRole: vi.fn(),
  };
});

const SECRET = "a-test-secret-that-is-long-enough-000";
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const OTHER_BUSINESS_ID = "0192f3c4-2222-7000-8000-000000000002";
const NOW = new Date("2026-09-16T12:00:00.000Z");
const tenant: TenantContext = { userId: "user-a", businessId: BUSINESS_ID, businessName: "Riverside", role: "owner" };

const PLAN = {
  id: "0192f3c4-3333-7000-8000-000000000003",
  code: "care-usd",
  name: "Firstfold care plan",
  tier: "premium",
  currency: "USD",
  initialAmountCents: 22500,
  initialTermMonths: 3,
  recurringAmountCents: 7500,
  includedPublishesPerMonth: 3,
  extraPublishAmountCents: 300,
  includedChangeHours: 1,
  extraHourAmountCents: 1500,
  includedBlogPosts: 100,
  blogPostBlockSize: 100,
  extraBlogPostsAmountCents: 500,
  providerPlanId: null,
  taxRateBasisPoints: 0,
} satisfies Plan;

const staffTx = { name: "staff-tx" } as unknown as ScopedTransaction;
const customerTx = { name: "customer-tx" } as unknown as ScopedTransaction;
const OPEN_PROJECT = { id: "project-1", status: "onboarding" } as Project;
const SENT_PROJECT = { id: "project-1", status: "submitted" } as Project;

let provider: BillingProvider;
let clock: Date;
let outcome: "committed" | "rolled back" | null;
let calls: string[];
let warned: MockInstance<typeof console.warn>;
let logged: MockInstance<typeof console.error>;

const NOT_PAID: BillingState = {
  currency: "USD",
  tier: "premium",
  upgradePaid: false,
  subscription: null,
  hasEverPaid: false,
  paymentUnderReview: false,
  plan: PLAN,
};

/** Every billing log line written, joined, for checking what was (and was not) logged. */
function logText(): string {
  return JSON.stringify([...warned.mock.calls, ...logged.mock.calls]);
}

async function checkoutToken(businessId = BUSINESS_ID): Promise<{ token: string; providerSubscriptionId: string }> {
  const started = await provider.startCheckout({
    businessId,
    businessName: "Riverside",
    email: "ana@example.com",
    plan: PLAN,
  });
  const token = new URL(started.checkoutUrl, "http://app.localhost").searchParams.get("token");
  if (token === null) throw new Error("no token in checkout URL");
  return { token, providerSubscriptionId: started.providerSubscriptionId };
}

function unpaidSubscription(providerSubscriptionId: string, overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    businessId: BUSINESS_ID,
    planId: PLAN.id,
    provider: "fake",
    providerSubscriptionId,
    status: "incomplete",
    discountAmountCents: 0,
    ...overrides,
  } as Subscription;
}

beforeEach(() => {
  vi.resetAllMocks();
  clock = NOW;
  provider = createFakeBillingProvider({ secret: SECRET, now: () => clock });
  outcome = null;
  calls = [];
  vi.mocked(getBillingProvider).mockReturnValue(provider);
  vi.mocked(getStaffDb).mockReturnValue({
    transaction: async (work: (tx: ScopedTransaction) => Promise<unknown>) => {
      try {
        const result = await work(staffTx);
        outcome = "committed";
        return result;
      } catch (error) {
        outcome = "rolled back";
        throw error;
      }
    },
  } as unknown as Database);
  vi.mocked(lockBusinessForBilling).mockImplementation(async () => {
    calls.push("lock");
  });
  vi.mocked(findPaymentByProviderId).mockResolvedValue(null);
  vi.mocked(findPlanById).mockResolvedValue(PLAN);
  vi.mocked(withCustomerRole).mockImplementation(async (_tx, _scope, work) => work(customerTx));
  vi.mocked(activateFirstPayment).mockImplementation(async () => {
    calls.push("activate");
    return { payment: { id: "pay-1" } as Payment, alreadyRecorded: false, leadsMarkedPaid: 1, openedMembership: null };
  });
  vi.mocked(syncTenantForBusiness).mockImplementation(async () => {
    calls.push("tenant-sync");
  });
  vi.mocked(findBillingState).mockResolvedValue(NOT_PAID);
  vi.mocked(recordUnappliedPayment).mockImplementation(async () => {
    calls.push("record-unapplied");
    return { payment: { id: "pay-unapplied" } as Payment, alreadyRecorded: false };
  });
  vi.mocked(flagPaymentForAttention).mockImplementation(async () => {
    calls.push("flag");
    return true;
  });
  warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(sendOnboardingWithin).mockImplementation(async () => {
    calls.push("send");
    return SENT_PROJECT;
  });
  vi.mocked(findOpenProject).mockResolvedValue(OPEN_PROJECT);
});

afterEach(() => {
  warned.mockRestore();
  logged.mockRestore();
});

describe("verifyCheckoutFor", () => {
  it("returns the payment for the signed-in customer's own checkout", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    await expect(verifyCheckoutFor(tenant, { token })).resolves.toMatchObject({
      providerSubscriptionId,
      businessId: BUSINESS_ID,
      amountCents: 22500,
      currency: "USD",
    });
  });

  it("refuses another business's checkout, even with a good signature, and logs it without the token", async () => {
    const { token, providerSubscriptionId } = await checkoutToken(OTHER_BUSINESS_ID);
    await expect(verifyCheckoutFor(tenant, { token })).resolves.toBeNull();
    expect(warned).toHaveBeenCalledTimes(1);
    const line = String(warned.mock.calls[0]?.[0]);
    expect(line).toMatch(/^\[firstfold:billing\] confirmation-refused /);
    expect(line).toContain(`"businessId":"${BUSINESS_ID}"`);
    expect(line).toContain(`"tokenBusinessId":"${OTHER_BUSINESS_ID}"`);
    expect(line).toContain(`"providerSubscriptionId":"${providerSubscriptionId}"`);
    expect(line).toContain('"reason":"other-business-token"');
    expect(logText()).not.toContain(token);
  });

  it("refuses a tampered, missing or expired token", async () => {
    const { token } = await checkoutToken();
    await expect(verifyCheckoutFor(tenant, { token: `${token.slice(0, -2)}AA` })).resolves.toBeNull();
    await expect(verifyCheckoutFor(tenant, {})).resolves.toBeNull();
    // A bad signature is not a refusal worth logging: anyone can send one.
    expect(warned).not.toHaveBeenCalled();

    clock = new Date(NOW.getTime() + 60 * 60 * 1000);
    await expect(verifyCheckoutFor(tenant, { token })).resolves.toBeNull();
    // An expired one passed the signature check, so it is logged, without the token.
    expect(warned).toHaveBeenCalledTimes(1);
    const line = String(warned.mock.calls[0]?.[0]);
    expect(line).toMatch(/^\[firstfold:billing\] confirmation-refused .*"reason":"verification-failed-after-signature"/);
    expect(line).toContain("expired");
    expect(line).toContain(`"businessId":"${BUSINESS_ID}"`);
    expect(logText()).not.toContain(token);
  });

  it("lets an unexpected provider failure through", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({
      ...provider,
      confirmCheckout: async () => Promise.reject(new Error("provider down")),
    });
    await expect(verifyCheckoutFor(tenant, { token: "x" })).rejects.toThrow("provider down");
  });
});

describe("confirmFirstPayment for the Premium membership", () => {
  it("opens the membership, sends nothing, and creates the client's tenant once the payment has committed", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(activateFirstPayment).mockImplementation(async () => {
      calls.push("activate");
      return { payment: { id: "pay-1" } as Payment, alreadyRecorded: false, leadsMarkedPaid: 0, openedMembership: { businessName: tenant.businessName } };
    });

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "membership-opened" });

    expect(calls).toEqual(["lock", "activate", "tenant-sync"]);
    expect(sendOnboardingWithin).not.toHaveBeenCalled();
    expect(syncTenantForBusiness).toHaveBeenCalledWith({ businessId: BUSINESS_ID, name: tenant.businessName });
  });

  it("creates no tenant for a client who already had one", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));

    await confirmFirstPayment(tenant, { token }, NOW);
    expect(syncTenantForBusiness).not.toHaveBeenCalled();
  });
});

describe("confirmFirstPayment", () => {
  it("records the payment and then sends onboarding as the customer, in one transaction", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "paid",
      submission: "sent",
      projectStillOpen: false,
    });

    expect(calls).toEqual(["lock", "activate", "send"]);
    expect(lockBusinessForBilling).toHaveBeenCalledWith(staffTx, BUSINESS_ID);
    expect(findSubscriptionByProviderId).toHaveBeenCalledWith(staffTx, "fake", providerSubscriptionId);
    expect(activateFirstPayment).toHaveBeenCalledWith(staffTx, {
      businessId: BUSINESS_ID,
      subscriptionId: "sub-1",
      plan: PLAN,
      provider: "fake",
      providerPaymentId: `fake_pay_${providerSubscriptionId.slice("fake_sub_".length)}`,
      paidAt: NOW,
      discountAmountCents: 0,
      method: FAKE_PAYMENT_METHOD,
    });
    expect(withCustomerRole).toHaveBeenCalledWith(staffTx, tenant, expect.any(Function));
    expect(sendOnboardingWithin).toHaveBeenCalledWith(customerTx, NOW);
    expect(outcome).toBe("committed");
  });

  it("writes nothing and opens no transaction for a token that does not verify", async () => {
    const { token } = await checkoutToken(OTHER_BUSINESS_ID);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "invalid" });
    expect(outcome).toBeNull();
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it("reports a payment already recorded as needing attention, writing nothing", async () => {
    const { token } = await checkoutToken();
    vi.mocked(findPaymentByProviderId).mockResolvedValue({
      id: "pay-1",
      businessId: BUSINESS_ID,
      attentionReason: "checkout_replaced",
    } as Payment);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "needs-attention" });
    expect(calls).toEqual(["lock"]);
  });

  it("refuses and logs a payment id already recorded for another business", async () => {
    const { token } = await checkoutToken();
    vi.mocked(findPaymentByProviderId).mockResolvedValue({
      id: "pay-1",
      businessId: OTHER_BUSINESS_ID,
      subscriptionId: "sub-other",
      attentionReason: null,
    } as Payment);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "invalid" });
    expect(String(warned.mock.calls[0]?.[0])).toMatch(/"subscriptionId":"sub-other".*"reason":"other-business-payment"/);
  });

  it("records nothing new for a payment already recorded, and reports where the project is", async () => {
    const { token } = await checkoutToken();
    vi.mocked(findPaymentByProviderId).mockResolvedValue({
      id: "pay-1",
      businessId: BUSINESS_ID,
      attentionReason: null,
    } as Payment);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "already-recorded",
      projectStillOpen: true,
    });
    vi.mocked(findOpenProject).mockResolvedValue(SENT_PROJECT);
    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "already-recorded",
      projectStillOpen: false,
    });
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(sendOnboardingWithin).not.toHaveBeenCalled();
  });

  it.each([
    ["no such subscription", null, "unknown-subscription"],
    ["another business's subscription", { businessId: OTHER_BUSINESS_ID }, "other-business-subscription"],
  ] as const)("refuses %s without writing, and logs why without the token", async (_label, overrides, reason) => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
      overrides === null ? null : unpaidSubscription(providerSubscriptionId, overrides),
    );

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "invalid" });
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
    expect(warned).toHaveBeenCalledTimes(1);
    expect(String(warned.mock.calls[0]?.[0])).toContain(`"reason":"${reason}"`);
    expect(String(warned.mock.calls[0]?.[0])).toContain(`"businessId":"${BUSINESS_ID}"`);
    expect(logText()).not.toContain(token);
  });

  it.each([
    ["a cancelled (replaced) checkout", { status: "cancelled" as const }, NOT_PAID, "checkout_replaced"],
    ["a subscription that went live without this payment", { status: "inactive" as const }, NOT_PAID, "checkout_replaced"],
    [
      "a checkout for a business that already has access",
      {},
      {
        ...NOT_PAID,
        hasEverPaid: true,
        subscription: { status: "active", paidThroughAt: new Date(NOW.getTime() + 60_000) } as Subscription,
      },
      "already_paid",
    ],
    [
      "a cancelled checkout for a business that already has access",
      { status: "cancelled" as const },
      {
        ...NOT_PAID,
        hasEverPaid: true,
        subscription: { status: "cancelled", paidThroughAt: new Date(NOW.getTime() + 60_000) } as Subscription,
      },
      "already_paid",
    ],
  ] as const)(
    "records the money from %s for staff, activates nothing, and logs it",
    async (_label, overrides, state, reason) => {
      const { token, providerSubscriptionId } = await checkoutToken();
      vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
        unpaidSubscription(providerSubscriptionId, overrides),
      );
      vi.mocked(findBillingState).mockResolvedValue(state);

      await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "needs-attention" });
      expect(calls).toEqual(["lock", "record-unapplied"]);
      expect(recordUnappliedPayment).toHaveBeenCalledWith(staffTx, {
        businessId: BUSINESS_ID,
        subscriptionId: "sub-1",
        provider: "fake",
        providerPaymentId: `fake_pay_${providerSubscriptionId.slice("fake_sub_".length)}`,
        kind: "initial",
        amountCents: 22500,
        currency: "USD",
        paidAt: NOW,
        reason,
        now: NOW,
        method: FAKE_PAYMENT_METHOD,
      });
      expect(sendOnboardingWithin).not.toHaveBeenCalled();
      expect(outcome).toBe("committed");
      const line = String(warned.mock.calls[0]?.[0]);
      expect(line).toMatch(/^\[firstfold:billing\] confirmation-refused /);
      expect(line).toContain('"subscriptionId":"sub-1"');
      expect(line).toContain(`"reason":"${reason}"`);
      expect(logText()).not.toContain(token);
    },
  );

  it("reactivates a business that paid before: a month at the monthly price, nothing sent, no first payment", async () => {
    // Premium at ₹9,999 + 18% GST, one month up front: the test checkout charges what Razorpay's monthly plan would.
    const premium = { ...PLAN, currency: "INR" as const, initialAmountCents: 999_900, initialTermMonths: 1, recurringAmountCents: 999_900, taxRateBasisPoints: 1_800 };
    vi.mocked(findPlanById).mockResolvedValue(premium);
    vi.mocked(findBillingState).mockResolvedValue({
      ...NOT_PAID,
      currency: "INR",
      plan: premium,
      hasEverPaid: true,
      subscription: unpaidSubscription("fake_sub_lapsed", { id: "sub-lapsed", status: "inactive" }),
    });
    vi.mocked(activateReactivationPayment).mockImplementation(async () => {
      calls.push("reactivate");
      return { payment: { id: "pay-1" } as Payment, alreadyRecorded: false, leadsMarkedPaid: 0 };
    });
    const started = await provider.startCheckout({ businessId: BUSINESS_ID, businessName: "Riverside", email: "ana@example.com", plan: premium });
    const token = new URL(started.checkoutUrl, "http://app.localhost").searchParams.get("token");
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(started.providerSubscriptionId, { id: "sub-back" }));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "reactivated" });

    const [, payment] = vi.mocked(activateReactivationPayment).mock.calls[0] ?? [];
    expect(payment).toMatchObject({ businessId: BUSINESS_ID, subscriptionId: "sub-back", plan: premium, provider: "fake" });
    expect(payment?.paidThroughAt).toEqual(addMonthsUtc(payment?.paidAt ?? NOW, 1));
    expect(activateFirstPayment).not.toHaveBeenCalled();
    expect(sendOnboardingWithin).not.toHaveBeenCalled();
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
    expect(calls).toEqual(["lock", "reactivate"]);
  });

  it("activates an Indian first payment, which is the plan's net price plus 18% GST", async () => {
    // ₹2,999 net + 18% GST = ₹3,538.82: what the provider charges and what production refused on 23 Sept.
    const inrPlan = { ...PLAN, currency: "INR" as const, initialAmountCents: 299_900, taxRateBasisPoints: 1_800 };
    vi.mocked(findPlanById).mockResolvedValue(inrPlan);
    const started = await provider.startCheckout({
      businessId: BUSINESS_ID,
      businessName: "Riverside",
      email: "ana@example.com",
      plan: inrPlan,
    });
    const token = new URL(started.checkoutUrl, "http://app.localhost").searchParams.get("token");
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(started.providerSubscriptionId));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toMatchObject({ kind: "paid" });
    expect(activateFirstPayment).toHaveBeenCalledWith(staffTx, expect.objectContaining({ plan: inrPlan }));
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
  });

  it("activates a first payment that had a referral discount taken off", async () => {
    vi.mocked(findPlanById).mockResolvedValue(PLAN);
    const started = await provider.startCheckout({
      businessId: BUSINESS_ID,
      businessName: "Riverside",
      email: "ana@example.com",
      plan: PLAN,
      discountAmountCents: 1_000,
    });
    const token = new URL(started.checkoutUrl, "http://app.localhost").searchParams.get("token");
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
      unpaidSubscription(started.providerSubscriptionId, { discountAmountCents: 1_000 }),
    );

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toMatchObject({ kind: "paid" });
    expect(recordUnappliedPayment).not.toHaveBeenCalled();
    // The recorded payment must be what was actually taken, so the subscription's frozen discount goes with it, the
    // same as the webhook passes it. Without it the payment would be recorded at the full price.
    expect(activateFirstPayment).toHaveBeenCalledWith(staffTx, expect.objectContaining({ discountAmountCents: 1_000 }));
  });

  it("still flags a payment that is the net price when GST was due", async () => {
    // Paying ₹2,999 on a plan that charges ₹3,538.82 is short: it must not activate.
    const inrPlan = { ...PLAN, currency: "INR" as const, initialAmountCents: 299_900, taxRateBasisPoints: 1_800 };
    const started = await provider.startCheckout({
      businessId: BUSINESS_ID,
      businessName: "Riverside",
      email: "ana@example.com",
      plan: { ...inrPlan, taxRateBasisPoints: 0 },
    });
    const token = new URL(started.checkoutUrl, "http://app.localhost").searchParams.get("token");
    vi.mocked(findPlanById).mockResolvedValue(inrPlan);
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(started.providerSubscriptionId));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "needs-attention" });
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      staffTx,
      expect.objectContaining({ reason: "amount_mismatch", amountCents: 299_900, currency: "INR" }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["the plan is gone", null],
    ["the amount is not the plan's first payment", { ...PLAN, initialAmountCents: 7500 }],
    ["the currency is not the plan's", { ...PLAN, currency: "INR" as const }],
  ])("records the money for staff when %s", async (_label, plan) => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(findPlanById).mockResolvedValue(plan);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({ kind: "needs-attention" });
    expect(recordUnappliedPayment).toHaveBeenCalledWith(
      staffTx,
      expect.objectContaining({ reason: "amount_mismatch", amountCents: 22500, currency: "USD" }),
    );
    expect(activateFirstPayment).not.toHaveBeenCalled();
  });

  it("rolls back when recording money for staff fails, so the confirmation can be tried again", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(
      unpaidSubscription(providerSubscriptionId, { status: "cancelled" }),
    );
    vi.mocked(recordUnappliedPayment).mockRejectedValue(new Error("connection lost"));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).rejects.toThrow("connection lost");
    expect(outcome).toBe("rolled back");
  });

  it("keeps the payment and the open project when the checklist no longer passes", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(sendOnboardingWithin).mockRejectedValue(new StepRefusedError({ message: "missing domain", field: null }));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "paid",
      submission: "missing",
      projectStillOpen: true,
    });
    expect(activateFirstPayment).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("committed");
  });

  it("keeps the payment when there was nothing open to send", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(sendOnboardingWithin).mockRejectedValue(new OnboardingLockedError());
    vi.mocked(findOpenProject).mockResolvedValue(SENT_PROJECT);

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "paid",
      submission: "not-open",
      projectStillOpen: false,
    });
    expect(outcome).toBe("committed");
  });

  it("keeps the payment, flags it for staff and logs a structured line without the token when sending fails", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(sendOnboardingWithin).mockRejectedValue(new Error("statement timeout"));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).resolves.toEqual({
      kind: "paid",
      submission: "failed",
      projectStillOpen: true,
    });
    expect(outcome).toBe("committed");
    expect(calls).toEqual(["lock", "activate", "flag"]);
    expect(flagPaymentForAttention).toHaveBeenCalledWith(staffTx, {
      paymentId: "pay-1",
      businessId: BUSINESS_ID,
      reason: "submission_failed",
      now: NOW,
    });
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toMatch(/^\[firstfold:billing\] submission-failed-after-payment \{/);
    expect(JSON.parse(line.slice(line.indexOf("{")))).toEqual({
      event: "submission-failed-after-payment",
      businessId: BUSINESS_ID,
      paymentId: "pay-1",
      errorName: "Error",
      pgCode: null,
      constraint: null,
      providerCode: null,
      httpStatus: null,
      // A plain Error's message could carry a query's params, so it never reaches the log.
      errorMessage: null,
    });
    expect(logText()).not.toContain(token);
  });

  it("rolls everything back when recording the payment fails", async () => {
    const { token, providerSubscriptionId } = await checkoutToken();
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(unpaidSubscription(providerSubscriptionId));
    vi.mocked(activateFirstPayment).mockRejectedValue(new Error("connection lost"));

    await expect(confirmFirstPayment(tenant, { token }, NOW)).rejects.toThrow("connection lost");
    expect(outcome).toBe("rolled back");
    expect(sendOnboardingWithin).not.toHaveBeenCalled();
  });
});
