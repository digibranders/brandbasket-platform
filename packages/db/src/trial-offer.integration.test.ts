import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { businessHasHadService } from "./queries/bundled-add-ons";
import { addOnSubscriptions, bundledAddOns, businesses } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

// The first-month offer (docs/plans/63-one-rupee-trial.md in the BrandBasket workspace): who has had a plan, and the
// database rules that keep a business to one trial per plan.

let dbs: TestDatabases;
let businessId = "";
let subscriptionId = "";

const PAID_AT = new Date("2026-11-11T06:00:00.000Z");
const TRIAL_END = new Date("2026-12-11T06:00:00.000Z");
const PRICE = 299_900;

function line(addOn: string, extra: Partial<typeof bundledAddOns.$inferInsert> = {}): typeof bundledAddOns.$inferInsert {
  return { businessId, subscriptionId, addOn, listAmountCents: PRICE, netAmountCents: PRICE, taxRateBasisPoints: 1800, ...extra };
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const [business] = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = business?.id ?? "";
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR plan was seeded");
  const subscription = await insertSubscription(dbs.staff.db, { businessId, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_trial" });
  subscriptionId = subscription.id;
});

describe("businessHasHadService", () => {
  it("is false for a business that never had the plan, or only opened a checkout for it", async () => {
    expect(await businessHasHadService(dbs.staff.db, businessId, "social-media")).toBe(false);
    await dbs.owner.db.insert(bundledAddOns).values(line("social-media", { status: "removed" }));
    expect(await businessHasHadService(dbs.staff.db, businessId, "social-media")).toBe(false);
  });

  it("is true once a line of the plan was paid, even after it was removed", async () => {
    await dbs.owner.db.insert(bundledAddOns).values(line("social-media", { status: "removed", activatedAt: PAID_AT }));
    expect(await businessHasHadService(dbs.staff.db, businessId, "social-media")).toBe(true);
  });

  it("is true once a trial of the plan ran", async () => {
    await dbs.owner.db.insert(bundledAddOns).values(line("paid-ads", { status: "removed", trialPriceCents: 100, trialEndsAt: TRIAL_END }));
    expect(await businessHasHadService(dbs.staff.db, businessId, "paid-ads")).toBe(true);
  });

  it("counts an activated add-on subscription from the older model", async () => {
    await dbs.owner.db.insert(addOnSubscriptions).values({
      businessId,
      addOn: "social-media",
      listAmountCents: PRICE,
      netAmountCents: PRICE,
      taxRateBasisPoints: 1800,
      chargedAmountCents: PRICE,
      currency: "INR",
      provider: "fake",
      providerSubscriptionId: "fake_addon_old",
      status: "cancelled",
      activatedAt: PAID_AT,
    });
    expect(await businessHasHadService(dbs.staff.db, businessId, "social-media")).toBe(true);
  });

  it("looks only at the plan asked about, and refuses ids that are not business ids", async () => {
    await dbs.owner.db.insert(bundledAddOns).values(line("managed-website", { status: "active", activatedAt: PAID_AT }));
    expect(await businessHasHadService(dbs.staff.db, businessId, "social-media")).toBe(false);
    expect(await businessHasHadService(dbs.staff.db, "not-a-uuid", "managed-website")).toBe(false);
  });
});

describe("trial lines in the database", () => {
  it("allows one trial per business per plan, ever", async () => {
    await dbs.owner.db.insert(bundledAddOns).values(line("social-media", { status: "removed", activatedAt: PAID_AT, trialPriceCents: 100, trialEndsAt: TRIAL_END }));
    await expect(dbs.owner.db.insert(bundledAddOns).values(line("social-media", { trialPriceCents: 100 }))).rejects.toThrow();
  });

  it("frees the trial again when a trial checkout was opened and never paid", async () => {
    await dbs.owner.db.insert(bundledAddOns).values(line("social-media", { status: "removed", trialPriceCents: 100 }));
    await expect(dbs.owner.db.insert(bundledAddOns).values(line("social-media", { trialPriceCents: 100 }))).resolves.toBeDefined();
  });

  it("keeps the trial to Social Media and Paid Ads", async () => {
    await expect(dbs.owner.db.insert(bundledAddOns).values(line("managed-website", { trialPriceCents: 100 }))).rejects.toThrow();
  });

  it("never records a trial end without a trial price", async () => {
    await expect(dbs.owner.db.insert(bundledAddOns).values(line("paid-ads", { trialEndsAt: TRIAL_END }))).rejects.toThrow();
  });
});
