import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, findPlanById, insertSubscription } from "./queries/billing";
import {
  attachProviderPlan,
  InvalidPriceChangeError,
  largestLiveReferralDiscount,
  listActivePlans,
  listPriceChanges,
  replaceMonthlyPrice,
  updateExtraPrices,
} from "./queries/pricing";
import { businesses, plans, referralCodes, users } from "./schema";
import { withTenantScope } from "./scope";
import {
  applyPremiumPrice9999Migration,
  applyPremiumPriceMigration,
  captureErrorText,
  openTestDatabases,
  resetTestDatabase,
  seedPlansFromMigrations,
  type TestDatabases,
} from "./testing";

const STAFF = "staff-1";
const OWNER = "owner-1";
const NOW = new Date("2026-10-02T09:30:00.000Z");

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff Person", email: "staff@example.com" },
    { id: OWNER, name: "Owner", email: "owner@example.com" },
  ]);
  const [business] = await dbs.staff.db
    .insert(businesses)
    .values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = business?.id ?? "";
});

async function activeInr() {
  const plan = await findActivePlan(dbs.staff.db, "INR", "premium");
  if (plan === null) throw new Error("No INR plan seeded");
  return plan;
}

describe("replaceMonthlyPrice", () => {
  it("puts a new version on sale, retires the old one, and leaves existing subscribers on their price", async () => {
    const old = await activeInr();
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: old.id,
      provider: "razorpay",
      providerSubscriptionId: "sub_old_price",
    });

    const created = await replaceMonthlyPrice(dbs.staff.db, {
      currency: "INR",
      tier: "premium",
      netMonthlyCents: 349_900,
      providerPlanId: "plan_new_price",
      staffId: STAFF,
      now: NOW,
    });

    expect(created).toMatchObject({
      code: "premium-inr-20261002-093000",
      tier: "premium",
      currency: "INR",
      recurringAmountCents: 349_900,
      initialAmountCents: 349_900,
      providerPlanId: "plan_new_price",
      taxRateBasisPoints: old.taxRateBasisPoints,
      extraHourAmountCents: old.extraHourAmountCents,
      includedBlogPosts: old.includedBlogPosts,
    });
    expect((await activeInr()).id).toBe(created.id);
    expect(await findPlanById(dbs.staff.db, old.id)).toMatchObject({ recurringAmountCents: old.recurringAmountCents });
    expect(subscription.planId).toBe(old.id);
    expect(await listPriceChanges(dbs.staff.db, 10)).toEqual([
      expect.objectContaining({
        currency: "INR",
        field: "monthly",
        oldAmountCents: old.recurringAmountCents,
        newAmountCents: 349_900,
        changedByName: "Staff Person",
      }),
    ]);
  });

  it("refuses the same price, and a nonsense one, changing nothing", async () => {
    const old = await activeInr();
    await expect(
      replaceMonthlyPrice(dbs.staff.db, {
        currency: "INR",
        tier: "premium",
        netMonthlyCents: old.recurringAmountCents,
        providerPlanId: null,
        staffId: STAFF,
        now: NOW,
      }),
    ).rejects.toThrow(InvalidPriceChangeError);
    await expect(
      replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "premium", netMonthlyCents: 0, providerPlanId: null, staffId: STAFF, now: NOW }),
    ).rejects.toThrow(InvalidPriceChangeError);
    expect((await activeInr()).id).toBe(old.id);
  });

  it("keeps exactly one plan on sale per currency and tier", async () => {
    await replaceMonthlyPrice(dbs.staff.db, { currency: "USD", tier: "premium", netMonthlyCents: 7_900, providerPlanId: null, staffId: STAFF, now: NOW });
    expect((await listActivePlans(dbs.staff.db)).map((plan) => [plan.currency, plan.tier, plan.recurringAmountCents])).toEqual([
      ["USD", "premium", 7_900],
      ["INR", "care", 299_900],
      ["INR", "premium", 999_900],
    ]);
  });

  it("reprices Care without touching Premium, and codes the new version by its tier", async () => {
    const premium = await activeInr();
    const created = await replaceMonthlyPrice(dbs.staff.db, {
      currency: "INR",
      tier: "care",
      netMonthlyCents: 199_900,
      providerPlanId: "plan_care_new",
      staffId: STAFF,
      now: NOW,
    });

    expect(created).toMatchObject({ code: "care-inr-20261002-093000", tier: "care", name: "Care", recurringAmountCents: 199_900 });
    expect(await findActivePlan(dbs.staff.db, "INR", "care")).toMatchObject({ id: created.id });
    expect((await activeInr()).id).toBe(premium.id);
  });

  it("says which tier has no plan when there is nothing to reprice", async () => {
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.tier, "care"));
    await expect(
      replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "care", netMonthlyCents: 199_900, providerPlanId: null, staffId: STAFF, now: NOW }),
    ).rejects.toThrow(/no active INR care plan/);
  });
});

describe("updateExtraPrices", () => {
  it("sets the extras on every plan in the currency, retired versions too, and logs each change", async () => {
    await replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "premium", netMonthlyCents: 349_900, providerPlanId: null, staffId: STAFF, now: NOW });

    const changed = await updateExtraPrices(dbs.staff.db, {
      currency: "INR",
      prices: { extraHourAmountCents: 150_000, extraPublishAmountCents: 30_000, extraBlogPostsAmountCents: 50_000 },
      staffId: STAFF,
    });

    // The publish price was already ₹300, so only two changed.
    expect(changed).toEqual(["extra_hour", "extra_blog_posts"]);
    const inrPlans = await dbs.staff.db.select().from(plans).where(eq(plans.currency, "INR"));
    expect(inrPlans.length).toBeGreaterThan(1);
    expect(inrPlans.every((plan) => plan.extraHourAmountCents === 150_000 && plan.extraBlogPostsAmountCents === 50_000)).toBe(true);
    const usd = await findActivePlan(dbs.staff.db, "USD", "premium");
    expect(usd?.extraHourAmountCents).toBe(1_500);
    expect((await listPriceChanges(dbs.staff.db, 10)).map((change) => change.field)).toEqual(
      expect.arrayContaining(["extra_hour", "extra_blog_posts", "monthly"]),
    );
  });

  it("changes and logs nothing when no price differs", async () => {
    const plan = await activeInr();
    expect(
      await updateExtraPrices(dbs.staff.db, {
        currency: "INR",
        prices: { extraHourAmountCents: plan.extraHourAmountCents },
        staffId: STAFF,
      }),
    ).toEqual([]);
    expect(await listPriceChanges(dbs.staff.db, 10)).toEqual([]);
  });
});

describe("who may change prices", () => {
  it("never lets a customer's connection write a plan", async () => {
    const error = await captureErrorText(
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.update(plans).set({ recurringAmountCents: 1 }).where(eq(plans.currency, "INR")),
      ),
    );
    expect(error).toMatch(/permission denied/i);
  });
});

describe("largestLiveReferralDiscount", () => {
  it("is the biggest discount on a live code in the currency", async () => {
    await dbs.staff.db.insert(referralCodes).values([
      { code: "ASHA500", currency: "INR", discountAmountCents: 50_000, createdByStaffId: STAFF },
      { code: "BIG900", currency: "INR", discountAmountCents: 90_000, createdByStaffId: STAFF, active: false },
      { code: "OLD800", currency: "INR", discountAmountCents: 80_000, createdByStaffId: STAFF, expiresAt: new Date("2026-01-01T00:00:00Z") },
      { code: "USD10", currency: "USD", discountAmountCents: 1_000, createdByStaffId: STAFF },
    ]);
    expect(await largestLiveReferralDiscount(dbs.staff.db, "INR", NOW)).toBe(50_000);
    expect(await largestLiveReferralDiscount(dbs.staff.db, "USD", NOW)).toBe(1_000);
  });

  it("leaves out percentage codes, which scale with the price", async () => {
    await dbs.staff.db.insert(referralCodes).values([
      { code: "ASHA500", currency: "INR", discountAmountCents: 50_000, createdByStaffId: STAFF },
      { code: "HALF", currency: "INR", discountKind: "percent", discountAmountCents: null, discountPercentBasisPoints: 5_000, createdByStaffId: STAFF },
    ]);
    expect(await largestLiveReferralDiscount(dbs.staff.db, "INR", NOW)).toBe(50_000);
  });

  it("is zero with no live code", async () => {
    expect(await largestLiveReferralDiscount(dbs.staff.db, "INR", NOW)).toBe(0);
  });
});

describe("Premium at ₹6,999 (migration 0110)", () => {
  /** The plans as they were before 0110, with a business ready to subscribe: Premium in rupees is ₹2,999. */
  async function beforeThePriceRise(): Promise<string> {
    await resetTestDatabase(dbs.owner);
    await seedPlansFromMigrations(dbs.owner, { withPremiumPrice: false });
    await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff Person", email: "staff@example.com" });
    const [business] = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" })
      .returning({ id: businesses.id });
    return business?.id ?? "";
  }

  it("puts a new Premium version on sale at ₹6,999 and retires the old one, which keeps its price and its subscribers", async () => {
    const business = await beforeThePriceRise();
    const old = await activeInr();
    expect(old.recurringAmountCents).toBe(299_900);
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId: business,
      planId: old.id,
      provider: "razorpay",
      providerSubscriptionId: "sub_before_rise",
    });

    await applyPremiumPriceMigration(dbs.owner);

    const now = await activeInr();
    expect(now).toMatchObject({
      code: "premium-inr-2026-10",
      tier: "premium",
      currency: "INR",
      recurringAmountCents: 699_900,
      initialAmountCents: 699_900 * old.initialTermMonths,
      initialTermMonths: old.initialTermMonths,
      // Nothing to charge it by at Razorpay until staff save it in the console.
      providerPlanId: null,
      name: old.name,
      taxRateBasisPoints: old.taxRateBasisPoints,
      extraHourAmountCents: old.extraHourAmountCents,
      extraPublishAmountCents: old.extraPublishAmountCents,
      includedChangeHours: old.includedChangeHours,
      includedPublishesPerMonth: old.includedPublishesPerMonth,
      includedBlogPosts: old.includedBlogPosts,
      blogPostBlockSize: old.blogPostBlockSize,
      extraBlogPostsAmountCents: old.extraBlogPostsAmountCents,
    });
    expect(now.id).not.toBe(old.id);
    // The old version is retired, not edited: same price, same provider plan, still the one the subscriber is on.
    expect(await findPlanById(dbs.staff.db, old.id)).toMatchObject({
      recurringAmountCents: 299_900,
      providerPlanId: old.providerPlanId,
    });
    expect((await dbs.owner.db.select({ active: plans.active }).from(plans).where(eq(plans.id, old.id)))[0]?.active).toBe(false);
    expect(subscription.planId).toBe(old.id);
    // One on sale per currency and tier, and neither Care nor the dollar plan moved.
    expect((await listActivePlans(dbs.staff.db)).map((plan) => [plan.currency, plan.tier, plan.recurringAmountCents])).toEqual([
      ["USD", "premium", 6_900],
      ["INR", "care", 299_900],
      ["INR", "premium", 699_900],
    ]);
  });

  it("does nothing where Premium is already ₹6,999", async () => {
    await beforeThePriceRise();
    const set = await replaceMonthlyPrice(dbs.staff.db, {
      currency: "INR",
      tier: "premium",
      netMonthlyCents: 699_900,
      providerPlanId: "plan_set_by_staff",
      staffId: STAFF,
      now: NOW,
    });

    await applyPremiumPriceMigration(dbs.owner);

    expect((await activeInr()).id).toBe(set.id);
    expect(await dbs.owner.db.select({ id: plans.id }).from(plans).where(eq(plans.code, "premium-inr-2026-10"))).toHaveLength(0);
  });
});

describe("Premium at ₹9,999 (migration 0164)", () => {
  /** The plans as they were after 0110 and before 0164, with a business subscribed to Premium at ₹6,999. */
  async function at6999(): Promise<{ readonly old: Awaited<ReturnType<typeof activeInr>>; readonly subscriptionPlanId: string }> {
    await resetTestDatabase(dbs.owner);
    await seedPlansFromMigrations(dbs.owner, { withPremiumPrice: false });
    await applyPremiumPriceMigration(dbs.owner);
    await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff Person", email: "staff@example.com" });
    const [business] = await dbs.staff.db.insert(businesses).values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" }).returning({ id: businesses.id });
    const old = await activeInr();
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId: business?.id ?? "",
      planId: old.id,
      provider: "razorpay",
      providerSubscriptionId: "sub_at_6999",
    });
    return { old, subscriptionPlanId: subscription.planId };
  }

  it("puts a new Premium version on sale at ₹9,999 and retires the ₹6,999 one, which keeps its price and its subscribers", async () => {
    const { old, subscriptionPlanId } = await at6999();
    expect(old).toMatchObject({ code: "premium-inr-2026-10", recurringAmountCents: 699_900 });

    await applyPremiumPrice9999Migration(dbs.owner);

    const now = await activeInr();
    expect(now).toMatchObject({
      code: "premium-inr-2026-10-9999",
      tier: "premium",
      currency: "INR",
      recurringAmountCents: 999_900,
      initialAmountCents: 999_900 * old.initialTermMonths,
      initialTermMonths: old.initialTermMonths,
      // The fake provider needs none; Razorpay's is made when staff save the price in the console.
      providerPlanId: null,
      name: old.name,
      taxRateBasisPoints: 1_800,
      extraHourAmountCents: old.extraHourAmountCents,
      includedChangeHours: old.includedChangeHours,
      includedBlogPosts: old.includedBlogPosts,
    });
    expect(now.id).not.toBe(old.id);
    // Retired, not edited: same price, and still the plan the existing subscriber is on.
    expect(await findPlanById(dbs.staff.db, old.id)).toMatchObject({ recurringAmountCents: 699_900, providerPlanId: old.providerPlanId });
    expect((await dbs.owner.db.select({ active: plans.active }).from(plans).where(eq(plans.id, old.id)))[0]?.active).toBe(false);
    expect(subscriptionPlanId).toBe(old.id);
    expect((await listActivePlans(dbs.staff.db)).map((plan) => [plan.currency, plan.tier, plan.recurringAmountCents])).toEqual([
      ["USD", "premium", 6_900],
      ["INR", "care", 299_900],
      ["INR", "premium", 999_900],
    ]);
  });

  it("does nothing where Premium is already ₹9,999", async () => {
    await at6999();
    const set = await replaceMonthlyPrice(dbs.staff.db, {
      currency: "INR",
      tier: "premium",
      netMonthlyCents: 999_900,
      providerPlanId: "plan_set_by_staff",
      staffId: STAFF,
      now: NOW,
    });

    await applyPremiumPrice9999Migration(dbs.owner);

    expect((await activeInr()).id).toBe(set.id);
    expect(await dbs.owner.db.select({ id: plans.id }).from(plans).where(eq(plans.code, "premium-inr-2026-10-9999"))).toHaveLength(0);
  });
});

describe("attachProviderPlan", () => {
  it("gives a plan with no provider plan its provider plan, and changes nothing else about it", async () => {
    // The seeded Premium is 0110's version, which has no provider plan until staff save it in the console.
    const plan = await activeInr();
    expect(plan.providerPlanId).toBeNull();

    expect(await attachProviderPlan(dbs.staff.db, { planId: plan.id, providerPlanId: "plan_razorpay_1" })).toBe(true);

    expect(await findPlanById(dbs.staff.db, plan.id)).toMatchObject({
      providerPlanId: "plan_razorpay_1",
      recurringAmountCents: plan.recurringAmountCents,
      initialAmountCents: plan.initialAmountCents,
    });
    expect((await activeInr()).id).toBe(plan.id);
  });

  it("never replaces a provider plan a plan already has, and says so", async () => {
    const plan = await replaceMonthlyPrice(dbs.staff.db, {
      currency: "INR",
      tier: "premium",
      netMonthlyCents: 399_900,
      providerPlanId: "plan_first",
      staffId: STAFF,
      now: NOW,
    });

    expect(await attachProviderPlan(dbs.staff.db, { planId: plan.id, providerPlanId: "plan_second" })).toBe(false);

    expect((await findPlanById(dbs.staff.db, plan.id))?.providerPlanId).toBe("plan_first");
  });

  it("answers false for a plan that does not exist", async () => {
    expect(await attachProviderPlan(dbs.staff.db, { planId: "00000000-0000-4000-8000-000000000000", providerPlanId: "plan_x" })).toBe(false);
  });
});
