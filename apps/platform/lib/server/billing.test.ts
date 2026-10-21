import { createHmac } from "node:crypto";
import {
  findBillingState,
  findBundledAddOnsForSubscription,
  findBusinessEntry,
  findCurrentPaymentMethod,
  findLatestSubscriptionForBusiness,
  findOpenClosureForUser,
  isPackageOfferForfeited,
  findSubscriptionByProviderId,
  listMembershipsForUser,
  withTenantScope,
  type BillingState,
  type BundledAddOn,
  type Database,
  type Plan,
  type ScopedTransaction,
  type Subscription,
} from "@brandbasket/db";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingConfigurationError, CheckoutVerificationError } from "@brandbasket/billing";
import {
  BillingRequiredError,
  findCustomerPaymentMethod,
  findReactivationNetCents,
  getBillingProvider, getRazorpayProvider, razorpayKeyId, razorpayKeySecret,
  requireBillingAccess,
} from "./billing";
import { CustomerBusinessMissingError, requireCustomerAccess } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { getSessionUser } from "./session";

// The real customer-access and billing modules run; only the database, the session and Next's redirect are doubles.
// The access rule itself is covered in packages/billing, and row-level security in packages/db.
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("./session", () => ({ getSessionUser: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ BETTER_AUTH_SECRET: "x".repeat(32) }) }));
vi.mock("@brandbasket/db", () => ({
  findBillingState: vi.fn(),
  findBundledAddOnsForSubscription: vi.fn(),
  findBusinessEntry: vi.fn(),
  findCurrentPaymentMethod: vi.fn(),
  findLatestSubscriptionForBusiness: vi.fn(),
  findOpenClosureForUser: vi.fn(),
  isPackageOfferForfeited: vi.fn(),
  findSubscriptionByProviderId: vi.fn(),
  listMembershipsForUser: vi.fn(),
  listReceiptsForBusiness: vi.fn(),
  listTaxInvoicesForPayments: vi.fn(),
  withTenantScope: vi.fn(),
}));
// The real `razorpay` package makes network calls on use; a hand-rolled double is enough since
// getBillingProvider only needs to construct it (with `new`) and hand it to wrapRazorpaySdkClient.
vi.mock("razorpay", () => ({
  default: vi.fn().mockImplementation(function FakeRazorpay(this: unknown) {
    Object.assign(this as object, {
      subscriptions: { create: vi.fn(), cancel: vi.fn() },
      payments: { fetch: vi.fn() },
    });
  }),
}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const USER = { id: "user-a", email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null };
const appDb = { name: "app-db" } as unknown as Database;
const tx = { name: "scoped-tx" } as unknown as ScopedTransaction;
const PLAN = { id: "plan-usd", currency: "USD", initialAmountCents: 22500, initialTermMonths: 3, taxRateBasisPoints: 0 } as Plan;
const DAY_MS = 24 * 60 * 60 * 1000;

function subscription(status: Subscription["status"], paidThroughAt: Date | null): Subscription {
  return { id: "sub-1", businessId: BUSINESS_ID, status, paidThroughAt } as Subscription;
}

function billingState(sub: Subscription | null, overrides: Partial<BillingState> = {}): BillingState {
  return {
    currency: "USD",
    tier: "managed",
    upgradePaid: false,
    subscription: sub,
    hasEverPaid: sub !== null && sub.status !== "incomplete",
    paymentUnderReview: false,
    plan: PLAN,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue({ name: "staff-db" } as unknown as Database);
  vi.mocked(findOpenClosureForUser).mockResolvedValue(null);
  vi.mocked(getSessionUser).mockResolvedValue(USER);
  vi.mocked(listMembershipsForUser).mockResolvedValue([
    { businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" },
  ]);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null });
});

describe("requireCustomerAccess for free listing accounts", () => {
  it("sends a listing account to its Business profile from a page that has not opted in", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "listing_only" });
    await expect(requireCustomerAccess()).rejects.toThrow("redirect:/business");
    expect(findBillingState).not.toHaveBeenCalled();
  });

  it("lets a listing account into a page that allows it", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "listing_only" });
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));
    const access = await requireCustomerAccess({ listingAccount: "allow" });
    expect(access.tenant.businessId).toBe(BUSINESS_ID);
  });

  it("lets an account opened before the question was asked into its listing pages", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: null });
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));
    expect((await requireCustomerAccess({ listingAccount: "allow" })).tenant.businessId).toBe(BUSINESS_ID);
  });
});

describe("requireCustomerAccess for an account that chose Managed Website and has not paid", () => {
  beforeEach(() => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" });
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));
  });

  it("holds it on the plan page, from a website client's page and from a listing page alike", async () => {
    await expect(requireCustomerAccess()).rejects.toThrow("redirect:/plan");
    await expect(requireCustomerAccess({ listingAccount: "allow" })).rejects.toThrow("redirect:/plan");
    expect(findBillingState).not.toHaveBeenCalled();
  });

  it("lets it into the membership page and the payment pages, which say so", async () => {
    const access = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
    expect(access.tenant.businessId).toBe(BUSINESS_ID);
    expect(access.billing.tier).toBe("managed");
  });

  it("opens the client's dashboard once the payment has made it a website client", async () => {
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: "managed" });
    expect((await requireCustomerAccess()).tenant.businessId).toBe(BUSINESS_ID);
  });
});

describe("requireCustomerAccess billing", () => {
  it("reads the business's billing through the tenant-scoped app connection", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));

    const access = await requireCustomerAccess();

    expect(withTenantScope).toHaveBeenCalledWith(appDb, { userId: USER.id, businessId: BUSINESS_ID }, expect.any(Function));
    expect(findBillingState).toHaveBeenCalledWith(tx, BUSINESS_ID);
    expect(access.billing.plan).toBe(PLAN);
  });

  it("has no access with no subscription", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));
    expect((await requireCustomerAccess()).billing).toMatchObject({ hasAccess: false, status: "unpaid" });
  });

  it("has no access with an unpaid checkout", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      billingState(subscription("incomplete", new Date(Date.now() + 30 * DAY_MS))),
    );
    expect((await requireCustomerAccess()).billing).toMatchObject({ hasAccess: false, status: "unpaid" });
  });

  it("has access with an active subscription paid into the future", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(subscription("active", new Date(Date.now() + DAY_MS))));
    expect((await requireCustomerAccess()).billing).toMatchObject({ hasAccess: true, status: "paid" });
  });

  it("has no access once the paid period is over", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(subscription("active", new Date(Date.now() - DAY_MS))));
    expect((await requireCustomerAccess()).billing).toMatchObject({ hasAccess: false, status: "lapsed" });
  });

  it("fails loudly if the customer's own business cannot be read", async () => {
    vi.mocked(findBillingState).mockResolvedValue(null);
    await expect(requireCustomerAccess()).rejects.toBeInstanceOf(CustomerBusinessMissingError);
  });

  it("sends a signed-out visitor to sign in without reading billing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(requireCustomerAccess()).rejects.toThrow("redirect:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(findBillingState).not.toHaveBeenCalled();
  });
});

describe("findCustomerPaymentMethod", () => {
  const tenant = { userId: USER.id, businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" };

  function customerBilling(status: "paid" | "lapsed" | "unpaid", provider: "razorpay" | "manual" | null): never {
    const subscription = provider === null ? null : { provider, cancelRequestedAt: null };
    return { tenant, billing: { status, subscription } } as never;
  }

  it("looks only at plan payments when the provider renews the plan by itself", async () => {
    await findCustomerPaymentMethod(customerBilling("paid", "razorpay"));
    expect(findCurrentPaymentMethod).toHaveBeenCalledWith(tx, BUSINESS_ID, { planOnly: true });
  });

  it.each([
    ["billed by hand", "paid", "manual"],
    ["lapsed", "lapsed", "razorpay"],
    ["not paid yet", "unpaid", "razorpay"],
    ["without a subscription", "unpaid", null],
  ] as const)("looks at every payment for a plan that is %s", async (_name, status, provider) => {
    await findCustomerPaymentMethod(customerBilling(status, provider));
    expect(findCurrentPaymentMethod).toHaveBeenCalledWith(tx, BUSINESS_ID, { planOnly: false });
  });
});

describe("findReactivationNetCents", () => {
  const tenant = { userId: USER.id, businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" };
  const lapsedWith = (plan: Pick<Plan, "currency">): never => ({ tenant, billing: { status: "lapsed", plan } }) as never;
  const lines = (...addOns: string[]): BundledAddOn[] => addOns.map((addOn) => ({ addOn, status: "active", endRequestedAt: null }) as BundledAddOn);

  beforeEach(() => {
    vi.mocked(getStaffDb).mockReturnValue({ name: "staff-db" } as unknown as Database);
    vi.mocked(findLatestSubscriptionForBusiness).mockResolvedValue({ id: "sub-1", status: "past_due", activatedAt: new Date(), cancelRequestedAt: null, adCreditCents: 0 } as Subscription);
    vi.mocked(isPackageOfferForfeited).mockResolvedValue(false);
  });

  it("is the net of the basket the checkout will reopen, at the offer it earns", async () => {
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue(lines("managed-website", "digital-growth", "local-seo-aeo"));
    await expect(findReactivationNetCents(lapsedWith({ currency: "INR" }))).resolves.toBe(2_660_000);
    await expect(findReactivationNetCents(lapsedWith({ currency: "USD" }))).resolves.toBe(35_000);
  });

  it("is list for a business that gave the offer up", async () => {
    vi.mocked(findBundledAddOnsForSubscription).mockResolvedValue(lines("managed-website", "local-seo-aeo"));
    vi.mocked(isPackageOfferForfeited).mockResolvedValue(true);
    await expect(findReactivationNetCents(lapsedWith({ currency: "INR" }))).resolves.toBe(2_800_000);
  });

  it("is nothing for a customer who has not lapsed", async () => {
    await expect(findReactivationNetCents({ tenant, billing: { status: "paid", plan: { currency: "INR" } } } as never)).resolves.toBeNull();
    expect(findBundledAddOnsForSubscription).not.toHaveBeenCalled();
  });
});

describe("requireBillingAccess", () => {
  it("refuses a business with no subscription", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(null));

    const error: unknown = await requireBillingAccess().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BillingRequiredError);
    expect((error as BillingRequiredError).businessId).toBe(BUSINESS_ID);
  });

  it("refuses an unpaid checkout", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      billingState(subscription("incomplete", new Date(Date.now() + 30 * DAY_MS))),
    );
    await expect(requireBillingAccess()).rejects.toBeInstanceOf(BillingRequiredError);
  });

  it("refuses a lapsed subscription", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      billingState(subscription("inactive", new Date(Date.now() + 30 * DAY_MS))),
    );
    await expect(requireBillingAccess()).rejects.toBeInstanceOf(BillingRequiredError);
  });

  it("keeps a subscription cancelled inside its paid period open until the period ends", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      billingState(subscription("cancelled", new Date(Date.now() + DAY_MS))),
    );
    await expect(requireBillingAccess()).resolves.toMatchObject({ billing: { status: "paid", hasAccess: true } });
  });

  it("refuses a subscription cancelled after its paid period", async () => {
    vi.mocked(findBillingState).mockResolvedValue(
      billingState(subscription("cancelled", new Date(Date.now() - DAY_MS))),
    );
    await expect(requireBillingAccess()).rejects.toBeInstanceOf(BillingRequiredError);
  });

  it("returns the customer when the subscription is active and paid ahead", async () => {
    vi.mocked(findBillingState).mockResolvedValue(billingState(subscription("active", new Date(Date.now() + DAY_MS))));

    const access = await requireBillingAccess();
    expect(access.tenant.businessId).toBe(BUSINESS_ID);
    expect(access.billing.hasAccess).toBe(true);
  });
});

describe("getBillingProvider", () => {
  const holder = globalThis as typeof globalThis & { brandbasketBillingProvider?: unknown };

  beforeEach(() => {
    delete holder.brandbasketBillingProvider;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete holder.brandbasketBillingProvider;
  });

  it("refuses the fake provider on a real deployment", () => {
    vi.stubEnv("BILLING_PROVIDER", "fake");
    vi.stubEnv("APP_ORIGIN", "https://app.brandbasket.in");
    vi.stubEnv("BRANDBASKET_ALLOW_FAKE_BILLING", "");
    expect(() => getBillingProvider()).toThrow(BillingConfigurationError);
  });

  it("runs the fake provider on the local verify server and on an opted-in deployment", () => {
    vi.stubEnv("BILLING_PROVIDER", "fake");
    vi.stubEnv("APP_ORIGIN", "http://app.localhost:3100");
    expect(getBillingProvider().name).toBe("fake");

    delete holder.brandbasketBillingProvider;
    vi.stubEnv("APP_ORIGIN", "https://preview.brandbasket.in");
    vi.stubEnv("BRANDBASKET_ALLOW_FAKE_BILLING", "1");
    expect(getBillingProvider().name).toBe("fake");
  });

  it("builds a real Razorpay provider when BILLING_PROVIDER=razorpay, bypassing the throwing factory stub", () => {
    vi.stubEnv("BILLING_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");

    expect(getBillingProvider().name).toBe("razorpay");
  });

  it("wires confirmCheckout's resolveBusinessId to findSubscriptionByProviderId on the staff db", async () => {
    vi.stubEnv("BILLING_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
    // No recorded subscription: resolveBusinessId returns null and confirmCheckout throws right after, so this
    // only needs to prove the wiring (staff db, "razorpay", the subscription id from the payload) without also
    // faking a payments.fetch response — that path is packages/billing's own coverage of confirmCheckout.
    vi.mocked(findSubscriptionByProviderId).mockResolvedValue(null);
    const staffDb = { name: "staff-db" } as unknown as Database;
    vi.mocked(getStaffDb).mockReturnValue(staffDb);

    const paymentId = "pay_1";
    const subscriptionId = "sub_1";
    const signature = createHmac("sha256", "rzp_test_secret").update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex");

    await expect(
      getBillingProvider().confirmCheckout({
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: subscriptionId,
        razorpay_signature: signature,
      }),
    ).rejects.toThrow(CheckoutVerificationError);
    expect(findSubscriptionByProviderId).toHaveBeenCalledWith(staffDb, "razorpay", subscriptionId);
  });

  it("throws when RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing for the razorpay provider", () => {
    vi.stubEnv("BILLING_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(() => getBillingProvider()).toThrow("RAZORPAY_KEY_ID must be set");
  });
});

describe("getRazorpayProvider", () => {
  const holder = globalThis as typeof globalThis & { brandbasketBillingProvider?: unknown; brandbasketRazorpayProvider?: unknown };

  beforeEach(() => {
    delete holder.brandbasketBillingProvider;
    delete holder.brandbasketRazorpayProvider;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete holder.brandbasketBillingProvider;
    delete holder.brandbasketRazorpayProvider;
  });

  it("is the same provider getBillingProvider gives, when that is Razorpay", () => {
    vi.stubEnv("BILLING_PROVIDER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
    expect(getRazorpayProvider()).toBe(getBillingProvider());
  });

  it("throws when payments run on another provider", () => {
    vi.stubEnv("BILLING_PROVIDER", "fake");
    vi.stubEnv("APP_ORIGIN", "http://app.localhost:3100");
    expect(() => getRazorpayProvider()).toThrow("BILLING_PROVIDER is not razorpay");
  });
});

describe("razorpayKeyId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads RAZORPAY_KEY_ID when the page is served, so the build needs no copy of it", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    expect(razorpayKeyId()).toBe("rzp_test_key");
  });

  it("throws when RAZORPAY_KEY_ID is missing", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    expect(() => razorpayKeyId()).toThrow("RAZORPAY_KEY_ID must be set");
  });
});

describe("razorpayKeySecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads RAZORPAY_KEY_SECRET when the return arrives", () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
    expect(razorpayKeySecret()).toBe("rzp_test_secret");
  });

  it("throws when RAZORPAY_KEY_SECRET is missing", () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(() => razorpayKeySecret()).toThrow("RAZORPAY_KEY_SECRET must be set");
  });
});
