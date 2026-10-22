import { chargedAmountCents, createFakeBillingProvider, FAKE_KEEP_CONFIRM_PATH, type BillingProvider } from "@brandbasket/billing";
import {
  businessMembers,
  businesses,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findBillingState,
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  findOpenClosureForUser,
  findPaymentByProviderId,
  findSubscriptionById,
  findWaitingSuccessor,
  listAffiliateEarnings,
  markCancelRequested,
  openAccountClosure,
  openCheckoutSubscription,
  subscriptions,
  users,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { summariseBilling } from "@brandbasket/shared/lib/billing/status";
import { activateFirstPayment } from "@brandbasket/shared/server/billing-activation";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Keep my plan, through the real checkout, the real confirmation and the real webhook handler on a real database, with the
 * fake provider standing in for Razorpay: the offer, what the new mandate is made of, what a checkout left unfinished
 * changes (nothing), that the client never loses access across the switch, and that the first charge of the kept plan is a
 * renewal of the one they cancelled.
 */

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null, providerName: "fake" as "fake" | "razorpay" }));
const fetchSubscriptionStatus = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
  getAppDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.app.db;
  },
}));
vi.mock("./billing", () => ({
  getBillingProvider: () => provider(),
  getRazorpayProvider: () => ({ name: "razorpay", fetchSubscriptionStatus }),
}));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));

import { loadKeepPlanOffered, startKeepPlanFor, confirmKeptPlan, verifyKeepCheckoutFor } from "./keep-plan";
import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const USER_ID = "keeper";
const USER = { id: USER_ID, email: "keeper@example.com" };
const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
const NOW = new Date("2026-11-05T06:00:00.000Z");
/** The old paid month ends here: the new mandate's start day. */
const RENEWS_AT = new Date("2026-11-19T00:00:00.000Z");
const NEXT_RENEWAL = new Date("2026-12-19T00:00:00.000Z");
const OLD_PROVIDER_ID = `fake_sub_${"a".repeat(24)}`;
const AD_CREDIT_CENTS = 100_000;

let businessId = "";
let managed: Plan;
let affiliateId = "";
let codeId = "";
let cancelSubscription: ReturnType<typeof vi.fn<BillingProvider["cancelSubscription"]>>;

function dbs(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

/** The fake provider, answering to Razorpay's name when a test needs the webhook's lookups to find its rows. */
function provider(): BillingProvider {
  const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => NOW });
  return {
    ...real,
    name: state.providerName,
    cancelSubscription,
    createPlan: async (input) => ({ providerPlanId: `plan_${input.code}` }),
  };
}

function linesOf(...services: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(services, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

/** Website and Social at the package price, a ₹300 code with 5 months left and an ad credit, paid on 19 Oct. */
async function paidPlan(provider: "fake" | "razorpay"): Promise<Subscription> {
  const db = dbs().staff.db;
  const opened = await openCheckoutSubscription(db, {
    businessId,
    planId: managed.id,
    provider,
    providerSubscriptionId: OLD_PROVIDER_ID,
    referralCodeId: codeId,
    discountAmountCents: 30_000,
    discountMonthsLeft: 5,
    adCreditCents: AD_CREDIT_CENTS,
    bundledAddOns: linesOf("managed-website", "digital-growth"),
    replacing: null,
    now: PAID_AT,
  });
  await db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: opened.id,
      plan: managed,
      provider,
      providerPaymentId: "pay_first",
      paidAt: PAID_AT,
      discountAmountCents: 30_000,
    }),
  );
  const paid = await findSubscriptionById(db, opened.id);
  if (paid === null) throw new Error("The first payment left no subscription");
  return paid;
}

/** The client asked to close the account on 5 Nov: the plan is cancelled at its cycle end and the account is locked. */
async function closeAccount(subscription: Subscription): Promise<void> {
  await dbs().staff.db.transaction(async (tx) => {
    await markCancelRequested(tx, { subscriptionId: subscription.id, businessId, now: NOW });
    await openAccountClosure(tx, { userId: USER_ID, businessId, now: NOW, eraseAfter: new Date("2026-12-19T00:00:00.000Z") });
  });
}

async function kept(): Promise<Subscription> {
  const old = await findLatestSubscriptionForBusiness(dbs().staff.db, businessId);
  const waiting = old === null ? null : await findWaitingSuccessor(dbs().staff.db, old.id);
  if (waiting === null) throw new Error("No keep checkout is waiting");
  return waiting;
}

/** What Razorpay takes on the start day: the plan's price less the code, GST on top. */
function renewalAmount(): number {
  return chargedAmountCents(managed.recurringAmountCents + 1_039_800, 30_000, managed.taxRateBasisPoints);
}

function firstCharge(successor: Subscription, amountCents = renewalAmount(), paymentId = "pay_kept_first") {
  return {
    kind: "charged",
    subscriptionId: successor.providerSubscriptionId,
    paymentId,
    amountCents,
    currency: "INR",
    paidAt: RENEWS_AT,
    currentStart: RENEWS_AT,
    currentEnd: NEXT_RENEWAL,
    method: null,
  } as const;
}

beforeAll(() => {
  state.dbs = openTestDatabases();
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  const { owner, staff } = dbs();
  state.providerName = "fake";
  cancelSubscription = vi.fn<BillingProvider["cancelSubscription"]>(async () => undefined);
  fetchSubscriptionStatus.mockReset();
  await resetTestDatabase(owner);
  await seedPlansFromMigrations(owner);
  const plan = await findActivePlan(staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  managed = plan;
  await owner.db.insert(users).values([
    { id: USER_ID, name: "Meera", email: "keeper@example.com", emailVerified: true },
    { id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true },
  ]);
  const rows = await owner.db.insert(businesses).values({ slug: "aster-physio", name: "Aster Physio", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  await owner.db.insert(businessMembers).values({ businessId, userId: USER_ID, role: "owner" });
  const affiliate = await createAffiliate(staff.db, {
    name: "Asha Nair",
    email: "asha@example.com",
    phone: null,
    reward: { kind: "percent", basisPoints: 500 },
    rewardCurrency: null,
    rewardCycles: null,
    notes: null,
    createdByStaffId: "staff-code",
  });
  affiliateId = affiliate.id;
  const code = await createReferralCode(staff.db, {
    code: "ASHA",
    currency: "INR",
    affiliateId,
    discount: { kind: "amount", amountCents: 30_000 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: "staff-code",
  });
  codeId = code.id;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when Keep my plan is offered", () => {
  it("is offered for the client's own cancel inside the paid month, and only then", async () => {
    const old = await paidPlan("fake");
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(false); // not closing

    await dbs().staff.db.transaction((tx) => openAccountClosure(tx, { userId: USER_ID, businessId, now: NOW, eraseAfter: NEXT_RENEWAL }));
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(false); // closing, but the plan was never cancelled: nothing to keep

    await dbs().staff.db.transaction((tx) => markCancelRequested(tx, { subscriptionId: old.id, businessId, now: NOW }));
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(true);
    expect(await loadKeepPlanOffered(USER_ID, RENEWS_AT)).toBe(false); // the paid month is over
  });

  it("is not offered for a plan the provider ended, or for a lapse the client did not ask for", async () => {
    await paidPlan("fake");
    await dbs().staff.db.transaction((tx) => openAccountClosure(tx, { userId: USER_ID, businessId, now: NOW, eraseAfter: NEXT_RENEWAL }));
    await dbs().owner.db.update(subscriptions).set({ status: "inactive" });
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(false);
    await dbs().owner.db.update(subscriptions).set({ status: "cancelled", cancelRequestedAt: NOW });
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(false);
  });

  it("is not offered once a new mandate is authorised, because the account is open again", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    await confirmKeptPlan((await kept()).id, NOW);

    expect(await findOpenClosureForUser(dbs().staff.db, USER_ID)).toBeNull();
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(false);
  });
});

describe("the checkout Keep my plan opens", () => {
  it("is a new mandate for the same plan, lines, prices, code, months and credit, starting when the paid month ends", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);

    const outcome = await startKeepPlanFor(USER, NOW);

    expect(outcome.kind === "redirect" ? outcome.url : "").toMatch(new RegExp(`^${FAKE_KEEP_CONFIRM_PATH}\\?token=`));
    const successor = await kept();
    expect(successor).toMatchObject({
      continuesId: old.id,
      startAt: RENEWS_AT,
      status: "incomplete",
      activatedAt: null,
      planId: old.planId,
      referralCodeId: codeId,
      discountAmountCents: 30_000,
      discountMonthsLeft: 5,
      adCreditCents: AD_CREDIT_CENTS,
      bundledAddOnNetCents: 1_039_800,
      commitmentEndsAt: old.commitmentEndsAt,
    });
    expect(successor.providerSubscriptionId).not.toBe(old.providerSubscriptionId);
    const lines = await findBundledAddOnsForSubscription(dbs().staff.db, successor.id);
    expect(lines.map((line) => [line.addOn, line.listAmountCents, line.offerDiscountAmountCents, line.netAmountCents, line.status])).toEqual([
      ["managed-website", 299_900, 59_980, 239_920, "pending"],
      ["digital-growth", 999_900, 200_020, 799_880, "pending"],
    ]);
  });

  it("leaves the closure, the cancel and the old plan exactly as they were while it is unfinished", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);

    await startKeepPlanFor(USER, NOW);

    expect(await findOpenClosureForUser(dbs().staff.db, USER_ID)).not.toBeNull();
    const latest = await findLatestSubscriptionForBusiness(dbs().staff.db, businessId);
    expect(latest).toMatchObject({ id: old.id, cancelRequestedAt: NOW, paidThroughAt: RENEWS_AT });
    // Still offered, and the services are still the old plan's alone.
    expect(await loadKeepPlanOffered(USER_ID, NOW)).toBe(true);
    const state = await findBillingState(dbs().staff.db, businessId);
    expect(state?.addOns.map((line) => line.subscriptionId)).toEqual([old.id, old.id]);
  });

  it("replaces an earlier checkout that was never authorised, and cancels it at the provider", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    const first = await kept();

    await startKeepPlanFor(USER, NOW);

    const second = await kept();
    expect(second.id).not.toBe(first.id);
    expect((await findSubscriptionById(dbs().staff.db, first.id))?.status).toBe("cancelled");
    expect(cancelSubscription).toHaveBeenCalledWith(first.providerSubscriptionId);
  });

  it("is refused for an account that is not closing, or whose plan was not cancelled", async () => {
    const old = await paidPlan("fake");
    expect(await startKeepPlanFor(USER, NOW)).toEqual({ kind: "refused", reason: "changed" });
    await dbs().staff.db.transaction((tx) => openAccountClosure(tx, { userId: USER_ID, businessId, now: NOW, eraseAfter: NEXT_RENEWAL }));
    expect(await startKeepPlanFor(USER, NOW)).toEqual({ kind: "refused", reason: "changed" });
    expect(await findWaitingSuccessor(dbs().staff.db, old.id)).toBeNull();
  });
});

describe("confirming the new mandate, with the fake provider", () => {
  it("accepts only the signed-in account's own checkout", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);
    const outcome = await startKeepPlanFor(USER, NOW);
    const token = new URL(outcome.kind === "redirect" ? outcome.url : "", "http://localhost").searchParams.get("token");

    const verified = await verifyKeepCheckoutFor(provider(), USER_ID, { token });
    expect(verified).toMatchObject({ amountCents: renewalAmount(), currency: "INR" });
    expect(await verifyKeepCheckoutFor(provider(), "someone-else", { token })).toBeNull();
    expect(await verifyKeepCheckoutFor(provider(), USER_ID, { token: "nope" })).toBeNull();
  });

  it("restores the account, clears the cancel and shows the plan running, while the old plan stays the current one", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    const successor = await kept();

    expect(await confirmKeptPlan(successor.id, NOW)).toBe(true);

    expect(await findOpenClosureForUser(dbs().staff.db, USER_ID)).toBeNull();
    expect(await findSubscriptionById(dbs().staff.db, successor.id)).toMatchObject({ status: "active", activatedAt: null, paidThroughAt: null });
    const latest = await findLatestSubscriptionForBusiness(dbs().staff.db, businessId);
    expect(latest).toMatchObject({ id: old.id, cancelRequestedAt: null, status: "active" });
    const stateNow = await findBillingState(dbs().staff.db, businessId);
    expect(stateNow).not.toBeNull();
    if (stateNow !== null) {
      const billing = summariseBilling(stateNow, NOW);
      expect(billing).toMatchObject({ status: "paid", hasAccess: true });
    }
  });

  it("changes nothing a second time, and nothing for a subscription that is not a kept plan", async () => {
    const old = await paidPlan("fake");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    const successor = await kept();
    await confirmKeptPlan(successor.id, NOW);

    expect(await confirmKeptPlan(successor.id, new Date("2026-11-06T00:00:00.000Z"))).toBe(true);
    expect(await confirmKeptPlan(old.id, NOW)).toBe(false);
    expect((await findSubscriptionById(dbs().staff.db, old.id))?.cancelRequestedAt).toBeNull();
  });
});

describe("the first charge of a kept plan", () => {
  async function authorised(): Promise<{ readonly old: Subscription; readonly successor: Subscription }> {
    state.providerName = "razorpay";
    const old = await paidPlan("razorpay");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    const successor = await kept();
    fetchSubscriptionStatus.mockResolvedValue("authenticated");
    await handleRazorpayWebhookEvent({ kind: "status", subscriptionId: successor.providerSubscriptionId, providerStatus: "authenticated" });
    return { old, successor };
  }

  it("lifts the closure when Razorpay reports the mandate authenticated", async () => {
    const { old, successor } = await authorised();

    expect(await findOpenClosureForUser(dbs().staff.db, USER_ID)).toBeNull();
    expect(await findSubscriptionById(dbs().staff.db, successor.id)).toMatchObject({ status: "active", providerStatus: "authenticated", activatedAt: null });
    expect(await findSubscriptionById(dbs().staff.db, old.id)).toMatchObject({ cancelRequestedAt: null });
  });

  it("keeps the old plan the current one, with access, until the first charge is recorded", async () => {
    const { old } = await authorised();

    const latest = await findLatestSubscriptionForBusiness(dbs().staff.db, businessId);
    expect(latest?.id).toBe(old.id);
    const stateNow = await findBillingState(dbs().staff.db, businessId);
    expect(stateNow && summariseBilling(stateNow, new Date("2026-11-18T23:59:00.000Z")).hasAccess).toBe(true);
  });

  it("is recorded as a renewal of the cancelled plan: no new commitment, the code's months and the credit kept", async () => {
    const { old, successor } = await authorised();

    await handleRazorpayWebhookEvent(firstCharge(successor));

    const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_kept_first");
    expect(payment).toMatchObject({ kind: "renewal", amountCents: renewalAmount(), attentionReason: null, subscriptionId: successor.id });
    const started = await findSubscriptionById(dbs().staff.db, successor.id);
    expect(started).toMatchObject({
      status: "active",
      activatedAt: RENEWS_AT,
      paidThroughAt: NEXT_RENEWAL,
      commitmentEndsAt: old.commitmentEndsAt,
      discountAmountCents: 30_000,
      discountMonthsLeft: 5,
      adCreditCents: AD_CREDIT_CENTS,
    });
    const earnings = await listAffiliateEarnings(dbs().staff.db, affiliateId, 10);
    expect(earnings.map((earning) => earning.paymentKind)).toEqual(["renewal", "initial"]);
    expect(earnings[0]?.basisCents).toBe(earnings[1]?.basisCents);
  });

  it("makes the new plan the current one, with its lines billed and the old plan's lines ended", async () => {
    const { old, successor } = await authorised();

    await handleRazorpayWebhookEvent(firstCharge(successor));

    const latest = await findLatestSubscriptionForBusiness(dbs().staff.db, businessId);
    expect(latest?.id).toBe(successor.id);
    const newLines = await findBundledAddOnsForSubscription(dbs().staff.db, successor.id);
    expect(newLines.map((line) => [line.addOn, line.status])).toEqual([
      ["managed-website", "active"],
      ["digital-growth", "active"],
    ]);
    const oldLines = await findBundledAddOnsForSubscription(dbs().staff.db, old.id);
    expect(oldLines.every((line) => line.status === "removed")).toBe(true);
    const stateNow = await findBillingState(dbs().staff.db, businessId);
    expect(stateNow?.addOns.map((line) => line.subscriptionId)).toEqual([successor.id, successor.id]);
    // The client has access through the old month's end and on through the new one.
    expect(stateNow && summariseBilling(stateNow, new Date("2026-11-19T00:00:01.000Z")).hasAccess).toBe(true);
    expect(stateNow && summariseBilling(stateNow, new Date("2026-12-18T00:00:00.000Z")).hasAccess).toBe(true);
  });

  it("records a redelivery of the same charge once", async () => {
    const { successor } = await authorised();

    await handleRazorpayWebhookEvent(firstCharge(successor));
    await handleRazorpayWebhookEvent(firstCharge(successor));

    const paid = await dbs().owner.db.query.payments.findMany({ where: (table, { eq }) => eq(table.subscriptionId, successor.id) });
    expect(paid).toHaveLength(1);
    expect(await findSubscriptionById(dbs().staff.db, successor.id)).toMatchObject({ discountMonthsLeft: 5, paidThroughAt: NEXT_RENEWAL });
  });

  it("is kept for staff, and starts nothing, when the amount is not the old renewal's", async () => {
    const { successor } = await authorised();

    await handleRazorpayWebhookEvent(firstCharge(successor, renewalAmount() + 100));

    const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_kept_first");
    expect(payment).toMatchObject({ attentionReason: "amount_mismatch" });
    expect(await findSubscriptionById(dbs().staff.db, successor.id)).toMatchObject({ activatedAt: null, paidThroughAt: null });
  });

  it("lifts the closure itself when the charge arrives before the mandate's own event", async () => {
    state.providerName = "razorpay";
    const old = await paidPlan("razorpay");
    await closeAccount(old);
    await startKeepPlanFor(USER, NOW);
    const successor = await kept();

    await handleRazorpayWebhookEvent(firstCharge(successor));

    expect(await findOpenClosureForUser(dbs().staff.db, USER_ID)).toBeNull();
    expect(await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_kept_first")).toMatchObject({ kind: "renewal", attentionReason: null });
  });
});
