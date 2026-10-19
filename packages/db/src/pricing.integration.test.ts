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
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
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
      tier: "managed",
      netMonthlyCents: 349_900,
      providerPlanId: "plan_new_price",
      staffId: STAFF,
      now: NOW,
    });

    expect(created).toMatchObject({
      code: "managed-inr-20261002-093000",
      tier: "managed",
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
        tier: "managed",
        netMonthlyCents: old.recurringAmountCents,
        providerPlanId: null,
        staffId: STAFF,
        now: NOW,
      }),
    ).rejects.toThrow(InvalidPriceChangeError);
    await expect(
      replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "managed", netMonthlyCents: 0, providerPlanId: null, staffId: STAFF, now: NOW }),
    ).rejects.toThrow(InvalidPriceChangeError);
    expect((await activeInr()).id).toBe(old.id);
  });

  it("keeps exactly one plan on sale per currency and tier", async () => {
    await replaceMonthlyPrice(dbs.staff.db, { currency: "USD", tier: "managed", netMonthlyCents: 7_900, providerPlanId: null, staffId: STAFF, now: NOW });
    expect((await listActivePlans(dbs.staff.db)).map((plan) => [plan.currency, plan.tier, plan.recurringAmountCents])).toEqual([
      ["USD", "managed", 7_900],
      ["INR", "managed", 299_900],
    ]);
  });

  it("says which tier has no plan when there is nothing to reprice", async () => {
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.currency, "INR"));
    await expect(
      replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "managed", netMonthlyCents: 199_900, providerPlanId: null, staffId: STAFF, now: NOW }),
    ).rejects.toThrow(/no active INR managed plan/);
  });
});

describe("updateExtraPrices", () => {
  it("sets the extras on every plan in the currency, retired versions too, and logs each change", async () => {
    await replaceMonthlyPrice(dbs.staff.db, { currency: "INR", tier: "managed", netMonthlyCents: 349_900, providerPlanId: null, staffId: STAFF, now: NOW });

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
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    expect(usd?.extraHourAmountCents).toBe(1_000);
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

describe("attachProviderPlan", () => {
  it("gives a plan with no provider plan its provider plan, and changes nothing else about it", async () => {
    // The seeded Managed Website plan has no provider plan until staff save it in the console.
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
      tier: "managed",
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
