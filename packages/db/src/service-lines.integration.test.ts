import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { listLiveServiceLines } from "./queries/bundled-add-ons";
import { bundledAddOns, businesses } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

let dbs: TestDatabases;
let businessId = "";
let subscriptionId = "";

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
  const subscription = await insertSubscription(dbs.staff.db, { businessId, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_lines" });
  subscriptionId = subscription.id;
});

describe("listLiveServiceLines", () => {
  it("lists each business's pending and active lines with their status and net amount, and leaves out removed ones", async () => {
    await dbs.owner.db.insert(bundledAddOns).values([
      { businessId, subscriptionId, addOn: "managed-website", listAmountCents: 299_900, netAmountCents: 299_900, taxRateBasisPoints: 1800, status: "active" },
      { businessId, subscriptionId, addOn: "digital-growth", listAmountCents: 999_900, netAmountCents: 999_900, taxRateBasisPoints: 1800, status: "pending" },
      { businessId, subscriptionId, addOn: "local-seo-aeo", listAmountCents: 2_499_900, netAmountCents: 2_499_900, taxRateBasisPoints: 1800, status: "removed" },
    ]);

    expect(await listLiveServiceLines(dbs.staff.db, [businessId])).toEqual([
      { businessId, addOn: "managed-website", netAmountCents: 299_900, status: "active" },
      { businessId, addOn: "digital-growth", netAmountCents: 999_900, status: "pending" },
    ]);
  });

  it("returns nothing for no ids, and ignores ids that are not business ids", async () => {
    expect(await listLiveServiceLines(dbs.staff.db, [])).toEqual([]);
    expect(await listLiveServiceLines(dbs.staff.db, ["not-a-uuid"])).toEqual([]);
  });
});
