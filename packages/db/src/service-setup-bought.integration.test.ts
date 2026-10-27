import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertAddOnSubscription, type NewAddOnSubscription } from "./queries/add-ons";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { listBoughtSetupServices } from "./queries/service-setup";
import { addOnSubscriptions, bundledAddOns, businesses, businessMembers, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const NOW = new Date("2026-10-27T08:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";
let subscriptionId = "";

function addOnRow(addOn: string): NewAddOnSubscription {
  return {
    id: uuidv7(),
    businessId,
    addOn,
    listAmountCents: 999_900,
    discountAmountCents: 0,
    netAmountCents: 999_900,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: 1_179_882,
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${uuidv7()}`,
  };
}

async function bundle(addOn: string, status: "pending" | "active" | "removed", endRequestedAt: Date | null = null): Promise<void> {
  await dbs.staff.db.insert(bundledAddOns).values({
    businessId,
    subscriptionId,
    addOn,
    listAmountCents: 999_900,
    netAmountCents: 999_900,
    taxRateBasisPoints: 1_800,
    status,
    endRequestedAt,
  });
}

async function setStatus(id: string, status: "scheduled" | "active" | "past_due" | "cancelled"): Promise<void> {
  await dbs.staff.db.update(addOnSubscriptions).set({ status }).where(eq(addOnSubscriptions.id, id));
}

const asStaff = (): Promise<string[]> => listBoughtSetupServices(dbs.staff.db, businessId);
const asOwner = (): Promise<string[]> =>
  withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => listBoughtSetupServices(tx, businessId));

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
    { id: OWNER, name: "Meera Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "aster-physio", name: "Aster Physio", currency: "INR" },
      { slug: "birch-dental", name: "Birch Dental", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessId = inserted.find((row) => row.slug === "aster-physio")?.id ?? "";
  otherBusinessId = inserted.find((row) => row.slug === "birch-dental")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No INR plan seeded");
  subscriptionId = (await insertSubscription(dbs.staff.db, { businessId, planId: plan.id, provider: "fake", providerSubscriptionId: "fake_sub_plan" })).id;
});

describe("listBoughtSetupServices", () => {
  it("counts a bundled add-on that is still pending, and does not count a removed one", async () => {
    await bundle("digital-growth", "pending");
    await bundle("local-seo-aeo", "removed");
    expect(await asStaff()).toEqual(["social"]);
  });

  it("does not count a bundled add-on whose end is already requested", async () => {
    await bundle("digital-growth", "active", NOW);
    expect(await asStaff()).toEqual([]);
  });

  it("counts a later add-on subscription that is active, scheduled or past due", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow("local-seo-aeo"));
    for (const status of ["active", "scheduled", "past_due"] as const) {
      await setStatus(row.id, status);
      expect(await asStaff()).toEqual(["search"]);
    }
  });

  it("does not count a cancelled or unpaid add-on subscription", async () => {
    const cancelled = await insertAddOnSubscription(dbs.staff.db, addOnRow("local-seo-aeo"));
    await setStatus(cancelled.id, "cancelled");
    await insertAddOnSubscription(dbs.staff.db, addOnRow("digital-growth"));
    expect(await asStaff()).toEqual([]);
  });

  it("gives the customer role the same answer for its own business, and nothing for another", async () => {
    await bundle("digital-growth", "active");
    const later = await insertAddOnSubscription(dbs.staff.db, addOnRow("local-seo-aeo"));
    await setStatus(later.id, "active");
    expect(await asOwner()).toEqual(["social", "search"]);
    expect(await asStaff()).toEqual(await asOwner());
    const crossed = await withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, (tx) => listBoughtSetupServices(tx, businessId));
    expect(crossed).toEqual([]);
  });
});
