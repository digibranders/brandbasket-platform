import { chargedAmountCents, createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  consumeRateLimit,
  findActivePlan,
  findBillingState,
  findBundledAddOnsForSubscription,
  findBusinessEntry,
  findBusinessReferralCode,
  findRedeemableReferralCode,
  findLatestSubscriptionForBusiness,
  lockBusinessForBilling,
  openCheckoutSubscription,
  withTenantScope,
  type BillingState,
  type BusinessProfile,
  type Database,
  type MediaAsset,
  type Plan,
  type PrimaryDomain,
  type Project,
  type ReferralCode,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { OnboardingSnapshot } from "@/lib/onboarding/snapshot";
import { getBillingProvider } from "./billing";
import { CHECKOUT_RATE_LIMIT, startCheckoutFor, startMembershipCheckoutFor, startReactivationFor, UnsafeCheckoutUrlError } from "./checkout";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";
import { readOnboardingSnapshot } from "./onboarding";

// Database doubles; the one-live-subscription rule and the stale-checkout transition are proven in packages/db, and
// the reuse/replace decision in packages/billing. What is checked here is the order of the gates, that the provider
// is only ever called with no transaction open, and what each decision and each failure turns into.
vi.mock("server-only", () => ({}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("./discount-plans", () => ({ ensureDiscountPlan: vi.fn() }));
vi.mock("./onboarding", () => ({
  readOnboardingSnapshot: vi.fn(),
  missingProblem: (item: { label: string; step: string }) => ({
    message: `Missing: ${item.label}`,
    field: null,
    fixHref: `/onboarding/${item.step}`,
  }),
}));
vi.mock("@brandbasket/db", () => {
  class MockBillingBusinessNotFoundError extends Error {}
  return {
    BillingBusinessNotFoundError: MockBillingBusinessNotFoundError,
    bundledNetCents: (items: readonly { netAmountCents: number }[]) => items.reduce((total, item) => total + item.netAmountCents, 0),
    consumeRateLimit: vi.fn(),
    findActivePlan: vi.fn(),
    findBillingState: vi.fn(),
    findBundledAddOnsForSubscription: vi.fn().mockResolvedValue([]),
    findBusinessEntry: vi.fn(),
    findBusinessReferralCode: vi.fn(),
    findRedeemableReferralCode: vi.fn(),
    findLatestSubscriptionForBusiness: vi.fn(),
    lockBusinessForBilling: vi.fn(),
    openCheckoutSubscription: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const SECRET = "a-test-secret-that-is-long-enough-000";
const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

const PLAN = { id: "plan-usd", currency: "USD", initialAmountCents: 22500, initialTermMonths: 3, taxRateBasisPoints: 0 } as Plan;

const customer: GrantedCustomer = {
  user: { id: "user-a", email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null },
  tenant: { userId: "user-a", businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" },
  billing: { status: "unpaid", hasAccess: false, subscription: null, tier: "premium", upgradePaid: false, plan: PLAN, paymentUnderReview: false, renewalFailingUntil: null },
};

const COMPLETE: OnboardingSnapshot = {
  project: { id: "project-1", status: "onboarding" } as Project,
  locked: false,
  completed: ["business", "content", "brand", "domain"],
  profile: { displayName: "Riverside Plumbing", phone: "+1 555 0100", email: null } as BusinessProfile,
  hours: [],
  services: [{ id: "s1", name: "Repairs", summary: null, priceText: null, position: 0, createdAt: NOW, updatedAt: NOW }],
  brief: null,
  domain: { hostname: "riverside.example", ownerConfirmedAt: NOW } as PrimaryDomain,
  logo: { id: "logo", purpose: "logo", altText: null } as MediaAsset,
  photos: [],
};

let provider: BillingProvider;
let cancelled: MockInstance<BillingProvider["cancelSubscription"]>;
let logged: MockInstance<typeof console.error>;
let warned: MockInstance<typeof console.warn>;
/** Everything that happened, in order: transactions opening and closing, and provider calls. */
let events: string[];
let openTransactions: number;
let transactionCount: number;

function subscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: "sub-old",
    businessId: BUSINESS_ID,
    planId: PLAN.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    status: "incomplete",
    activatedAt: null,
    paidThroughAt: null,
    referralCodeId: null,
    discountAmountCents: 0,
    createdAt: new Date(NOW.getTime() - HOUR_MS),
    ...overrides,
  } as Subscription;
}

function billingState(latest: Subscription | null, history: Partial<BillingState> = {}): BillingState {
  return { currency: "USD", tier: "premium", upgradePaid: false, subscription: latest, hasEverPaid: false, paymentUnderReview: false, plan: PLAN, ...history };
}

/** The same newest subscription seen by both transactions, unless a test says otherwise. */
function newest(latest: Subscription | null, history: Partial<BillingState> = {}): void {
  vi.mocked(findBillingState).mockResolvedValue(billingState(latest, history));
  vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue(latest);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue([]);
  events = [];
  openTransactions = 0;
  transactionCount = 0;
  const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
  provider = {
    ...real,
    startCheckout: async (input) => {
      events.push(openTransactions === 0 ? "provider:start" : "provider:start INSIDE A TRANSACTION");
      return real.startCheckout(input);
    },
    cancelSubscription: async (id) => {
      events.push(openTransactions === 0 ? "provider:cancel" : "provider:cancel INSIDE A TRANSACTION");
      return real.cancelSubscription(id);
    },
  };
  cancelled = vi.spyOn(provider, "cancelSubscription");
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.mocked(getBillingProvider).mockReturnValue(provider);
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue({
    transaction: async (work: (tx: ScopedTransaction) => Promise<unknown>) => {
      transactionCount += 1;
      const name = `tx${transactionCount}`;
      openTransactions += 1;
      events.push(`${name}:begin`);
      try {
        const result = await work({ name } as unknown as ScopedTransaction);
        events.push(`${name}:commit`);
        return result;
      } catch (error) {
        events.push(`${name}:rollback`);
        throw error;
      } finally {
        openTransactions -= 1;
      }
    },
  } as unknown as Database);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(readOnboardingSnapshot).mockResolvedValue(COMPLETE);
  newest(null);
  vi.mocked(findActivePlan).mockResolvedValue(PLAN);
  // No referral code applied, unless a test says otherwise.
  vi.mocked(findBusinessReferralCode).mockResolvedValue(null);
  vi.mocked(findRedeemableReferralCode).mockResolvedValue(null);
  // The fake provider needs no discounted plan of its own.
  vi.mocked(ensureDiscountPlan).mockResolvedValue(undefined);
  vi.mocked(openCheckoutSubscription).mockImplementation(async (_tx, input) => {
    events.push("record");
    return { id: "sub-new", ...input, status: "incomplete" } as unknown as Subscription;
  });
});

afterEach(() => {
  logged.mockRestore();
  warned.mockRestore();
});

function redirectUrl(outcomeValue: Awaited<ReturnType<typeof startCheckoutFor>>): URL {
  if (outcomeValue.kind !== "redirect") throw new Error(`expected a redirect, got ${JSON.stringify(outcomeValue)}`);
  return new URL(outcomeValue.url, "http://app.localhost");
}

describe("startCheckoutFor", () => {
  it("decides under the lock, calls the provider with no transaction open, then records in a second one", async () => {
    const result = await startCheckoutFor(customer, NOW);

    const url = redirectUrl(result);
    expect(url.pathname).toBe("/billing/confirm");
    expect(url.searchParams.get("token")).toMatch(/^v2\./);
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "record", "tx2:commit"]);
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `checkout:business:${BUSINESS_ID}`, CHECKOUT_RATE_LIMIT);
    expect(CHECKOUT_RATE_LIMIT).toEqual({ limit: 10, windowSeconds: 3600 });
    expect(withTenantScope).toHaveBeenCalledWith(appDb, customer.tenant, readOnboardingSnapshot);
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(1, { name: "tx1" }, BUSINESS_ID);
    expect(lockBusinessForBilling).toHaveBeenNthCalledWith(2, { name: "tx2" }, BUSINESS_ID);
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      { name: "tx2" },
      {
        businessId: BUSINESS_ID,
        planId: PLAN.id,
        provider: "fake",
        providerSubscriptionId: expect.stringMatching(/^fake_sub_[0-9a-f]{24}$/),
        referralCodeId: null,
        discountAmountCents: 0,
        bundledAddOns: [],
        replacing: null,
        now: NOW,
      },
    );
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("refuses once the business has used up its attempts, before reading anything", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    const result = await startCheckoutFor(customer, NOW);
    expect(result).toMatchObject({ kind: "refused", problem: { message: expect.stringMatching(/attempts/) } });
    expect(readOnboardingSnapshot).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("refuses with the first missing item, and opens nothing", async () => {
    vi.mocked(readOnboardingSnapshot).mockResolvedValue({ ...COMPLETE, domain: null });

    await expect(startCheckoutFor(customer, NOW)).resolves.toEqual({
      kind: "refused",
      problem: { message: "Missing: Your domain, confirmed as yours", field: null, fixHref: "/onboarding/domain" },
    });
    expect(events).toEqual([]);
  });

  it("does not re-run the checklist for answers already sent, so those customers can always pay", async () => {
    vi.mocked(readOnboardingSnapshot).mockResolvedValue({
      ...COMPLETE,
      project: { id: "project-1", status: "submitted" } as Project,
      locked: true,
      domain: null,
      logo: null,
    });

    expect(redirectUrl(await startCheckoutFor(customer, NOW)).pathname).toBe("/billing/confirm");
    expect(openCheckoutSubscription).toHaveBeenCalledTimes(1);
  });

  it("refuses when there is no project to pay for", async () => {
    vi.mocked(readOnboardingSnapshot).mockResolvedValue({ ...COMPLETE, project: null, locked: true });

    await expect(startCheckoutFor(customer, NOW)).resolves.toMatchObject({ kind: "refused" });
    expect(events).toEqual([]);
  });

  it("refuses when the currency has no plan", async () => {
    vi.mocked(findActivePlan).mockResolvedValue(null);

    await expect(startCheckoutFor(customer, NOW)).resolves.toMatchObject({
      kind: "refused",
      problem: { message: expect.stringMatching(/currency/) },
    });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
  });

  it("sends the customer back to their recent unpaid checkout, outside any transaction, recording nothing", async () => {
    const recent = subscription({});
    newest(recent);

    const result = await startCheckoutFor(customer, NOW);
    const token = redirectUrl(result).searchParams.get("token") ?? "";
    await expect(provider.confirmCheckout({ token })).resolves.toMatchObject({
      providerSubscriptionId: recent.providerSubscriptionId,
    });
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start"]);
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });

  it("sends the customer back to their unpaid checkout at the discounted amount it was opened with", async () => {
    const code: ReferralCode = {
      id: "01a0e81e-89b6-704e-a3c2-702156218f36",
      code: "SAVE10",
      currency: PLAN.currency,
      affiliateId: null,
      discount: { kind: "amount", amountCents: 1_000 },
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      createdAt: NOW,
    };
    vi.mocked(findBusinessReferralCode).mockResolvedValue(code);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(code);
    const recent = subscription({ referralCodeId: code.id, discountAmountCents: 1_000 });
    newest(recent);

    const token = redirectUrl(await startCheckoutFor(customer, NOW)).searchParams.get("token") ?? "";
    const confirmed = await provider.confirmCheckout({ token });
    // What the reopened checkout asks for is the subscription's own frozen discount, not the full price.
    expect(confirmed).toMatchObject({
      providerSubscriptionId: recent.providerSubscriptionId,
      amountCents: chargedAmountCents(PLAN.initialAmountCents, 1_000, PLAN.taxRateBasisPoints),
    });
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });

  it("replaces a stale checkout and cancels it at the provider only after the commit", async () => {
    const stale = subscription({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) });
    newest(stale);

    redirectUrl(await startCheckoutFor(customer, NOW));
    expect(openCheckoutSubscription).toHaveBeenCalledWith({ name: "tx2" }, expect.objectContaining({ replacing: "sub-old" }));
    expect(events).toEqual([
      "tx1:begin",
      "tx1:commit",
      "provider:start",
      "tx2:begin",
      "record",
      "tx2:commit",
      "provider:cancel",
    ]);
    expect(cancelled).toHaveBeenCalledWith(stale.providerSubscriptionId);
  });

  it("replaces an unpaid checkout opened at an old price", async () => {
    newest(subscription({ planId: "plan-usd-2025" }));

    redirectUrl(await startCheckoutFor(customer, NOW));
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      { name: "tx2" },
      expect.objectContaining({ replacing: "sub-old", planId: PLAN.id }),
    );
  });

  it("logs, and still sends the customer on, when the replaced checkout cannot be cancelled at the provider", async () => {
    newest(subscription({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) }));
    cancelled.mockRejectedValue(new Error("provider unreachable"));

    redirectUrl(await startCheckoutFor(customer, NOW));
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[brandbasket:billing\] provider-cancel-failed /);
    expect(String(logged.mock.calls[0]?.[0])).toContain('"subscriptionId":"sub-old"');
  });

  it("opens a fresh checkout beside a replaced one that was never paid, without replacing anything", async () => {
    newest(subscription({ status: "cancelled" }));

    redirectUrl(await startCheckoutFor(customer, NOW));
    expect(openCheckoutSubscription).toHaveBeenCalledWith({ name: "tx2" }, expect.objectContaining({ replacing: null }));
    expect(cancelled).not.toHaveBeenCalled();
  });

  it.each([
    ["active and paid ahead", subscription({ status: "active", paidThroughAt: new Date(NOW.getTime() + 1000) })],
    ["cancelled inside its paid period", subscription({ status: "cancelled", paidThroughAt: new Date(NOW.getTime() + 1000) })],
  ])("sends a customer whose subscription is %s back to Check and send", async (_label, paid) => {
    newest(paid, { hasEverPaid: true });

    await expect(startCheckoutFor(customer, NOW)).resolves.toEqual({ kind: "redirect", url: "/onboarding/review" });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
  });

  it("does not take a second payment while a received one is under review", async () => {
    newest(subscription({ status: "cancelled" }), { paymentUnderReview: true });

    await expect(startCheckoutFor(customer, NOW)).resolves.toEqual({
      kind: "refused",
      problem: {
        message: "We’ve received your payment. Our team will be in touch shortly to sort out your account.",
        field: null,
      },
    });
    expect(events).toEqual(["tx1:begin", "tx1:commit"]);
  });

  it("cancels its own new subscription, records nothing and asks to retry when the business changed meanwhile", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));
    // A second tab opened a checkout between the two transactions.
    vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue(subscription({ id: "sub-other-tab" }));

    await expect(startCheckoutFor(customer, NOW)).resolves.toMatchObject({
      kind: "refused",
      problem: { message: expect.stringMatching(/try again/) },
    });
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "tx2:commit", "provider:cancel"]);
    expect(cancelled).toHaveBeenCalledWith(expect.stringMatching(/^fake_sub_[0-9a-f]{24}$/));
    expect(String(warned.mock.calls[0]?.[0])).toMatch(/^\[brandbasket:billing\] checkout-orphaned .*changed-meanwhile/);
  });

  it("notices a checkout that was paid between the two transactions", async () => {
    const stale = subscription({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) });
    vi.mocked(findBillingState).mockResolvedValue(billingState(stale));
    vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue({ ...stale, status: "active" });

    await expect(startCheckoutFor(customer, NOW)).resolves.toMatchObject({ kind: "refused" });
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
    // Only the orphan is cancelled, never the checkout that was just paid.
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalledWith(stale.providerSubscriptionId);
  });

  it("cancels the orphaned subscription and logs when recording it fails", async () => {
    vi.mocked(openCheckoutSubscription).mockRejectedValue(new Error("connection lost"));

    await expect(startCheckoutFor(customer, NOW)).rejects.toThrow("connection lost");
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "tx2:rollback", "provider:cancel"]);
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/^\[brandbasket:billing\] checkout-orphaned .*record-failed/);
    // The error is named, never quoted: a database error's message carries the failed query's params.
    expect(String(logged.mock.calls[0]?.[0])).toContain('"errorName":"Error"');
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("connection lost");
  });

  it("refuses to follow a checkout URL that leaves the site insecurely, and cancels what it opened", async () => {
    vi.mocked(getBillingProvider).mockReturnValue({
      ...provider,
      startCheckout: async () => ({
        providerSubscriptionId: `fake_sub_${"b".repeat(24)}`,
        checkoutUrl: "//evil.example/pay",
      }),
    });

    await expect(startCheckoutFor(customer, NOW)).rejects.toBeInstanceOf(UnsafeCheckoutUrlError);
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledWith(`fake_sub_${"b".repeat(24)}`);
  });
});

describe("startMembershipCheckoutFor", () => {
  const INR_PLAN = { id: "plan-inr", currency: "INR", initialAmountCents: 299_900, initialTermMonths: 1, taxRateBasisPoints: 1800 } as Plan;
  const owner: GrantedCustomer = {
    user: { id: "user-a", email: "919820011223@phone.brandbasket.invalid", name: "Meera Shah", emailConfirmed: false, phone: "+919820011223" },
    tenant: { userId: "user-a", businessId: BUSINESS_ID, businessName: "Smile Dental", role: "owner" },
    billing: { status: "unpaid", hasAccess: false, subscription: null, tier: "premium", upgradePaid: false, plan: INR_PLAN, paymentUnderReview: false, renewalFailingUntil: null },
  };

  beforeEach(() => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "premium" });
    vi.mocked(findActivePlan).mockResolvedValue(INR_PLAN);
    vi.mocked(findBillingState).mockResolvedValue(billingState(null, { currency: "INR", plan: INR_PLAN }));
    // A free listing account has no project and has answered nothing.
    vi.mocked(readOnboardingSnapshot).mockResolvedValue({ ...COMPLETE, project: null, locked: false, completed: [], domain: null, logo: null });
  });

  it("opens the plan's checkout for a free listing account that has no project and no answers", async () => {
    const url = redirectUrl(await startMembershipCheckoutFor(owner, NOW, "premium"));

    expect(url.pathname).toBe("/billing/confirm");
    expect(readOnboardingSnapshot).not.toHaveBeenCalled();
    expect(events).toEqual(["tx1:begin", "tx1:commit", "provider:start", "tx2:begin", "record", "tx2:commit"]);
    expect(openCheckoutSubscription).toHaveBeenCalledWith({ name: "tx2" }, expect.objectContaining({ businessId: BUSINESS_ID, planId: "plan-inr" }));
  });

  it("opens the checkout on the discounted plan a code needs, and freezes the discount", async () => {
    const coupon: ReferralCode = {
      id: "01a0e81e-89b6-704e-a3c2-702156218f37",
      code: "SAVE500",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 50_000 },
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      createdAt: NOW,
    };
    vi.mocked(findBusinessReferralCode).mockResolvedValue(coupon);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(coupon);
    vi.mocked(ensureDiscountPlan).mockResolvedValue("plan_discounted");
    const started = vi.spyOn(provider, "startCheckout");

    redirectUrl(await startMembershipCheckoutFor(owner, NOW, "premium"));

    expect(ensureDiscountPlan).toHaveBeenCalledWith(provider, INR_PLAN, 50_000, 0);
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ providerPlanId: "plan_discounted", discountAmountCents: 50_000 }));
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      { name: "tx2" },
      expect.objectContaining({ referralCodeId: coupon.id, discountAmountCents: 50_000 }),
    );
  });

  it("refuses, logs and opens nothing when the discounted plan cannot be made", async () => {
    const coupon: ReferralCode = {
      id: "01a0e81e-89b6-704e-a3c2-702156218f38",
      code: "SAVE500",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 50_000 },
      active: true,
      expiresAt: null,
      maxRedemptions: null,
      createdAt: NOW,
    };
    vi.mocked(findBusinessReferralCode).mockResolvedValue(coupon);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(coupon);
    vi.mocked(ensureDiscountPlan).mockRejectedValue(new Error("Razorpay is down"));

    const outcome = await startMembershipCheckoutFor(owner, NOW, "premium");

    expect(outcome).toMatchObject({ kind: "refused" });
    expect(events).not.toContain("provider:start");
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("discount-plan-failed"));
  });

  it("prices the checkout from the plan whose page the owner pressed Pay on, whatever they chose at sign-up", async () => {
    await startMembershipCheckoutFor(owner, NOW, "care");
    expect(findActivePlan).toHaveBeenLastCalledWith(expect.anything(), "INR", "care");

    await startMembershipCheckoutFor(owner, NOW, "premium");
    expect(findActivePlan).toHaveBeenLastCalledWith(expect.anything(), "INR", "premium");
  });

  it("refuses a website client, who pays on Check and send, and opens nothing", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });

    await expect(startMembershipCheckoutFor(owner, NOW, "premium")).resolves.toMatchObject({
      kind: "refused",
      problem: { message: expect.stringMatching(/already a Premium member/) },
    });
    expect(events).toEqual([]);
  });

  it("shares the checkout rate limit, checked before anything is read", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    await expect(startMembershipCheckoutFor(owner, NOW, "premium")).resolves.toMatchObject({ kind: "refused" });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `checkout:business:${BUSINESS_ID}`, CHECKOUT_RATE_LIMIT);
    expect(findBusinessEntry).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("sends a business whose payment landed in the meantime to its dashboard, not to Check and send", async () => {
    newest(subscription({ status: "active", activatedAt: NOW, paidThroughAt: new Date(NOW.getTime() + 30 * 24 * HOUR_MS), planId: "plan-inr" }), {
      currency: "INR",
      plan: INR_PLAN,
      hasEverPaid: true,
    });

    await expect(startMembershipCheckoutFor(owner, NOW, "premium")).resolves.toEqual({ kind: "redirect", url: "/" });
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });

  it("sends an owner back to the unpaid checkout they left, rather than opening a second one", async () => {
    const real = createFakeBillingProvider({ secret: SECRET, now: () => NOW });
    const opened = await real.startCheckout({ businessId: BUSINESS_ID, businessName: "Smile Dental", email: owner.user.email, plan: INR_PLAN, discountAmountCents: 0 });
    newest(subscription({ planId: "plan-inr", providerSubscriptionId: opened.providerSubscriptionId }), { currency: "INR", plan: INR_PLAN });

    expect(redirectUrl(await startMembershipCheckoutFor(owner, NOW, "premium")).pathname).toBe("/billing/confirm");
    expect(openCheckoutSubscription).not.toHaveBeenCalled();
  });
});

describe("startReactivationFor", () => {
  const lapsedCustomer: GrantedCustomer = { ...customer, billing: { ...customer.billing, status: "lapsed" } };
  const COUPON: ReferralCode = {
    id: "01a0e81e-89b6-704e-a3c2-702156218f37",
    code: "SAVE500",
    currency: "USD",
    affiliateId: null,
    discount: { kind: "amount", amountCents: 500 },
    active: true,
    expiresAt: null,
    maxRedemptions: null,
    createdAt: NOW,
  };

  it("replaces the lapsed subscription with a new checkout and cancels the old one at the provider after the commit", async () => {
    const halted = subscription({ id: "sub-halted", status: "inactive", activatedAt: new Date(NOW.getTime() - 40 * 24 * HOUR_MS), paidThroughAt: new Date(NOW.getTime() - 1000) });
    newest(halted, { hasEverPaid: true });

    const url = redirectUrl(await startReactivationFor(lapsedCustomer, NOW));

    expect(url.pathname).toBe("/billing/confirm");
    expect(openCheckoutSubscription).toHaveBeenCalledWith({ name: "tx2" }, expect.objectContaining({ replacing: "sub-halted" }));
    expect(cancelled).toHaveBeenCalledWith(halted.providerSubscriptionId);
    expect(events.indexOf("provider:cancel")).toBeGreaterThan(events.indexOf("tx2:commit"));
  });

  it("takes no coupon: a returning customer pays today's full price", async () => {
    newest(subscription({ status: "cancelled", paidThroughAt: new Date(NOW.getTime() - 1000) }), { hasEverPaid: true });
    vi.mocked(findBusinessReferralCode).mockResolvedValue(COUPON);
    vi.mocked(findRedeemableReferralCode).mockResolvedValue(COUPON);
    const started = vi.spyOn(provider, "startCheckout");

    redirectUrl(await startReactivationFor(lapsedCustomer, NOW));

    expect(findBusinessReferralCode).not.toHaveBeenCalled();
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ discountAmountCents: 0 }));
    expect(openCheckoutSubscription).toHaveBeenCalledWith(
      { name: "tx2" },
      expect.objectContaining({ referralCodeId: null, discountAmountCents: 0, replacing: null }),
    );
  });

  it("sends a paid-up customer to Billing, opening nothing", async () => {
    const paid: GrantedCustomer = { ...customer, billing: { ...customer.billing, status: "paid", hasAccess: true } };
    await expect(startReactivationFor(paid, NOW)).resolves.toEqual({ kind: "redirect", url: "/billing" });
    expect(events).toEqual([]);
  });

  it("refuses a business that never paid: there is nothing to restart", async () => {
    await expect(startReactivationFor(customer, NOW)).resolves.toMatchObject({ kind: "refused" });
    expect(events).toEqual([]);
  });

  it("shares the checkout rate limit, checked before anything is read", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    await expect(startReactivationFor(lapsedCustomer, NOW)).resolves.toMatchObject({ kind: "refused" });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `checkout:business:${BUSINESS_ID}`, CHECKOUT_RATE_LIMIT);
    expect(events).toEqual([]);
  });
});
