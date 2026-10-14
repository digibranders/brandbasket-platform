import { eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OpenListingInput } from "./directory-listing-file";
import { PLACE_ID_ALPHABET } from "./place-id";
import {
  DuplicateListingError,
  listVisibleOpenListings,
  MASS_HIDE_MIN,
  MASS_HIDE_SHARE,
  MassHideRefusedError,
  openListingsVersion,
  syncOpenListings,
  UnknownListingPlaceError,
} from "./queries/directory-open-listings";
import { changePlaceUrl, importOpenDataPlaces, type OpenDataPlaceRow } from "./queries/directory-places";
import { directoryOpenListings, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const STAFF = "staff-1";

const PLACES: OpenDataPlaceRow[] = [
  { sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: null },
  { sourceRef: "survey:0x1:0x2", id: "z8p6tbs", citySlug: "thane", urlSlug: "shiv-drushti-dental-clinic", legacyKey: null },
  { sourceRef: "overture:abc", id: "b3cdefg", citySlug: "thane", urlSlug: "iron-gym", legacyKey: null },
];

function listing(placeId: string, name: string, extra: Partial<OpenListingInput> = {}): OpenListingInput {
  return {
    placeId, name, categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", address: "Naupada, Thane 400602",
    lat: 19.19, lon: 72.97, website: "", source: "osm", phone: null, ...extra,
  };
}


/** `count` distinct valid place ids (open-data style: they start with a letter and hold a digit). */
function manyPlaceIds(count: number): string[] {
  const base = PLACE_ID_ALPHABET.length;
  return Array.from({ length: count }, (_, i) => {
    let tail = "";
    for (let n = i, k = 0; k < 5; k += 1, n = Math.floor(n / base)) tail = PLACE_ID_ALPHABET[n % base] + tail;
    return `b2${tail}`;
  });
}

async function seedMany(ids: readonly string[]): Promise<OpenListingInput[]> {
  await importOpenDataPlaces(
    dbs.staff.db,
    ids.map((id, i) => ({ sourceRef: `osm:node/m${i}`, id, citySlug: "thane", urlSlug: `business-${i}`, legacyKey: null })),
    NOW,
  );
  const rows = ids.map((id, i) => listing(id, `Business ${i}`));
  await syncOpenListings(dbs.staff.db, rows);
  return rows;
}

async function visibleCount(): Promise<number> {
  const rows = await dbs.staff.db.select({ id: directoryOpenListings.placeId }).from(directoryOpenListings).where(isNull(directoryOpenListings.hiddenAt));
  return rows.length;
}

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await importOpenDataPlaces(dbs.staff.db, PLACES, NOW);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Sam Staff", email: "staff@fynix.digital" });
});

describe("syncOpenListings", () => {
  it("creates, then leaves unchanged rows alone and updates changed ones", async () => {
    const first = await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("z8p6tbs", "Shiv Drushti")]);
    expect(first).toEqual({ created: 2, updated: 0, unchanged: 0, hidden: 0 });

    const second = await syncOpenListings(
      dbs.staff.db,
      [listing("k7m2q9a", "Smile Dental Care"), listing("z8p6tbs", "Shiv Drushti")],
    );
    expect(second).toEqual({ created: 0, updated: 1, unchanged: 1, hidden: 0 });
  });

  it("stores the shown phone and where it came from", async () => {
    await syncOpenListings(
      dbs.staff.db,
      [listing("z8p6tbs", "Shiv Drushti", { source: "survey", phone: { e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true } })],
    );
    const [row] = await dbs.staff.db.select().from(directoryOpenListings).where(eq(directoryOpenListings.placeId, "z8p6tbs"));
    expect(row).toMatchObject({ phone: "+919850004227", phoneFoundOn: "call", phoneCheckedOn: "2026-10-05", phoneWhatsapp: true, source: "survey" });
  });

  it("hides a business that left the dataset, and shows it again when it returns", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("b3cdefg", "Iron Gym")]);
    expect(await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental")])).toMatchObject({ hidden: 1 });
    expect((await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).map((r) => r.placeId)).toEqual(["k7m2q9a"]);

    expect(await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("b3cdefg", "Iron Gym")])).toMatchObject({
      updated: 1,
      hidden: 0,
    });
    expect(await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).toHaveLength(2);
  });

  it("refuses a listing whose place is not registered, writing nothing", async () => {
    const text = await captureErrorText(syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile"), listing("q9q9q9q", "Ghost")]));
    expect(text).toMatch(/q9q9q9q/);
    expect(await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).toHaveLength(0);
    await expect(syncOpenListings(dbs.staff.db, [listing("q9q9q9q", "Ghost")])).rejects.toBeInstanceOf(UnknownListingPlaceError);
  });

  it("keeps the search document up to date", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Café Smile")]);
    const [hit] = await dbs.staff.db
      .select({ id: directoryOpenListings.placeId })
      .from(directoryOpenListings)
      .where(sql`${directoryOpenListings.search} @@ to_tsquery('simple', 'cafe:*')`);
    expect(hit?.id).toBe("k7m2q9a");
  });
});

describe("listVisibleOpenListings", () => {
  it("pages by place id and carries the URL label from directory_places", async () => {
    await syncOpenListings(dbs.staff.db, [listing("z8p6tbs", "Shiv"), listing("k7m2q9a", "Smile"), listing("b3cdefg", "Gym")]);
    const first = await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 2 });
    expect(first.map((r) => r.placeId)).toEqual(["b3cdefg", "k7m2q9a"]);
    expect(first[1]).toMatchObject({ urlCitySlug: "thane", urlSlug: "smile-dental" });
    const second = await listVisibleOpenListings(dbs.staff.db, { after: "k7m2q9a", limit: 2 });
    expect(second.map((r) => r.placeId)).toEqual(["z8p6tbs"]);
  });
});

describe("openListingsVersion", () => {
  it("changes when the visible listings change, and only then", async () => {
    const empty = await openListingsVersion(dbs.staff.db);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    const one = await openListingsVersion(dbs.staff.db);
    expect(one).not.toBe(empty);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    expect(await openListingsVersion(dbs.staff.db)).toBe(one);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Care")]);
    expect(await openListingsVersion(dbs.staff.db)).not.toBe(one);
  });
});

describe("syncOpenListings: changes that count", () => {
  it("counts a phone-only change as updated and moves the version", async () => {
    const withPhone = (whatsapp: boolean): OpenListingInput =>
      listing("k7m2q9a", "Smile", { phone: { e164: "+912225325444", foundOn: "call", checkedOn: "2026-10-05", whatsapp } });
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    const bare = await openListingsVersion(dbs.staff.db);

    expect(await syncOpenListings(dbs.staff.db, [withPhone(false)])).toEqual({ created: 0, updated: 1, unchanged: 0, hidden: 0 });
    const phoned = await openListingsVersion(dbs.staff.db);
    expect(phoned).not.toBe(bare);

    expect(await syncOpenListings(dbs.staff.db, [withPhone(true)])).toEqual({ created: 0, updated: 1, unchanged: 0, hidden: 0 });
    expect(await openListingsVersion(dbs.staff.db)).not.toBe(phoned);
  });

  it("moves the version when a business is hidden", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile"), listing("b3cdefg", "Iron Gym")]);
    const both = await openListingsVersion(dbs.staff.db);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    expect(await openListingsVersion(dbs.staff.db)).not.toBe(both);
  });

  it("moves the version when a business's URL label changes", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    const before = await openListingsVersion(dbs.staff.db);
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, "k7m2q9a", { citySlug: "thane", urlSlug: "smile-dental-care" }, { staffUserId: STAFF, reason: "Rebranded" }, new Date("2030-01-01T00:00:00.000Z")),
    );
    expect(await openListingsVersion(dbs.staff.db)).not.toBe(before);
  });

  it("refuses one place id twice in a build", async () => {
    await expect(syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile"), listing("k7m2q9a", "Smile again")])).rejects.toBeInstanceOf(
      DuplicateListingError,
    );
  });
});

describe("syncOpenListings: mass-hide guard", () => {
  it("refuses an empty build, leaving the directory as it was", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile"), listing("b3cdefg", "Iron Gym")]);
    const version = await openListingsVersion(dbs.staff.db);
    await expect(syncOpenListings(dbs.staff.db, [])).rejects.toBeInstanceOf(MassHideRefusedError);
    expect(await visibleCount()).toBe(2);
    expect(await openListingsVersion(dbs.staff.db)).toBe(version);
  });

  it("lets an empty build through only when asked, hiding everything", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")]);
    expect(await syncOpenListings(dbs.staff.db, [], { allowMassHide: true })).toEqual({ created: 0, updated: 0, unchanged: 0, hidden: 1 });
    expect(await visibleCount()).toBe(0);
  });

  it("allows hiding up to the floor on a small directory and refuses more, writing nothing", async () => {
    const rows = await seedMany(manyPlaceIds(40));
    const version = await openListingsVersion(dbs.staff.db);
    const keepMost = rows.slice(0, 40 - (MASS_HIDE_MIN + 1)).map((row, i) => (i === 0 ? { ...row, name: "Renamed" } : row));
    const error = await syncOpenListings(dbs.staff.db, keepMost).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MassHideRefusedError);
    expect((error as Error).message).toMatch(new RegExp(`${MASS_HIDE_MIN + 1} of 40`));
    expect((error as Error).message).toMatch(/--allow-mass-hide/);
    expect(await visibleCount()).toBe(40);
    expect(await openListingsVersion(dbs.staff.db)).toBe(version);
    const [first] = await dbs.staff.db.select().from(directoryOpenListings).where(eq(directoryOpenListings.placeId, rows[0]?.placeId ?? ""));
    expect(first?.name).toBe("Business 0");

    const atFloor = rows.slice(0, 40 - MASS_HIDE_MIN);
    expect(await syncOpenListings(dbs.staff.db, atFloor)).toMatchObject({ hidden: MASS_HIDE_MIN });
  });

  it("applies the share of visible rows once the directory is large", async () => {
    const total = 300;
    const rows = await seedMany(manyPlaceIds(total));
    const allowed = Math.floor(total * MASS_HIDE_SHARE);
    await expect(syncOpenListings(dbs.staff.db, rows.slice(0, total - (allowed + 1)))).rejects.toBeInstanceOf(MassHideRefusedError);
    expect(await visibleCount()).toBe(total);
    expect(await syncOpenListings(dbs.staff.db, rows.slice(0, total - (allowed + 1)), { allowMassHide: true })).toMatchObject({
      hidden: allowed + 1,
    });
    expect(await visibleCount()).toBe(total - (allowed + 1));
  });
});

describe("row-level security", () => {
  it("gives the app and public roles nothing", async () => {
    // drizzle wraps the driver error ("Failed query: ..."); the Postgres message is in its cause.
    expect(await captureErrorText(dbs.app.db.select().from(directoryOpenListings))).toMatch(
      /permission denied for table directory_open_listings/,
    );
    expect(await captureErrorText(dbs.publicRole.db.select().from(directoryOpenListings))).toMatch(
      /permission denied for table directory_open_listings/,
    );
  });
});
