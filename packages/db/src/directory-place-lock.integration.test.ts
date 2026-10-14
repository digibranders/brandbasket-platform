import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addBusinessListing,
  createUnlistedAccountBusiness,
  decideDirectoryClaim,
  findClaimForBusiness,
  renameAddedBusiness,
  updateAddedBusinessListing,
  type NewBusinessListing,
} from "./queries/directory-ads";
import {
  ListingPlaceFixedError,
  saveListingPlacement,
  type ListingPlacementInput,
} from "./queries/directory-listings";
import {
  changePlaceUrl,
  findPlaces,
  importOpenDataPlaces,
  lockPlaceUrl,
  PLACE_REGISTRY_LOCK,
  PlaceUrlLockedError,
  PlaceRegistryNotImportedError,
  resolveLegacyKeys,
  UnknownPlaceError,
  updatePendingPlaceUrl,
  type DirectoryPlace,
  type OpenDataPlaceRow,
} from "./queries/directory-places";
import { businesses, directoryListings, directoryPlaces, directoryPlaceUrlChanges, users } from "./schema";
import { PLACE_ID_ALPHABET } from "./place-id";
import { upsertPincodes } from "./queries/india-pincodes";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

/*
 * Task 8 of docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md: a business's URL label is frozen when
 * its page goes live. An owner-added business may change it while it waits for the call; approval locks it. A client's
 * listing gets its place (taking over the open-data business it is, or a fresh one) locked on its first save, and
 * moving it afterwards never touches the URL.
 */

const STAFF = "staff-1";
const OWNER = "owner-a";
const ADDED_AT = new Date("2026-10-01T06:00:00.000Z");
const LATER = new Date("2026-10-01T09:00:00.000Z");
const DECIDED_AT = new Date("2026-10-02T06:00:00.000Z");

/** Open-data businesses the dataset import made. */
const SMILE = "k7m2q9a";
const SMILE_KEY = "dentists/thane/naupada/smile-dental";
const GLOW = "b3cdefg";
const GLOW_KEY = "salons/thane/vasant-vihar/glow-studio";

const ADDED: Omit<NewBusinessListing, "businessId"> = {
  stateCode: "mh",
  categorySlug: "dentists",
  citySlug: "thane",
  areaSlug: "naupada",
  slug: "gentle-dental",
  businessName: "Gentle Dental",
  streetAddress: "12 Gokhale Road",
  phone: "+919820077001",
  postal: null,
};

const PLACEMENT: ListingPlacementInput = {
  categorySlug: "dentists",
  stateCode: "mh",
  citySlug: "thane",
  areaSlug: "naupada",
  slug: "bright-teeth-clinic",
  lat: 19.19,
  lon: 72.97,
  pinLabel: "Gokhale Road",
  whatsappPhone: null,
  bookingUrl: null,
  replacesSourcePath: null,
  takeOverPlaceId: null,
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
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Sam Staff", email: "staff@example.com" },
    { id: OWNER, name: "Owner A", email: "owner-a@example.com", emailVerified: true },
  ]);
});

async function importPlaces(): Promise<void> {
  await importOpenDataPlaces(
    dbs.staff.db,
    [
      { sourceRef: "osm:node/1", id: SMILE, citySlug: "thane", urlSlug: "smile-dental", legacyKey: SMILE_KEY },
      { sourceRef: "osm:node/2", id: GLOW, citySlug: "thane", urlSlug: "glow-studio", legacyKey: GLOW_KEY },
    ],
    ADDED_AT,
  );
}

/** A distinct open-data id for `index`: a letter, five characters of the alphabet, and a digit. */
function openDataId(index: number): string {
  let rest = "";
  for (let value = index, place = 0; place < 5; place += 1, value = Math.floor(value / PLACE_ID_ALPHABET.length)) {
    rest = PLACE_ID_ALPHABET.charAt(value % PLACE_ID_ALPHABET.length) + rest;
  }
  return `a${rest}2`;
}

/** Resolves once a backend of this database is waiting for an advisory lock. */
async function someoneWaitsForAdvisoryLock(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = await dbs.staff.db.execute<{ waiting: boolean }>(
      sql`select exists (select 1 from pg_locks where locktype = 'advisory' and not granted) as waiting`,
    );
    if (waiting.rows[0]?.waiting === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Nothing waited for the registry lock");
}

/**
 * Holds the registry lock exclusively, as an import batch or the backfill does, until `release` is called; `work` is
 * started once it is held and must then wait for it.
 */
async function whileRegistryLocked<T>(work: () => Promise<T>): Promise<T> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held: () => void = () => undefined;
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = dbs.staff.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PLACE_REGISTRY_LOCK}))`);
    held();
    await released;
  });
  await holding;
  const running = work();
  try {
    await someoneWaitsForAdvisoryLock();
  } finally {
    release();
    await holder;
  }
  return running;
}

async function place(id: string | null | undefined): Promise<DirectoryPlace> {
  if (id === null || id === undefined) throw new Error("No place id");
  const found = (await findPlaces(dbs.staff.db, [id])).get(id);
  if (found === undefined) throw new Error(`No place ${id}`);
  return found;
}

async function placeUpdatedAt(id: string): Promise<Date | undefined> {
  const rows = await dbs.staff.db.select({ updatedAt: directoryPlaces.updatedAt }).from(directoryPlaces).where(eq(directoryPlaces.id, id));
  return rows[0]?.updatedAt;
}

describe("an owner-added business", () => {
  async function addedBusiness(
    listing: Omit<NewBusinessListing, "businessId"> = ADDED,
  ): Promise<{ businessId: string; claimId: string; listingKey: string }> {
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Gentle" });
    const outcome = await addBusinessListing(dbs.staff.db, { businessId, ...listing }, ADDED_AT);
    if (outcome.kind !== "added") throw new Error("The business was not added");
    return { businessId, claimId: outcome.claimId, listingKey: outcome.listingKey };
  }

  async function claimPlace(businessId: string): Promise<DirectoryPlace> {
    return place((await findClaimForBusiness(dbs.staff.db, businessId))?.placeId);
  }

  it("gets an unlocked place of its own, with the name's slug and the chosen city as its URL", async () => {
    const { businessId } = await addedBusiness();
    expect(await claimPlace(businessId)).toMatchObject({
      origin: "added",
      stateCode: "mh",
      citySlug: "thane",
      urlSlug: "gentle-dental",
      urlLockedAt: null,
    });
  });

  it("cuts a long name to the URL's 70 characters", async () => {
    const slug = `${"gentle-".repeat(11)}dental`;
    const { businessId } = await addedBusiness({ ...ADDED, slug });
    const { urlSlug } = await claimPlace(businessId);
    expect(urlSlug.length).toBeLessThanOrEqual(70);
    expect(slug.startsWith(urlSlug)).toBe(true);
    expect(urlSlug.endsWith("-")).toBe(false);
  });

  it("follows the owner's new name and city while it waits for the call", async () => {
    const { businessId } = await addedBusiness();
    const before = await claimPlace(businessId);
    await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "gentle-dental-care", businessName: "Gentle Dental Care" }, LATER);
    expect(await claimPlace(businessId)).toMatchObject({ id: before.id, citySlug: "thane", urlSlug: "gentle-dental-care", urlLockedAt: null });

    await updateAddedBusinessListing(dbs.staff.db, {
      businessId,
      ...ADDED,
      citySlug: "navi-mumbai",
      areaSlug: "vashi",
      slug: "gentle-dental-care",
      businessName: "Gentle Dental Care",
    }, LATER);
    expect(await claimPlace(businessId)).toMatchObject({ id: before.id, citySlug: "navi-mumbai", urlSlug: "gentle-dental-care" });
  });

  it("keeps its URL when only the category or area changes", async () => {
    const { businessId } = await addedBusiness();
    const before = await claimPlace(businessId);
    const touched = await placeUpdatedAt(before.id);
    const outcome = await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, categorySlug: "dental-clinics", areaSlug: "panch-pakhadi" }, LATER);
    expect(outcome).toEqual({ kind: "updated", listingKey: "dental-clinics/thane/panch-pakhadi/gentle-dental" });
    expect(await claimPlace(businessId)).toEqual(before);
    expect(await placeUpdatedAt(before.id)).toEqual(touched);
  });

  it("is locked when staff approve it, and its address then names its place", async () => {
    await importPlaces();
    const { businessId, claimId } = await addedBusiness();
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: DECIDED_AT })).toBe("decided");
    const live = await claimPlace(businessId);
    expect(live.urlLockedAt).toEqual(DECIDED_AT);
    expect(await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/gentle-dental"])).toEqual(
      new Map([["dentists/thane/naupada/gentle-dental", live.id]]),
    );
  });

  it("does not register its address before the dataset's places are imported: the backfill does that", async () => {
    const { businessId, claimId } = await addedBusiness();
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: DECIDED_AT });
    expect((await claimPlace(businessId)).urlLockedAt).toEqual(DECIDED_AT);
    expect(await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/gentle-dental"])).toEqual(new Map());
  });

  it("is never given an address the dataset gave another business: it gets the next number", async () => {
    await importPlaces();
    const { businessId, claimId, listingKey } = await addedBusiness({ ...ADDED, slug: "smile-dental", businessName: "Smile Dental" });
    expect(listingKey).toBe("dentists/thane/naupada/smile-dental-2");
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: DECIDED_AT });
    const own = await claimPlace(businessId);
    expect(await resolveLegacyKeys(dbs.staff.db, [SMILE_KEY, listingKey])).toEqual(
      new Map([
        [SMILE_KEY, SMILE],
        [listingKey, own.id],
      ]),
    );
  });

  it("is never given an address a client's listing had: it still redirects to that client", async () => {
    await importPlaces();
    const [client] = await dbs.staff.db.insert(businesses).values({ slug: "gentle-client", name: "Gentle Client" }).returning({ id: businesses.id });
    if (client === undefined) throw new Error("No business");
    const listing = { ...PLACEMENT, slug: "gentle-dental" };
    await saveListingPlacement(dbs.staff.db, client.id, listing, LATER);
    // The client moves on, so no listing is at that address any more; its place still answers for it.
    await saveListingPlacement(dbs.staff.db, client.id, { ...listing, areaSlug: "panch-pakhadi" }, LATER);
    const { listingKey } = await addedBusiness();
    expect(listingKey).toBe("dentists/thane/naupada/gentle-dental-2");
  });

  it("keeps its own address when its owner saves it again", async () => {
    await importPlaces();
    const { businessId, listingKey } = await addedBusiness();
    expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, phone: "+919820077009" }, LATER)).toEqual({
      kind: "updated",
      listingKey,
    });
  });

  it("waits for an import or backfill before it is approved or edited", async () => {
    await importPlaces();
    const first = await addedBusiness();
    await expect(
      whileRegistryLocked(() => decideDirectoryClaim(dbs.staff.db, { claimId: first.claimId, approve: true, staffId: STAFF, now: DECIDED_AT })),
    ).resolves.toBe("decided");

    await dbs.staff.db.insert(users).values({ id: "owner-b", name: "Owner B", email: "owner-b@example.com", emailVerified: true });
    const { businessId: second } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: "owner-b", businessName: "Bright" });
    await addBusinessListing(dbs.staff.db, { businessId: second, ...ADDED, slug: "bright-smile", businessName: "Bright Smile" }, ADDED_AT);
    await expect(
      whileRegistryLocked(() =>
        updateAddedBusinessListing(dbs.staff.db, { businessId: second, ...ADDED, slug: "bright-smiles", businessName: "Bright Smiles" }, LATER),
      ),
    ).resolves.toMatchObject({ kind: "updated" });
  });

  it("stays unlocked when staff reject it", async () => {
    const { businessId, claimId } = await addedBusiness();
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: false, staffId: STAFF, now: DECIDED_AT });
    expect((await claimPlace(businessId)).urlLockedAt).toBeNull();
  });

  it("keeps its URL once live: a new display name changes the name only, and the owner's form is refused", async () => {
    const { businessId, claimId } = await addedBusiness();
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: DECIDED_AT });
    const live = await claimPlace(businessId);

    expect(await renameAddedBusiness(dbs.staff.db, businessId, "Gentle Dental Care")).toBe(true);
    expect((await findClaimForBusiness(dbs.staff.db, businessId))?.businessName).toBe("Gentle Dental Care");
    expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...ADDED, slug: "renamed", citySlug: "navi-mumbai" }, LATER)).toEqual({
      kind: "refused",
      reason: "locked",
    });
    expect(await claimPlace(businessId)).toEqual(live);
    expect(live).toMatchObject({ citySlug: "thane", urlSlug: "gentle-dental" });
  });

  it("keeps a live place in its state: a PIN in another state cannot move it", async () => {
    await upsertPincodes(
      dbs.staff.db,
      [
        {
          pincode: "700091",
          stateCode: "wb",
          districtSlug: "north-24-parganas",
          districtName: "North 24 Parganas",
          localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
        },
      ],
      ADDED_AT,
    );
    const { businessId } = await addedBusiness();
    // Its page went live some other way (a client took it over) while the owner's claim still waits.
    const placeId = (await claimPlace(businessId)).id;
    await lockPlaceUrl(dbs.staff.db, placeId, DECIDED_AT);
    const live = await claimPlace(businessId);

    const kolkata: Omit<NewBusinessListing, "businessId"> = {
      ...ADDED,
      stateCode: "wb",
      citySlug: "wb-north-24-parganas",
      areaSlug: "salt-lake-sector-v",
      postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
    };
    expect(await updateAddedBusinessListing(dbs.staff.db, { businessId, ...kolkata }, LATER)).toEqual({ kind: "refused", reason: "locked" });
    // The state alone, with the URL as it is, is refused too.
    await expect(
      updatePendingPlaceUrl(dbs.staff.db, placeId, { stateCode: "wb", citySlug: live.citySlug, urlSlug: live.urlSlug }, LATER),
    ).rejects.toBeInstanceOf(PlaceUrlLockedError);
    expect(await claimPlace(businessId)).toEqual(live);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ pincode: null, localityName: null });
  });
});

describe("a client's listing", () => {
  let client = "";
  let other = "";

  beforeEach(async () => {
    const inserted = await dbs.staff.db
      .insert(businesses)
      .values([
        { slug: "bright-teeth", name: "Bright Teeth" },
        { slug: "other-client", name: "Other Client" },
      ])
      .returning({ id: businesses.id, slug: businesses.slug });
    client = inserted.find((row) => row.slug === "bright-teeth")?.id ?? "";
    other = inserted.find((row) => row.slug === "other-client")?.id ?? "";
  });

  async function listingPlace(businessId: string): Promise<DirectoryPlace> {
    const rows = await dbs.staff.db.select({ placeId: directoryListings.placeId }).from(directoryListings).where(eq(directoryListings.businessId, businessId));
    return place(rows[0]?.placeId);
  }

  it("gets a locked client place of its own, and its address names it", async () => {
    await importPlaces();
    const saved = await saveListingPlacement(dbs.staff.db, client, PLACEMENT, LATER);
    const own = await place(saved.placeId);
    expect(own).toMatchObject({ origin: "client", citySlug: "thane", urlSlug: "bright-teeth-clinic", urlLockedAt: LATER });
    expect(own.id).toMatch(/^[2-9]/);
    expect(await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/bright-teeth-clinic"])).toEqual(
      new Map([["dentists/thane/naupada/bright-teeth-clinic", own.id]]),
    );
  });

  it("takes over the business staff chose, keeping its id and URL", async () => {
    await importPlaces();
    const saved = await saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: SMILE }, LATER);
    expect(saved.placeId).toBe(SMILE);
    expect(await place(SMILE)).toMatchObject({ origin: "client", citySlug: "thane", urlSlug: "smile-dental", urlLockedAt: ADDED_AT });
  });

  it("takes over the business its replaced address names", async () => {
    await importPlaces();
    const saved = await saveListingPlacement(
      dbs.staff.db,
      client,
      { ...PLACEMENT, replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental" },
      LATER,
    );
    expect(saved.placeId).toBe(SMILE);
  });

  it("takes over the open-data business at its own address", async () => {
    await importPlaces();
    const saved = await saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, slug: "smile-dental" }, LATER);
    expect(saved.placeId).toBe(SMILE);
    expect((await place(SMILE)).origin).toBe("client");
  });

  it("does not take over a business another client's listing already has", async () => {
    await importPlaces();
    await saveListingPlacement(dbs.staff.db, other, { ...PLACEMENT, slug: "other-client", takeOverPlaceId: SMILE }, LATER);
    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: SMILE }, LATER)).rejects.toMatchObject({
      name: "ListingPlaceTakenError",
      reason: "listing",
    });
    // Its own address names that business too, but a business has one listing: it gets a fresh place instead.
    const saved = await saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, slug: "smile-dental" }, LATER);
    expect(saved.placeId).not.toBe(SMILE);
  });

  it("refuses a business that does not exist", async () => {
    await importPlaces();
    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: "zzzzzz2" }, LATER)).rejects.toBeInstanceOf(
      UnknownPlaceError,
    );
    expect(await dbs.staff.db.select().from(directoryListings)).toEqual([]);
  });

  it("keeps its URL when staff move its area, category or name part, and remembers every address", async () => {
    await importPlaces();
    const first = await saveListingPlacement(dbs.staff.db, client, PLACEMENT, LATER);
    const before = await listingPlace(client);
    const moved = await saveListingPlacement(
      dbs.staff.db,
      client,
      { ...PLACEMENT, categorySlug: "dental-clinics", areaSlug: "panch-pakhadi", slug: "bright-teeth" },
      DECIDED_AT,
    );
    expect(moved.placeId).toBe(first.placeId);
    expect(moved.previousPaths).toEqual(["/in/dentists/mh/thane/naupada/bright-teeth-clinic"]);
    expect(await listingPlace(client)).toEqual(before);
    expect(await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/bright-teeth-clinic", "dental-clinics/thane/panch-pakhadi/bright-teeth"])).toEqual(
      new Map([
        ["dentists/thane/naupada/bright-teeth-clinic", before.id],
        ["dental-clinics/thane/panch-pakhadi/bright-teeth", before.id],
      ]),
    );
  });

  it("refuses to swap the business a listing already is, by id or by a newly replaced address", async () => {
    await importPlaces();
    const first = await saveListingPlacement(dbs.staff.db, client, PLACEMENT, LATER);
    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: GLOW }, LATER)).rejects.toBeInstanceOf(
      ListingPlaceFixedError,
    );
    await expect(
      saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, replacesSourcePath: "/in/salons/mh/thane/vasant-vihar/glow-studio" }, LATER),
    ).rejects.toBeInstanceOf(ListingPlaceFixedError);
    // A replaced address that names no business, or the listing's own, is kept for the feed as before.
    const unplaced = await saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, replacesSourcePath: "/in/dentists/mh/thane/naupada/old-page" }, LATER);
    expect(unplaced).toMatchObject({ placeId: first.placeId, replacesSourcePath: "/in/dentists/mh/thane/naupada/old-page" });
  });

  it("saves again with the replaced address it was created with", async () => {
    await importPlaces();
    const replaced = { ...PLACEMENT, replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental" };
    expect((await saveListingPlacement(dbs.staff.db, client, replaced, LATER)).placeId).toBe(SMILE);
    expect((await saveListingPlacement(dbs.staff.db, client, { ...replaced, pinLabel: "Moved the pin" }, LATER)).placeId).toBe(SMILE);
  });

  it("never takes over a business its owner added, chosen by id or by its address", async () => {
    await importPlaces();
    const { businessId } = await createUnlistedAccountBusiness(dbs.staff.db, { userId: OWNER, businessName: "Gentle" });
    const added = await addBusinessListing(dbs.staff.db, { businessId, ...ADDED }, ADDED_AT);
    if (added.kind !== "added") throw new Error("The business was not added");
    const addedPlace = (await findClaimForBusiness(dbs.staff.db, businessId))?.placeId ?? "";

    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: addedPlace }, LATER)).rejects.toMatchObject({
      name: "ListingPlaceTakenError",
      reason: "added",
    });
    await decideDirectoryClaim(dbs.staff.db, { claimId: added.claimId, approve: true, staffId: STAFF, now: DECIDED_AT });
    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: addedPlace }, LATER)).rejects.toMatchObject({
      name: "ListingPlaceTakenError",
      reason: "added",
    });
    await expect(
      saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, replacesSourcePath: "/in/dentists/mh/thane/naupada/gentle-dental" }, LATER),
    ).rejects.toMatchObject({ name: "ListingPlaceTakenError", reason: "added" });
    expect((await place(addedPlace)).origin).toBe("added");
    expect(await dbs.staff.db.select().from(directoryListings)).toEqual([]);
  });

  it("refuses a business id before the dataset's places are imported, rather than dropping it", async () => {
    await expect(saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, takeOverPlaceId: SMILE }, LATER)).rejects.toBeInstanceOf(
      PlaceRegistryNotImportedError,
    );
    expect(await dbs.staff.db.select().from(directoryListings)).toEqual([]);
  });

  it("waits for a whole import, so it never takes an address a later batch of the import names", async () => {
    // Enough rows for several batches; the address the client is saved at is in the last one.
    const rows: OpenDataPlaceRow[] = Array.from({ length: 1_600 }, (_, index) => ({
      sourceRef: `osm:node/${index + 10}`,
      id: openDataId(index),
      citySlug: "thane",
      urlSlug: `shop-${index}`,
      legacyKey: `shops/thane/naupada/shop-${index}`,
    }));
    const last = rows[rows.length - 1];
    if (last === undefined) throw new Error("No rows");
    const importing = importOpenDataPlaces(dbs.staff.db, rows, ADDED_AT);
    // Saved as soon as the import has committed something, while its later batches are still to come.
    for (let attempt = 0; attempt < 500; attempt += 1) {
      if ((await dbs.staff.db.$count(directoryPlaces)) > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const saving = saveListingPlacement(dbs.staff.db, client, { ...PLACEMENT, categorySlug: "shops", slug: `shop-${rows.length - 1}` }, LATER);
    await expect(importing).resolves.toEqual({ created: rows.length, unchanged: 0 });
    expect((await saving).placeId).toBe(last.id);
  });

  it("gives a listing saved before the dataset's places are imported no place: the backfill decides it", async () => {
    const saved = await saveListingPlacement(dbs.staff.db, client, PLACEMENT, LATER);
    expect(saved.placeId).toBeNull();
    expect(await dbs.staff.db.select().from(directoryPlaces)).toEqual([]);
  });
});

describe("a staff URL change", () => {
  it("stores the reason without the spaces around it", async () => {
    await importPlaces();
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, SMILE, { citySlug: "thane", urlSlug: "smile-dental-care" }, { staffUserId: STAFF, reason: "  Rebranded  " }, LATER),
    );
    const changes = await dbs.staff.db.select({ reason: directoryPlaceUrlChanges.reason }).from(directoryPlaceUrlChanges);
    expect(changes).toEqual([{ reason: "Rebranded" }]);
  });
});
