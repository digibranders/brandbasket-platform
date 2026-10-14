import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listExtraCategories, listExtraCategoriesByBusiness, replaceExtraCategories } from "./queries/directory-business-categories";
import { businesses } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

async function newBusiness(slug: string): Promise<string> {
  const rows = await dbs.staff.db.insert(businesses).values({ slug, name: slug }).returning({ id: businesses.id });
  const row = rows[0];
  if (row === undefined) throw new Error("The test business was not created.");
  return row.id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("extra categories", () => {
  it("keeps a business's extra categories in the order given, and none for a business without any", async () => {
    const id = await newBusiness("smile-dental");
    expect(await listExtraCategories(dbs.staff.db, id)).toEqual([]);
    await replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["emergency-dentists", "cosmetic-dentists"] });
    expect(await listExtraCategories(dbs.staff.db, id)).toEqual(["emergency-dentists", "cosmetic-dentists"]);
  });

  it("replaces the whole set, and clears it with an empty list", async () => {
    const id = await newBusiness("smile-dental");
    await replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["a-cat", "b-cat", "c-cat"] });
    await replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["b-cat"] });
    expect(await listExtraCategories(dbs.staff.db, id)).toEqual(["b-cat"]);
    await replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: [] });
    expect(await listExtraCategories(dbs.staff.db, id)).toEqual([]);
  });

  it("refuses a fourth category and a repeat, leaving what was saved", async () => {
    const id = await newBusiness("smile-dental");
    await replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["a-cat"] });
    await expect(replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["a", "b", "c", "d"] })).rejects.toThrow(RangeError);
    await expect(replaceExtraCategories(dbs.staff.db, { businessId: id, slugs: ["a-cat", "a-cat"] })).rejects.toThrow(RangeError);
    expect(await listExtraCategories(dbs.staff.db, id)).toEqual(["a-cat"]);
  });

  it("reads many businesses' extras in one go, leaving out those with none", async () => {
    const one = await newBusiness("one");
    const two = await newBusiness("two");
    const three = await newBusiness("three");
    await replaceExtraCategories(dbs.staff.db, { businessId: one, slugs: ["a-cat", "b-cat"] });
    await replaceExtraCategories(dbs.staff.db, { businessId: two, slugs: ["c-cat"] });
    const found = await listExtraCategoriesByBusiness(dbs.staff.db, [one, two, three]);
    expect(Object.fromEntries(found)).toEqual({ [one]: ["a-cat", "b-cat"], [two]: ["c-cat"] });
    expect((await listExtraCategoriesByBusiness(dbs.staff.db, [])).size).toBe(0);
  });
});
