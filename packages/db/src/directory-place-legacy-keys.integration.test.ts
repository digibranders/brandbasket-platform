import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listLegacyKeysByPlace } from "./queries/directory-place-legacy-keys";
import { importOpenDataPlaces, registerLegacyKeys, type OpenDataPlaceRow } from "./queries/directory-places";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const SMILE: OpenDataPlaceRow = {
  sourceRef: "osm:node/1",
  id: "k7m2q9a",
  citySlug: "thane",
  urlSlug: "smile-dental",
  legacyKey: "dentists/thane/naupada/smile-dental",
};
const IRON: OpenDataPlaceRow = {
  sourceRef: "overture:abc",
  id: "b3cdefg",
  citySlug: "thane",
  urlSlug: "iron-gym",
  legacyKey: "gyms/thane/naupada/iron-gym",
};
const BARE: OpenDataPlaceRow = {
  sourceRef: "osm:node/3",
  id: "c4defgh",
  citySlug: "thane",
  urlSlug: "bare",
  legacyKey: null,
};

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await importOpenDataPlaces(dbs.staff.db, [SMILE, IRON, BARE], NOW);
});

describe("listLegacyKeysByPlace", () => {
  it("returns every old address of each place, sorted, in one read", async () => {
    await registerLegacyKeys(dbs.staff.db, SMILE.id, ["dentists/thane/kopri/smile-dental-clinic", "clinics/thane/naupada/smile-dental"]);

    const keys = await listLegacyKeysByPlace(dbs.staff.db, [SMILE.id, IRON.id]);

    expect(keys.get(SMILE.id)).toEqual([
      "clinics/thane/naupada/smile-dental",
      "dentists/thane/kopri/smile-dental-clinic",
      "dentists/thane/naupada/smile-dental",
    ]);
    expect(keys.get(IRON.id)).toEqual(["gyms/thane/naupada/iron-gym"]);
  });

  it("leaves out a place with no old address, a place not asked for, and an unknown id", async () => {
    const keys = await listLegacyKeysByPlace(dbs.staff.db, [BARE.id, "zzzzzz2", SMILE.id, SMILE.id]);

    expect([...keys.keys()]).toEqual([SMILE.id]);
  });

  it("answers an empty ask without reading", async () => {
    expect(await listLegacyKeysByPlace(dbs.staff.db, [])).toEqual(new Map());
  });
});
