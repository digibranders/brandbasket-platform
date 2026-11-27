import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearPriceOverride, listPriceOverridesForBusiness, upsertPriceOverride } from "./queries/price-overrides";
import { businesses, businessPriceOverrides, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

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
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    { id: OWNER, name: "Asha", email: "asha@example.com" },
  ]);
  const [row] = await dbs.staff.db.insert(businesses).values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" }).returning({ id: businesses.id });
  businessId = row?.id ?? "";
});

describe("business price overrides", () => {
  it("keeps one price per business, service and period, and replaces it on a second set", async () => {
    await upsertPriceOverride(dbs.staff.db, { businessId, addOn: "social-media", billingInterval: "month", netCents: 99_900, setByStaffId: STAFF });
    await upsertPriceOverride(dbs.staff.db, { businessId, addOn: "social-media", billingInterval: "month", netCents: 149_900, setByStaffId: STAFF });
    await upsertPriceOverride(dbs.staff.db, { businessId, addOn: "social-media", billingInterval: "year", netCents: 999_000 });

    const listed = await listPriceOverridesForBusiness(dbs.staff.db, businessId);

    expect(listed.map((row) => [row.addOn, row.billingInterval, row.netCents])).toEqual([
      ["social-media", "month", 149_900],
      ["social-media", "year", 999_000],
    ]);
  });

  it("clears one price and reports whether there was one", async () => {
    await upsertPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "month", netCents: 100 });

    expect(await clearPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "month" })).toBe(true);
    expect(await clearPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "month" })).toBe(false);
    expect(await listPriceOverridesForBusiness(dbs.staff.db, businessId)).toEqual([]);
  });

  it("refuses an unknown service, an unknown period and a price of zero or less", async () => {
    await expect(upsertPriceOverride(dbs.staff.db, { businessId, addOn: "seo", billingInterval: "month", netCents: 100 })).rejects.toThrow();
    await expect(upsertPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "week" as "month", netCents: 100 })).rejects.toThrow();
    await expect(upsertPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "month", netCents: 0 })).rejects.toThrow();
  });

  it("is staff-only: the customer's connection can neither read nor write it", async () => {
    await upsertPriceOverride(dbs.staff.db, { businessId, addOn: "paid-ads", billingInterval: "month", netCents: 100 });

    const read = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select().from(businessPriceOverrides)));
    const write = await captureErrorText(
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.insert(businessPriceOverrides).values({ businessId, addOn: "paid-ads", billingInterval: "year", netCents: 1 })),
    );

    expect(read).toMatch(/permission denied/i);
    expect(write).toMatch(/permission denied/i);
  });
});
