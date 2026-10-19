import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PLACE_ID_ALPHABET, businessUrlCode } from "./place-id";
import {
  changePlaceUrl,
  createPlatformPlace,
  findPlaceByUrlCode,
  findPlaces,
  importOpenDataPlaces,
  InvalidPlaceStateCodeError,
  InvalidPlaceUrlChangeReasonError,
  InvalidPlaceUrlError,
  lockPlaceUrl,
  PlaceLedgerMismatchError,
  PlaceUrlLockedError,
  PlaceUrlNotLiveError,
  resolveLegacyKeys,
  UnknownPlaceError,
  updatePendingPlaceUrl,
  type OpenDataPlaceRow,
} from "./queries/directory-places";
import { directoryPlaces, directoryPlaceUrlChanges, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const LATER = new Date("2026-10-02T10:00:00.000Z");
const STAFF = "staff-1";
const SMILE_KEY = "dentists/thane/naupada/smile-dental";
const SMILE: OpenDataPlaceRow = {
  sourceRef: "osm:node/1",
  id: "k7m2q9a",
  citySlug: "thane",
  urlSlug: "smile-dental",
  legacyKey: SMILE_KEY,
};
const GYM: OpenDataPlaceRow = {
  sourceRef: "overture:abc",
  id: "b3cdefg",
  citySlug: "thane",
  urlSlug: "iron-gym",
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
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Sam Staff", email: "staff@brandbasket.in" });
});

/** A valid letter-first id for the n-th generated row: "a2" plus n in base 31 over the id alphabet. */
function openDataId(n: number): string {
  let rest = "";
  let value = n;
  for (let position = 0; position < 5; position += 1) {
    rest = PLACE_ID_ALPHABET.charAt(value % PLACE_ID_ALPHABET.length) + rest;
    value = Math.floor(value / PLACE_ID_ALPHABET.length);
  }
  return `a2${rest}`;
}

describe("importOpenDataPlaces", () => {
  it("creates locked open-data places with their legacy keys, and is idempotent", async () => {
    expect(await importOpenDataPlaces(dbs.staff.db, [SMILE, GYM], NOW)).toEqual({ created: 2, unchanged: 0 });
    expect(await importOpenDataPlaces(dbs.staff.db, [SMILE, GYM], LATER)).toEqual({ created: 0, unchanged: 2 });

    const places = await findPlaces(dbs.staff.db, [SMILE.id, GYM.id, "zzzzzz2"]);
    expect([...places.keys()].sort()).toEqual([GYM.id, SMILE.id]);
    expect(places.get(SMILE.id)).toEqual({
      id: SMILE.id,
      origin: "open_data",
      stateCode: "mh",
      citySlug: "thane",
      urlSlug: "smile-dental",
      urlLockedAt: NOW,
    });
    const [row] = await dbs.staff.db.select().from(directoryPlaces).where(eq(directoryPlaces.id, SMILE.id));
    expect(row).toMatchObject({ sourceRef: SMILE.sourceRef, createdAt: NOW, updatedAt: NOW });

    const legacy = await resolveLegacyKeys(dbs.staff.db, [SMILE_KEY, "gyms/thane/naupada/unknown"]);
    expect(Object.fromEntries(legacy)).toEqual({ [SMILE_KEY]: SMILE.id });
  });

  it("imports more rows than one batch holds", async () => {
    const rows = Array.from({ length: 1_201 }, (_, n): OpenDataPlaceRow => ({
      sourceRef: `osm:node/${n}`,
      id: openDataId(n),
      citySlug: "thane",
      urlSlug: `business-${n}`,
      legacyKey: `gyms/thane/naupada/business-${n}`,
    }));
    expect(await importOpenDataPlaces(dbs.staff.db, rows, NOW)).toEqual({ created: 1_201, unchanged: 0 });
    expect(await importOpenDataPlaces(dbs.staff.db, rows, NOW)).toEqual({ created: 0, unchanged: 1_201 });
    const counted = await dbs.owner.db.execute<{ places: number; keys: number }>(
      sql`select (select count(*)::int from directory_places) as places, (select count(*)::int from directory_place_legacy_keys) as keys`,
    );
    expect(counted.rows[0]).toEqual({ places: 1_201, keys: 1_201 });
  });

  it("never changes an imported place's URL: a ledger row that differs is refused", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    const renamed = importOpenDataPlaces(dbs.staff.db, [{ ...SMILE, urlSlug: "other" }], LATER);
    await expect(renamed).rejects.toBeInstanceOf(PlaceLedgerMismatchError);
    await expect(importOpenDataPlaces(dbs.staff.db, [{ ...SMILE, urlSlug: "other" }], LATER)).rejects.toThrow(/ledger/);
    expect((await findPlaces(dbs.staff.db, [SMILE.id])).get(SMILE.id)?.urlSlug).toBe("smile-dental");
  });

  it("refuses a ledger whose source, id or legacy key disagrees with the registry", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    const cases: readonly OpenDataPlaceRow[] = [
      { ...SMILE, sourceRef: "osm:node/2" },
      { ...SMILE, id: "c4defgh" },
      { ...SMILE, legacyKey: "dentists/thane/naupada/smile-dental-2" },
      { ...GYM, legacyKey: SMILE_KEY },
    ];
    for (const row of cases) {
      await expect(importOpenDataPlaces(dbs.staff.db, [row], LATER), JSON.stringify(row)).rejects.toBeInstanceOf(
        PlaceLedgerMismatchError,
      );
    }
    const counted = await dbs.owner.db.execute<{ places: number }>(sql`select count(*)::int as places from directory_places`);
    expect(counted.rows[0]?.places).toBe(1);
  });

  it("refuses a ledger that repeats an id, a source or a legacy key", async () => {
    const cases: readonly (readonly OpenDataPlaceRow[])[] = [
      [SMILE, { ...GYM, id: SMILE.id }],
      [SMILE, { ...GYM, sourceRef: SMILE.sourceRef }],
      [SMILE, { ...GYM, legacyKey: SMILE_KEY }],
    ];
    for (const rows of cases) {
      await expect(importOpenDataPlaces(dbs.staff.db, rows, NOW)).rejects.toBeInstanceOf(PlaceLedgerMismatchError);
    }
    expect((await findPlaces(dbs.staff.db, [SMILE.id, GYM.id])).size).toBe(0);
  });

  it("still agrees with the ledger after staff change a place's URL", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, SMILE.id, { citySlug: "thane", urlSlug: "smile-implants" }, { staffUserId: STAFF, reason: "Rebranded" }, NOW),
    );
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, SMILE.id, { citySlug: "mumbai", urlSlug: "smile-implants" }, { staffUserId: STAFF, reason: "Moved" }, LATER),
    );
    expect(await importOpenDataPlaces(dbs.staff.db, [SMILE], LATER)).toEqual({ created: 0, unchanged: 1 });
    // A URL the place never had is still refused.
    await expect(
      importOpenDataPlaces(dbs.staff.db, [{ ...SMILE, citySlug: "pune", urlSlug: "smile-implants" }], LATER),
    ).rejects.toBeInstanceOf(PlaceLedgerMismatchError);
  });

  it("still agrees with the ledger when staff changes were stamped out of order", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    const by = { staffUserId: STAFF, reason: "Rebranded" };
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, SMILE.id, { citySlug: "thane", urlSlug: "a-name" }, by, new Date(NOW.getTime() + 5)),
    );
    await dbs.staff.db.transaction((tx) => changePlaceUrl(tx, SMILE.id, { citySlug: "thane", urlSlug: "b-name" }, by, NOW));
    expect(await importOpenDataPlaces(dbs.staff.db, [SMILE], LATER)).toEqual({ created: 0, unchanged: 1 });
  });

  it("re-imports a business a client has taken over", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE, GYM], NOW);
    await dbs.staff.db.update(directoryPlaces).set({ origin: "client" }).where(eq(directoryPlaces.id, SMILE.id));
    expect(await importOpenDataPlaces(dbs.staff.db, [SMILE, GYM], LATER)).toEqual({ created: 0, unchanged: 2 });
    expect((await findPlaces(dbs.staff.db, [SMILE.id])).get(SMILE.id)?.origin).toBe("client");
  });

  it("runs concurrent imports one after the other instead of letting them collide", async () => {
    const rows = Array.from({ length: 500 }, (_, n): OpenDataPlaceRow => ({
      sourceRef: `osm:node/${n}`,
      id: openDataId(n),
      citySlug: "thane",
      urlSlug: `business-${n}`,
      legacyKey: null,
    }));
    // Warm two pooled connections so both imports really start together.
    await Promise.all([dbs.staff.db.execute(sql`select pg_sleep(0.05)`), dbs.staff.db.execute(sql`select pg_sleep(0.05)`)]);
    const results = await Promise.all([
      importOpenDataPlaces(dbs.staff.db, rows, NOW),
      importOpenDataPlaces(dbs.staff.db, rows, NOW),
    ]);
    expect(results.map((result) => result.created).sort((a, b) => a - b)).toEqual([0, 500]);
    expect(results.map((result) => result.unchanged).sort((a, b) => a - b)).toEqual([0, 500]);
  });
});

describe("platform places", () => {
  it("creates a digit-first id, editable until locked", async () => {
    const id = await dbs.staff.db.transaction((tx) =>
      createPlatformPlace(tx, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW),
    );
    expect(id).toMatch(/^[2-9][23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)).toMatchObject({ origin: "added", urlLockedAt: null });

    await dbs.staff.db.transaction((tx) =>
      updatePendingPlaceUrl(tx, id, { stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe-and-bakery" }, NOW),
    );
    await dbs.staff.db.transaction((tx) => lockPlaceUrl(tx, id, NOW));
    await dbs.staff.db.transaction((tx) => lockPlaceUrl(tx, id, LATER));
    await expect(
      dbs.staff.db.transaction((tx) => updatePendingPlaceUrl(tx, id, { stateCode: "mh", citySlug: "thane", urlSlug: "sneaky-keywords" }, LATER)),
    ).rejects.toBeInstanceOf(PlaceUrlLockedError);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)).toMatchObject({ urlSlug: "new-cafe-and-bakery", urlLockedAt: NOW });
  });

  it("refuses a malformed URL before touching the database", async () => {
    const bad: readonly { citySlug: string; urlSlug: string }[] = [
      { citySlug: "Thane", urlSlug: "new-cafe" },
      { citySlug: "thane", urlSlug: "new--cafe" },
      { citySlug: "thane", urlSlug: "a".repeat(71) },
    ];
    for (const url of bad) {
      await expect(createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", ...url }, NOW)).rejects.toBeInstanceOf(InvalidPlaceUrlError);
    }
    const id = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW);
    for (const url of bad) {
      await expect(updatePendingPlaceUrl(dbs.staff.db, id, { stateCode: "mh", ...url }, NOW)).rejects.toBeInstanceOf(InvalidPlaceUrlError);
    }
    expect((await findPlaces(dbs.staff.db, [id])).get(id)?.urlSlug).toBe("new-cafe");
  });

  it("puts a place in its own state, which may change with its URL until it is live", async () => {
    const id = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "wb", citySlug: "wb-kolkata", urlSlug: "new-cafe" }, NOW);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)).toMatchObject({ stateCode: "wb", citySlug: "wb-kolkata" });
    await updatePendingPlaceUrl(dbs.staff.db, id, { stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, LATER);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)).toMatchObject({ stateCode: "mh", citySlug: "thane" });
  });

  it("refuses a malformed state code before touching the database", async () => {
    for (const stateCode of ["MH", "mah", "", "m1"]) {
      await expect(
        createPlatformPlace(dbs.staff.db, { origin: "added", stateCode, citySlug: "thane", urlSlug: "new-cafe" }, NOW),
      ).rejects.toBeInstanceOf(InvalidPlaceStateCodeError);
    }
    const id = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW);
    await expect(
      updatePendingPlaceUrl(dbs.staff.db, id, { stateCode: "West Bengal", citySlug: "thane", urlSlug: "new-cafe" }, NOW),
    ).rejects.toBeInstanceOf(InvalidPlaceStateCodeError);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)?.stateCode).toBe("mh");
  });

  it("creates a client place, and refuses to edit or lock a place that does not exist", async () => {
    const id = await createPlatformPlace(dbs.staff.db, { origin: "client", stateCode: "mh", citySlug: "thane", urlSlug: "smile-dental" }, NOW);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)?.origin).toBe("client");
    const url = { stateCode: "mh", citySlug: "thane", urlSlug: "ghost" };
    await expect(updatePendingPlaceUrl(dbs.staff.db, "zzzzzz2", url, NOW)).rejects.toBeInstanceOf(UnknownPlaceError);
    await expect(lockPlaceUrl(dbs.staff.db, "zzzzzz2", NOW)).rejects.toBeInstanceOf(UnknownPlaceError);
  });
});

describe("findPlaceByUrlCode", () => {
  it("finds a business by its URL's code, under its current name or a stale one, and nothing for an unknown code", async () => {
    const cafe = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW);
    await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW);
    const code = businessUrlCode(cafe);
    expect((await findPlaceByUrlCode(dbs.staff.db, { urlSlug: "new-cafe", code }))?.id).toBe(cafe);
    // The website 301s a stale name to the current one; the code alone still names the business.
    expect((await findPlaceByUrlCode(dbs.staff.db, { urlSlug: "old-name", code }))?.id).toBe(cafe);
    expect(await findPlaceByUrlCode(dbs.staff.db, { urlSlug: "new-cafe", code: "2222222222" })).toBeNull();
  });
});

describe("changePlaceUrl", () => {
  it("lets staff change a locked URL and records who, why and what", async () => {
    await importOpenDataPlaces(dbs.staff.db, [{ ...SMILE, legacyKey: null }], NOW);
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(
        tx,
        SMILE.id,
        { citySlug: "thane", urlSlug: "smile-dental-implant-centre" },
        { staffUserId: STAFF, reason: "Rebranded" },
        LATER,
      ),
    );
    expect((await findPlaces(dbs.staff.db, [SMILE.id])).get(SMILE.id)).toMatchObject({
      citySlug: "thane",
      urlSlug: "smile-dental-implant-centre",
      urlLockedAt: NOW,
    });
    const log = await dbs.staff.db.select().from(directoryPlaceUrlChanges).where(eq(directoryPlaceUrlChanges.placeId, SMILE.id));
    expect(log).toEqual([
      expect.objectContaining({
        fromCitySlug: "thane",
        fromUrlSlug: "smile-dental",
        toCitySlug: "thane",
        toUrlSlug: "smile-dental-implant-centre",
        reason: "Rebranded",
        changedByUserId: STAFF,
        changedAt: LATER,
      }),
    ]);
  });

  it("refuses a place that is not live yet: its owner may still change it", async () => {
    const id = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "new-cafe" }, NOW);
    await expect(
      dbs.staff.db.transaction((tx) =>
        changePlaceUrl(tx, id, { citySlug: "thane", urlSlug: "other-cafe" }, { staffUserId: STAFF, reason: "Rename" }, LATER),
      ),
    ).rejects.toBeInstanceOf(PlaceUrlNotLiveError);
    expect(await dbs.staff.db.select().from(directoryPlaceUrlChanges)).toEqual([]);
  });

  it("refuses a malformed URL or reason with a typed error", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    const change = (url: { citySlug: string; urlSlug: string }, reason: string): Promise<void> =>
      dbs.staff.db.transaction((tx) => changePlaceUrl(tx, SMILE.id, url, { staffUserId: STAFF, reason }, LATER));
    await expect(change({ citySlug: "thane", urlSlug: "Smile" }, "Rebranded")).rejects.toBeInstanceOf(InvalidPlaceUrlError);
    await expect(change({ citySlug: "thane", urlSlug: "smile-2" }, "  ")).rejects.toBeInstanceOf(
      InvalidPlaceUrlChangeReasonError,
    );
    await expect(change({ citySlug: "thane", urlSlug: "smile-2" }, "x".repeat(301))).rejects.toBeInstanceOf(
      InvalidPlaceUrlChangeReasonError,
    );
    expect((await findPlaces(dbs.staff.db, [SMILE.id])).get(SMILE.id)?.urlSlug).toBe("smile-dental");
  });

  it("records nothing when the URL is unchanged, and refuses an unknown place", async () => {
    await importOpenDataPlaces(dbs.staff.db, [SMILE], NOW);
    const by = { staffUserId: STAFF, reason: "No change" };
    await dbs.staff.db.transaction((tx) => changePlaceUrl(tx, SMILE.id, { citySlug: "thane", urlSlug: "smile-dental" }, by, LATER));
    expect(await dbs.staff.db.select().from(directoryPlaceUrlChanges)).toEqual([]);
    await expect(
      dbs.staff.db.transaction((tx) => changePlaceUrl(tx, "zzzzzz2", { citySlug: "thane", urlSlug: "ghost" }, by, LATER)),
    ).rejects.toBeInstanceOf(UnknownPlaceError);
  });
});

describe("table rules", () => {
  it("refuses a malformed id, an id from the wrong source, and a bad URL label", async () => {
    const base = { id: "k7m2q9a", origin: "open_data" as const, stateCode: "mh", citySlug: "thane", urlSlug: "smile-dental" };
    const cases: readonly [string, Partial<typeof directoryPlaces.$inferInsert>][] = [
      ["directory_places_id_check", { id: "k7m2q9" }],
      ["directory_places_id_check", { id: "k7m2q9o" }],
      ["directory_places_id_check", { id: "kxmzqya" }],
      ["directory_places_origin_id_check", { id: "27m2q9a" }],
      ["directory_places_origin_id_check", { origin: "added" }],
      ["directory_places_state_code_check", { stateCode: "MH" }],
      ["directory_places_city_slug_check", { citySlug: "Thane" }],
      ["directory_places_url_slug_check", { urlSlug: "smile--dental" }],
      ["directory_places_url_slug_check", { urlSlug: "a".repeat(71) }],
    ];
    for (const [constraint, overrides] of cases) {
      expect(await captureErrorText(dbs.staff.db.insert(directoryPlaces).values({ ...base, ...overrides }))).toContain(constraint);
    }
    // A client that took over an open-data business keeps its letter-first id.
    await dbs.staff.db.insert(directoryPlaces).values({ ...base, origin: "client" });
  });

  it("gives the app and public roles nothing, and staff no way to delete or rewrite history", async () => {
    const tables = ["directory_places", "directory_place_legacy_keys", "directory_place_url_changes"];
    for (const role of ["bb_app", "bb_public"]) {
      for (const table of tables) {
        const result = await dbs.owner.db.execute<{ allowed: boolean }>(
          sql`select has_table_privilege(${role}, ${`public.${table}`}, 'SELECT, INSERT, UPDATE, DELETE') as allowed`,
        );
        expect(result.rows[0]?.allowed, `${role} on ${table}`).toBe(false);
      }
    }
    const staff: readonly [string, string, boolean][] = [
      ["directory_places", "SELECT", true],
      ["directory_places", "INSERT", true],
      ["directory_places", "UPDATE", true],
      ["directory_places", "DELETE", false],
      ["directory_place_legacy_keys", "INSERT", true],
      ["directory_place_legacy_keys", "UPDATE", false],
      ["directory_place_legacy_keys", "DELETE", false],
      ["directory_place_url_changes", "INSERT", true],
      ["directory_place_url_changes", "UPDATE", false],
      ["directory_place_url_changes", "DELETE", false],
    ];
    for (const [table, privilege, expected] of staff) {
      const result = await dbs.owner.db.execute<{ allowed: boolean }>(
        sql`select has_table_privilege('bb_staff', ${`public.${table}`}, ${privilege}) as allowed`,
      );
      expect(result.rows[0]?.allowed, `bb_staff ${privilege} on ${table}`).toBe(expected);
    }
  });
});
