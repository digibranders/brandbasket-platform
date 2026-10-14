import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PincodeRecord } from "../india-post";
import { findPincode, upsertPincodes } from "./india-pincodes";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "../testing";

const NOW = new Date("2026-10-06T00:00:00Z");

const SALT_LAKE: PincodeRecord = {
  pincode: "700091",
  stateCode: "wb",
  districtSlug: "north-24-parganas",
  districtName: "North 24 Parganas",
  localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
};

let databases: TestDatabases;

beforeAll(() => {
  databases = openTestDatabases();
});

beforeEach(async () => {
  await resetTestDatabase(databases.owner);
});

afterAll(async () => {
  await databases.closeAll();
});

describe("india_pincodes", () => {
  it("upserts records and finds one by PIN", async () => {
    expect(await upsertPincodes(databases.staff.db, [SALT_LAKE], NOW)).toBe(1);
    expect(await findPincode(databases.staff.db, "700091")).toEqual(SALT_LAKE);
  });

  it("lets the customer connection read a PIN but not write one", async () => {
    await upsertPincodes(databases.staff.db, [SALT_LAKE], NOW);
    expect(await findPincode(databases.app.db, "700091")).toEqual(SALT_LAKE);
    await expect(upsertPincodes(databases.app.db, [{ ...SALT_LAKE, pincode: "700001" }], NOW)).rejects.toThrow();
  });

  it("a re-import replaces the localities", async () => {
    const base = { pincode: "400001", stateCode: "mh", districtSlug: "mumbai", districtName: "Mumbai" };
    await upsertPincodes(databases.staff.db, [{ ...base, localities: [{ slug: "fort", name: "Fort" }] }], NOW);
    await upsertPincodes(
      databases.staff.db,
      [{ ...base, localities: [{ slug: "fort", name: "Fort" }, { slug: "kalbadevi", name: "Kalbadevi" }] }],
      NOW,
    );
    expect((await findPincode(databases.staff.db, "400001"))?.localities).toHaveLength(2);
  });

  it("writes more than one batch of records", async () => {
    const records: PincodeRecord[] = Array.from({ length: 1_203 }, (_, index) => ({
      ...SALT_LAKE,
      pincode: String(100_000 + index),
    }));
    expect(await upsertPincodes(databases.staff.db, records, NOW)).toBe(1_203);
    expect(await findPincode(databases.staff.db, "101202")).not.toBeNull();
  });

  it("returns null for an unknown or malformed PIN without querying junk", async () => {
    expect(await findPincode(databases.staff.db, "999999")).toBeNull();
    expect(await findPincode(databases.staff.db, "12ab")).toBeNull();
  });
});
