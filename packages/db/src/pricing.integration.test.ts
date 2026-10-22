import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan } from "./queries/billing";
import { InvalidPriceChangeError, listPriceChanges, NoActivePlanError, updateExtraPrices } from "./queries/pricing";
import { businesses, plans, users } from "./schema";
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

describe("updateExtraPrices", () => {
  it("sets the extras on every plan in the currency, retired versions too, and logs each change", async () => {
    // A retired version of the plan, as an older price change left behind.
    const [current] = await dbs.owner.db.select().from(plans).where(eq(plans.currency, "INR"));
    if (current === undefined) throw new Error("No INR plan seeded");
    const { id: _id, ...rest } = current;
    await dbs.owner.db.insert(plans).values({ ...rest, code: "managed-inr-retired", active: false });

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
    expect((await listPriceChanges(dbs.staff.db, 10)).map((change) => change.field)).toEqual(expect.arrayContaining(["extra_hour", "extra_blog_posts"]));
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

describe("updateExtraPrices refusals", () => {
  it("refuses a nonsense price, changing nothing", async () => {
    await expect(updateExtraPrices(dbs.staff.db, { currency: "INR", prices: { extraHourAmountCents: 0 }, staffId: STAFF })).rejects.toThrow(InvalidPriceChangeError);
    expect(await listPriceChanges(dbs.staff.db, 10)).toEqual([]);
  });

  it("says which currency has no plan when there is nothing to reprice", async () => {
    await dbs.owner.db.update(plans).set({ active: false }).where(eq(plans.currency, "INR"));
    await expect(updateExtraPrices(dbs.staff.db, { currency: "INR", prices: { extraHourAmountCents: 150_000 }, staffId: STAFF })).rejects.toThrow(NoActivePlanError);
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
