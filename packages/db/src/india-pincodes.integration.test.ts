import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findPincode, hasPincodeDirectory, upsertPincodes } from "./queries/india-pincodes";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("the pincode directory", () => {
  it("is empty on a deployment that never imported India Post's list, which can then say nothing about any pincode", async () => {
    expect(await hasPincodeDirectory(dbs.app.db)).toBe(false);
    expect(await findPincode(dbs.app.db, "400080")).toBeNull();
  });

  it("is there once any pincode is loaded, so an unlisted one is a real miss", async () => {
    await upsertPincodes(
      dbs.staff.db,
      [{ pincode: "400080", stateCode: "mh", districtSlug: "mumbai", districtName: "Mumbai", localities: [{ slug: "mulund-west", name: "Mulund West" }] }],
      new Date("2026-10-14T00:00:00Z"),
    );
    expect(await hasPincodeDirectory(dbs.app.db)).toBe(true);
    expect(await findPincode(dbs.app.db, "400080")).toMatchObject({ stateCode: "mh", districtName: "Mumbai" });
    expect(await findPincode(dbs.app.db, "999999")).toBeNull();
  });
});
