import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findBusinessSlug, saveFreeAddressForBusiness } from "./queries/staff-domains";
import { businesses, domains } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function makeBusiness(slug: string): Promise<string> {
  const [business] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  return business.id;
}

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("saveFreeAddressForBusiness", () => {
  it("saves a pending primary free address for a business with no domain", async () => {
    const businessId = await makeBusiness("harbour-bakery");

    expect(await saveFreeAddressForBusiness(dbs.staff.db, { businessId, hostname: "Harbour-Bakery.Sites.Example.in" })).toBe("saved");

    const rows = await dbs.owner.db.select().from(domains).where(eq(domains.businessId, businessId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hostname: "harbour-bakery.sites.example.in", isPrimary: true, status: "pending", removedAt: null });
    expect(rows[0]?.ownerConfirmedAt).toBeInstanceOf(Date);
  });

  it("leaves an existing primary domain as it is", async () => {
    const businessId = await makeBusiness("birch-dental");
    await dbs.staff.db.insert(domains).values({ businessId, hostname: "birchdental.in", isPrimary: true, status: "active" });

    expect(await saveFreeAddressForBusiness(dbs.staff.db, { businessId, hostname: "birch-dental.sites.example.in" })).toBe("exists");

    const rows = await dbs.owner.db.select({ hostname: domains.hostname }).from(domains).where(eq(domains.businessId, businessId));
    expect(rows).toEqual([{ hostname: "birchdental.in" }]);
  });

  it("refuses a hostname another business holds, and saves nothing for this one", async () => {
    const holder = await makeBusiness("lotus-cafe");
    const businessId = await makeBusiness("lotus-kitchen");
    await dbs.staff.db.insert(domains).values({ businessId: holder, hostname: "lotus.sites.example.in", isPrimary: true, status: "active" });

    expect(await saveFreeAddressForBusiness(dbs.staff.db, { businessId, hostname: "lotus.sites.example.in" })).toBe("taken");

    expect(await dbs.owner.db.select().from(domains).where(eq(domains.businessId, businessId))).toEqual([]);
  });
});

describe("findBusinessSlug", () => {
  it("returns the slug of the business, or null when there is none", async () => {
    const businessId = await makeBusiness("harbour-bakery");

    expect(await findBusinessSlug(dbs.staff.db, businessId)).toBe("harbour-bakery");
    expect(await findBusinessSlug(dbs.staff.db, "0198f2c0-0000-7000-8000-0000000000ff")).toBeNull();
  });
});
