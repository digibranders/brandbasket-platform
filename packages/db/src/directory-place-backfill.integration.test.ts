import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { publishDirectoryReviewFromOtp, restoreDirectoryReview } from "./queries/directory";
import {
  backfillDirectoryPlaces,
  DuplicateApprovedClaimsError,
  DuplicateClientListingsError,
  NoOpenDataPlacesError,
  type DirectoryPlaceBackfillResult,
} from "./queries/directory-place-backfill";
import { findPlaces, importOpenDataPlaces, resolveLegacyKeys, type OpenDataPlaceRow } from "./queries/directory-places";
import {
  businesses,
  directoryAdBids,
  directoryClaims,
  directoryDailyCounts,
  directoryEnquiries,
  directoryListings,
  directoryPlaceLegacyKeys,
  directoryPlaces,
  directoryReviewOtps,
  directoryReviews,
  directoryStaffAds,
  directoryVerifications,
  users,
} from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const LATER = new Date("2026-10-02T10:00:00.000Z");
const EARLIER = new Date("2026-09-01T10:00:00.000Z");
const STAFF = "staff-1";

const SMILE_KEY = "dentists/thane/naupada/smile-dental";
const CLIENT_KEY = "dentists/thane/naupada/smile-dental-clinic";
const OLD_CLIENT_KEY = "dentists/thane/naupada/smile-dental-old";
const GYM_KEY = "gyms/thane/naupada/iron-gym";
const SMILE: OpenDataPlaceRow = { sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: SMILE_KEY };
const GYM: OpenDataPlaceRow = { sourceRef: "overture:abc", id: "b3cdefg", citySlug: "thane", urlSlug: "iron-gym", legacyKey: GYM_KEY };

const PHONE_1 = "+919820000001";
const PHONE_2 = "+919820000002";
const PHONE_3 = "+919820000003";

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
  await importOpenDataPlaces(dbs.staff.db, [SMILE, GYM], EARLIER);
});

async function newBusiness(slug: string): Promise<string> {
  const rows = await dbs.staff.db.insert(businesses).values({ name: slug, slug }).returning({ id: businesses.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Inserting a business returned no row");
  return id;
}

interface ClientListing {
  readonly slug: string;
  readonly replacesSourcePath?: string | null;
  readonly previousPaths?: readonly string[];
}

/** A client's Featured listing at dentists/thane/naupada/<slug>. Returns its business id. */
async function newClientListing(listing: ClientListing): Promise<string> {
  const businessId = await newBusiness(`client-${listing.slug}`);
  await dbs.staff.db.insert(directoryListings).values({
    businessId,
    categorySlug: "dentists",
    stateCode: "mh",
    citySlug: "thane",
    areaSlug: "naupada",
    slug: listing.slug,
    lat: 19.19,
    lon: 72.97,
    pinLabel: "Gokhale Road",
    replacesSourcePath: listing.replacesSourcePath ?? null,
    previousPaths: [...(listing.previousPaths ?? [])],
  });
  return businessId;
}

async function newClaim(input: {
  readonly listingKey: string;
  readonly origin?: "claimed" | "added";
  readonly approved?: boolean;
  readonly rejected?: boolean;
}): Promise<string> {
  const businessId = await newBusiness(`claim-${input.listingKey.replaceAll("/", "-")}`);
  const approved = input.approved ?? false;
  const decided = approved || (input.rejected ?? false);
  const rows = await dbs.staff.db
    .insert(directoryClaims)
    .values({
      businessId,
      listingKey: input.listingKey,
      businessName: "Claimed Business",
      phone: PHONE_3,
      origin: input.origin ?? "claimed",
      streetAddress: input.origin === "added" ? "Gokhale Road" : null,
      status: approved ? "approved" : input.rejected === true ? "rejected" : "pending",
      decidedAt: decided ? EARLIER : null,
      decidedByUserId: decided ? STAFF : null,
    })
    .returning({ id: directoryClaims.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Inserting a claim returned no row");
  return id;
}

async function newReview(listingKey: string, phone: string, updatedAt: Date): Promise<string> {
  const rows = await dbs.staff.db
    .insert(directoryReviews)
    .values({ listingKey, businessName: "Smile Dental", reviewerName: "Asha", phone, rating: 5, createdAt: updatedAt, updatedAt })
    .returning({ id: directoryReviews.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Inserting a review returned no row");
  return id;
}

/** A confirmed-code review waiting at `listingKey`, as the website's review form leaves it. */
async function newReviewOtp(listingKey: string, phone: string, rating: number): Promise<string> {
  const rows = await dbs.staff.db
    .insert(directoryReviewOtps)
    .values({
      listingKey,
      phone,
      codeHash: "hash",
      payload: { businessName: "Smile Dental", reviewerName: "Asha", rating, text: null, highlights: [] },
      expiresAt: new Date(LATER.getTime() + 60 * 60 * 1000),
    })
    .returning({ id: directoryReviewOtps.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Inserting a review code returned no row");
  return id;
}

async function reviewsById(): Promise<ReadonlyMap<string, { placeId: string | null; status: string; hiddenAt: Date | null }>> {
  const rows = await dbs.staff.db
    .select({ id: directoryReviews.id, placeId: directoryReviews.placeId, status: directoryReviews.status, hiddenAt: directoryReviews.hiddenAt })
    .from(directoryReviews);
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

/** Everything the backfill may touch, to prove a second run (or a refused one) changes nothing. */
async function snapshot(): Promise<unknown> {
  const [places, legacy, listings, reviews, claims, counts, verifications] = await Promise.all([
    dbs.staff.db.select().from(directoryPlaces).orderBy(asc(directoryPlaces.id)),
    dbs.staff.db.select().from(directoryPlaceLegacyKeys).orderBy(asc(directoryPlaceLegacyKeys.listingKey)),
    dbs.staff.db.select().from(directoryListings).orderBy(asc(directoryListings.businessId)),
    dbs.staff.db.select().from(directoryReviews).orderBy(asc(directoryReviews.id)),
    dbs.staff.db.select().from(directoryClaims).orderBy(asc(directoryClaims.id)),
    dbs.staff.db
      .select()
      .from(directoryDailyCounts)
      .orderBy(asc(directoryDailyCounts.listingKey), asc(directoryDailyCounts.day), asc(directoryDailyCounts.kind)),
    dbs.staff.db.select().from(directoryVerifications).orderBy(asc(directoryVerifications.listingKey)),
  ]);
  return { places, legacy, listings, reviews, claims, counts, verifications };
}

function expectNoChanges(result: DirectoryPlaceBackfillResult): void {
  expect(result.createdPlaces).toBe(0);
  expect(result.takenOver).toBe(0);
  expect(result.reviewsHidden).toBe(0);
  expect(result.dailyCountsMerged).toBe(0);
  expect(result.verificationsRemoved).toBe(0);
  for (const [table, counts] of Object.entries(result.perTable)) expect(counts.backfilled, table).toBe(0);
}

describe("backfillDirectoryPlaces", () => {
  it("lets a client take over the open-data business it replaces, with its reviews from every address", async () => {
    const client = await newClientListing({
      slug: "smile-dental-clinic",
      replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental`,
      previousPaths: [`/in/dentists/mh/thane/naupada/smile-dental-old`],
    });
    const atOpenData = await newReview(SMILE_KEY, PHONE_1, EARLIER);
    const atClient = await newReview(CLIENT_KEY, PHONE_1, NOW);
    const atPrevious = await newReview(OLD_CLIENT_KEY, PHONE_2, NOW);
    const atGym = await newReview(GYM_KEY, PHONE_1, NOW);
    await dbs.staff.db.insert(directoryEnquiries).values({
      listingKey: CLIENT_KEY,
      businessName: "Smile Dental Clinic",
      serviceLabel: "Dentists",
      areaLabel: "Naupada",
      kind: "business",
      name: "Ravi",
      phone: PHONE_2,
    });
    await dbs.staff.db.insert(directoryEnquiries).values({
      serviceLabel: "Dentists",
      areaLabel: "Naupada",
      kind: "top_list",
      name: "Ravi",
      phone: PHONE_2,
    });
    await dbs.staff.db.insert(directoryReviewOtps).values({
      listingKey: OLD_CLIENT_KEY,
      phone: PHONE_2,
      codeHash: "hash",
      payload: {},
      expiresAt: LATER,
    });
    await dbs.staff.db.insert(directoryStaffAds).values({
      listingKey: GYM_KEY,
      businessName: "Iron Gym",
      categorySlug: "gyms",
      citySlug: "thane",
      areaSlug: "naupada",
      placement: "top",
      spot: 1,
      weekStart: "2026-10-05",
      placedByUserId: STAFF,
    });
    const claimId = await newClaim({ listingKey: SMILE_KEY });
    await dbs.staff.db.insert(directoryAdBids).values({
      businessId: await newBusiness("bidder"),
      listingKey: CLIENT_KEY,
      categorySlug: "dentists",
      citySlug: "thane",
      areaSlug: "naupada",
      placement: "top",
      weekStart: "2026-10-05",
      amountPaise: 50_000,
      amountSetAt: NOW,
    });

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const [listing] = await dbs.staff.db.select().from(directoryListings).where(eq(directoryListings.businessId, client));
    expect(listing?.placeId).toBe(SMILE.id);
    const places = await findPlaces(dbs.staff.db, [SMILE.id, GYM.id]);
    expect(places.get(SMILE.id)).toMatchObject({ origin: "client", urlSlug: "smile-dental", urlLockedAt: EARLIER });
    expect(places.get(GYM.id)).toMatchObject({ origin: "open_data", urlSlug: "iron-gym", urlLockedAt: EARLIER });
    const legacy = await resolveLegacyKeys(dbs.staff.db, [SMILE_KEY, CLIENT_KEY, OLD_CLIENT_KEY, GYM_KEY]);
    expect(Object.fromEntries(legacy)).toEqual({
      [SMILE_KEY]: SMILE.id,
      [CLIENT_KEY]: SMILE.id,
      [OLD_CLIENT_KEY]: SMILE.id,
      [GYM_KEY]: GYM.id,
    });

    const reviews = await reviewsById();
    expect(reviews.get(atOpenData)).toEqual({ placeId: SMILE.id, status: "hidden", hiddenAt: NOW });
    expect(reviews.get(atClient)).toEqual({ placeId: SMILE.id, status: "published", hiddenAt: null });
    expect(reviews.get(atPrevious)).toEqual({ placeId: SMILE.id, status: "published", hiddenAt: null });
    expect(reviews.get(atGym)).toEqual({ placeId: GYM.id, status: "published", hiddenAt: null });
    const [claim] = await dbs.staff.db.select().from(directoryClaims).where(eq(directoryClaims.id, claimId));
    expect(claim?.placeId).toBe(SMILE.id);
    expect((await dbs.staff.db.select().from(directoryReviewOtps))[0]?.placeId).toBe(SMILE.id);
    expect((await dbs.staff.db.select().from(directoryStaffAds))[0]?.placeId).toBe(GYM.id);
    expect((await dbs.staff.db.select().from(directoryAdBids))[0]?.placeId).toBe(SMILE.id);
    const enquiries = await dbs.staff.db.select().from(directoryEnquiries).orderBy(asc(directoryEnquiries.kind));
    expect(enquiries.map((row) => [row.kind, row.placeId])).toEqual([
      ["business", SMILE.id],
      ["top_list", null],
    ]);

    expect(result).toMatchObject({ createdPlaces: 0, takenOver: 1, reviewsHidden: 1, unknownKeys: [] });
    expect(result.perTable.directory_listings).toEqual({ backfilled: 1, leftNull: 0 });
    expect(result.perTable.directory_reviews).toEqual({ backfilled: 4, leftNull: 0 });
    // A top-list enquiry is about no business, so it is neither backfilled nor left behind.
    expect(result.perTable.directory_enquiries).toEqual({ backfilled: 1, leftNull: 0 });
    expect(result.perTable.directory_claims).toEqual({ backfilled: 1, leftNull: 0 });

    const before = await snapshot();
    expectNoChanges(await backfillDirectoryPlaces(dbs.staff.db, LATER));
    expect(await snapshot()).toEqual(before);
  });

  it("gives a client that replaces nothing a fresh, locked, digit-first place, and never takes another's address", async () => {
    // The client's earlier address is now the gym's: the gym's live page keeps it.
    const client = await newClientListing({ slug: "bright-teeth", previousPaths: [`/in/gyms/mh/thane/naupada/iron-gym`] });
    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const [listing] = await dbs.staff.db.select().from(directoryListings).where(eq(directoryListings.businessId, client));
    const placeId = listing?.placeId ?? "";
    expect(placeId).toMatch(/^[2-9][23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
    expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)).toMatchObject({
      origin: "client",
      citySlug: "thane",
      urlSlug: "bright-teeth",
      urlLockedAt: NOW,
    });
    const legacy = await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/bright-teeth", GYM_KEY]);
    expect(Object.fromEntries(legacy)).toEqual({ "dentists/thane/naupada/bright-teeth": placeId, [GYM_KEY]: GYM.id });
    expect(result).toMatchObject({ createdPlaces: 1, takenOver: 0 });
  });

  it("gives an owner-added business its own digit-first place, locked once its claim is approved", async () => {
    const pendingKey = "cafes/thane/naupada/new-cafe";
    const approvedKey = "cafes/thane/naupada/old-cafe";
    const pending = await newClaim({ listingKey: pendingKey, origin: "added" });
    const approved = await newClaim({ listingKey: approvedKey, origin: "added", approved: true });
    await newReview(approvedKey, PHONE_1, NOW);

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const claims = await dbs.staff.db.select({ id: directoryClaims.id, placeId: directoryClaims.placeId }).from(directoryClaims);
    const placeOf = new Map(claims.map((row) => [row.id, row.placeId ?? ""]));
    const pendingPlace = placeOf.get(pending) ?? "";
    const approvedPlace = placeOf.get(approved) ?? "";
    const places = await findPlaces(dbs.staff.db, [pendingPlace, approvedPlace]);
    expect(places.get(pendingPlace)).toMatchObject({ origin: "added", citySlug: "thane", urlSlug: "new-cafe", urlLockedAt: null });
    expect(places.get(approvedPlace)).toMatchObject({ origin: "added", citySlug: "thane", urlSlug: "old-cafe", urlLockedAt: NOW });
    expect(pendingPlace).toMatch(/^[2-9]/);
    expect(approvedPlace).toMatch(/^[2-9]/);
    expect(Object.fromEntries(await resolveLegacyKeys(dbs.staff.db, [pendingKey, approvedKey]))).toEqual({
      [pendingKey]: pendingPlace,
      [approvedKey]: approvedPlace,
    });
    expect((await dbs.staff.db.select().from(directoryReviews))[0]?.placeId).toBe(approvedPlace);
    expect(result).toMatchObject({ createdPlaces: 2 });

    const before = await snapshot();
    expectNoChanges(await backfillDirectoryPlaces(dbs.staff.db, LATER));
    expect(await snapshot()).toEqual(before);
  });

  it("reuses the place an added business's key already names", async () => {
    const claim = await newClaim({ listingKey: SMILE_KEY, origin: "added" });
    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);
    const [row] = await dbs.staff.db.select().from(directoryClaims).where(eq(directoryClaims.id, claim));
    expect(row?.placeId).toBe(SMILE.id);
    expect(result.createdPlaces).toBe(0);
  });

  it("leaves a key no place knows NULL and reports it", async () => {
    const goneKey = "dentists/thane/naupada/gone-dental";
    await newReview(goneKey, PHONE_1, NOW);
    await newReview(SMILE_KEY, PHONE_1, NOW);
    await dbs.staff.db.insert(directoryDailyCounts).values({ listingKey: goneKey, day: "2026-09-30", kind: "view", count: 2 });

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    expect(result.unknownKeys).toEqual([goneKey]);
    expect(result.perTable.directory_reviews).toEqual({ backfilled: 1, leftNull: 1 });
    expect(result.perTable.directory_daily_counts).toEqual({ backfilled: 0, leftNull: 1 });
    const gone = await dbs.staff.db.select().from(directoryReviews).where(eq(directoryReviews.listingKey, goneKey));
    expect(gone[0]?.placeId).toBeNull();
  });

  it("adds up a place's daily counts from every key into one row", async () => {
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    await dbs.staff.db.insert(directoryDailyCounts).values([
      { listingKey: SMILE_KEY, day: "2026-09-30", kind: "view", count: 3 },
      { listingKey: CLIENT_KEY, day: "2026-09-30", kind: "view", count: 4 },
      { listingKey: SMILE_KEY, day: "2026-09-30", kind: "call", count: 1 },
      { listingKey: CLIENT_KEY, day: "2026-09-29", kind: "view", count: 5 },
    ]);

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const rows = await dbs.staff.db
      .select({ placeId: directoryDailyCounts.placeId, day: directoryDailyCounts.day, kind: directoryDailyCounts.kind, count: directoryDailyCounts.count })
      .from(directoryDailyCounts)
      .orderBy(asc(directoryDailyCounts.day), asc(directoryDailyCounts.kind));
    expect(rows).toEqual([
      { placeId: SMILE.id, day: "2026-09-29", kind: "view", count: 5 },
      { placeId: SMILE.id, day: "2026-09-30", kind: "view", count: 7 },
      { placeId: SMILE.id, day: "2026-09-30", kind: "call", count: 1 },
    ]);
    expect(result.dailyCountsMerged).toBe(1);
    expect(result.perTable.directory_daily_counts).toEqual({ backfilled: 3, leftNull: 0 });

    const before = await snapshot();
    expectNoChanges(await backfillDirectoryPlaces(dbs.staff.db, LATER));
    expect(await snapshot()).toEqual(before);
  });

  it("keeps a place's latest verification", async () => {
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    await dbs.staff.db.insert(directoryVerifications).values([
      { listingKey: SMILE_KEY, businessName: "Smile Dental", phone: PHONE_1, verifiedAt: EARLIER, verifiedByUserId: STAFF },
      { listingKey: CLIENT_KEY, businessName: "Smile Dental Clinic", phone: PHONE_2, verifiedAt: NOW, verifiedByUserId: STAFF },
    ]);

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const rows = await dbs.staff.db.select().from(directoryVerifications);
    expect(rows.map((row) => [row.listingKey, row.placeId, row.phone])).toEqual([[CLIENT_KEY, SMILE.id, PHONE_2]]);
    expect(result.verificationsRemoved).toBe(1);
  });

  it("refuses two approved claims on one place, naming both, and changes nothing", async () => {
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const first = await newClaim({ listingKey: SMILE_KEY, approved: true });
    const second = await newClaim({ listingKey: CLIENT_KEY, approved: true });
    await newReview(SMILE_KEY, PHONE_1, NOW);
    const before = await snapshot();

    const refused = backfillDirectoryPlaces(dbs.staff.db, NOW);
    await expect(refused).rejects.toBeInstanceOf(DuplicateApprovedClaimsError);
    const error: unknown = await backfillDirectoryPlaces(dbs.staff.db, NOW).catch((caught: unknown) => caught);
    expect(error instanceof DuplicateApprovedClaimsError ? error.conflicts : []).toEqual([
      { placeId: SMILE.id, claimIds: [first, second].sort() },
    ]);
    expect(String(error)).toContain(first);
    expect(String(error)).toContain(second);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses two client listings that replace one business, and changes nothing", async () => {
    const first = await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const second = await newClientListing({ slug: "smile-dental-care", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const before = await snapshot();

    const error: unknown = await backfillDirectoryPlaces(dbs.staff.db, NOW).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DuplicateClientListingsError);
    const conflicts = error instanceof DuplicateClientListingsError ? error.conflicts : [];
    expect(conflicts.map((conflict) => ({ ...conflict, businessIds: [...conflict.businessIds].sort() }))).toEqual([
      { placeId: SMILE.id, businessIds: [first, second].sort() },
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it("cuts a long client slug to the URL's 70 characters", async () => {
    const slug = `${"a".repeat(69)}-b-${"c".repeat(8)}`;
    const client = await newClientListing({ slug });
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    const [listing] = await dbs.staff.db.select().from(directoryListings).where(eq(directoryListings.businessId, client));
    const placeId = listing?.placeId ?? "";
    expect((await findPlaces(dbs.staff.db, [placeId])).get(placeId)?.urlSlug).toBe("a".repeat(69));
    const counted = await dbs.owner.db.execute<{ keys: number }>(
      sql`select count(*)::int as keys from directory_place_legacy_keys where place_id = ${placeId}`,
    );
    expect(counted.rows[0]?.keys).toBe(1);
  });

  it("refuses to run before the open-data places are imported, and changes nothing", async () => {
    await resetTestDatabase(dbs.owner);
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    await newClaim({ listingKey: GYM_KEY, origin: "added" });
    const before = await snapshot();

    await expect(backfillDirectoryPlaces(dbs.staff.db, NOW)).rejects.toBeInstanceOf(NoOpenDataPlacesError);
    await expect(backfillDirectoryPlaces(dbs.staff.db, NOW)).rejects.toThrow(/directory:import-places/);
    expect(await snapshot()).toEqual(before);
  });

  it("lets a client at an open-data business's own address take it over, though it names nothing it replaces", async () => {
    const client = await newClientListing({ slug: "smile-dental" });
    await newReview(SMILE_KEY, PHONE_1, NOW);

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const [listing] = await dbs.staff.db.select().from(directoryListings).where(eq(directoryListings.businessId, client));
    expect(listing?.placeId).toBe(SMILE.id);
    expect((await findPlaces(dbs.staff.db, [SMILE.id])).get(SMILE.id)?.origin).toBe("client");
    expect((await dbs.staff.db.select().from(directoryReviews))[0]?.placeId).toBe(SMILE.id);
    expect(result).toMatchObject({ createdPlaces: 0, takenOver: 1 });
  });

  it("leaves an open-data business to the client that names it, when another client sits at its address", async () => {
    const named = await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const sitting = await newClientListing({ slug: "smile-dental" });

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    const listings = await dbs.staff.db.select().from(directoryListings);
    const placeOf = new Map(listings.map((row) => [row.businessId, row.placeId]));
    expect(placeOf.get(named)).toBe(SMILE.id);
    expect(placeOf.get(sitting)).toMatch(/^[2-9]/);
    expect(result).toMatchObject({ createdPlaces: 1, takenOver: 1 });
  });

  it("refuses a second client listing that replaces a business already taken over, and changes nothing", async () => {
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    await newClientListing({ slug: "smile-dental-care", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const before = await snapshot();

    await expect(backfillDirectoryPlaces(dbs.staff.db, LATER)).rejects.toBeInstanceOf(DuplicateClientListingsError);
    expect(await snapshot()).toEqual(before);
  });

  it("never lets a client take over a business its owner added, by its replaced address or its own", async () => {
    const addedKey = "dentists/thane/naupada/gentle-dental";
    const claim = await newClaim({ listingKey: addedKey, origin: "added", approved: true });
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    const [claimed] = await dbs.staff.db.select({ placeId: directoryClaims.placeId }).from(directoryClaims).where(eq(directoryClaims.id, claim));
    const addedPlace = claimed?.placeId ?? "";
    expect(addedPlace).toMatch(/^[2-9]/);

    const naming = await newClientListing({ slug: "gentle-dental-clinic", replacesSourcePath: `/in/${addedKey.replace("dentists/", "dentists/mh/")}` });
    const sitting = await newClientListing({ slug: "gentle-dental" });
    const result = await backfillDirectoryPlaces(dbs.staff.db, LATER);

    const listings = await dbs.staff.db.select().from(directoryListings);
    const placeOf = new Map(listings.map((row) => [row.businessId, row.placeId ?? ""]));
    for (const business of [naming, sitting]) {
      expect(placeOf.get(business)).toMatch(/^[2-9]/);
      expect(placeOf.get(business)).not.toBe(addedPlace);
    }
    expect((await findPlaces(dbs.staff.db, [addedPlace])).get(addedPlace)?.origin).toBe("added");
    expect(Object.fromEntries(await resolveLegacyKeys(dbs.staff.db, [addedKey]))).toEqual({ [addedKey]: addedPlace });
    expect(result).toMatchObject({ createdPlaces: 2, takenOver: 0 });
  });

  it("registers an added business's new address on a re-run, after its owner changed it", async () => {
    const claim = await newClaim({ listingKey: "cafes/thane/naupada/new-cafe", origin: "added" });
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    const [before] = await dbs.staff.db.select().from(directoryClaims).where(eq(directoryClaims.id, claim));
    await dbs.staff.db
      .update(directoryClaims)
      .set({ listingKey: "cafes/thane/naupada/new-cafe-house" })
      .where(eq(directoryClaims.id, claim));

    const result = await backfillDirectoryPlaces(dbs.staff.db, LATER);

    const legacy = await resolveLegacyKeys(dbs.staff.db, ["cafes/thane/naupada/new-cafe", "cafes/thane/naupada/new-cafe-house"]);
    expect([...new Set(legacy.values())]).toEqual([before?.placeId]);
    expect(legacy.size).toBe(2);
    expect(result).toMatchObject({ createdPlaces: 0, legacyKeysAdded: 1 });
  });

  it("makes no place for a rejected claim", async () => {
    const rejectedKey = "cafes/thane/naupada/refused-cafe";
    await newClaim({ listingKey: rejectedKey, origin: "added", rejected: true });

    const result = await backfillDirectoryPlaces(dbs.staff.db, NOW);

    expect(result.createdPlaces).toBe(0);
    expect((await resolveLegacyKeys(dbs.staff.db, [rejectedKey])).size).toBe(0);
    expect(result.perTable.directory_claims).toEqual({ backfilled: 0, leftNull: 1 });
    expect(result.unknownKeys).toEqual([rejectedKey]);
  });

  it("picks up rows written by key since the last run, merging them into the place's rows", async () => {
    await newClientListing({
      slug: "smile-dental-clinic",
      replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental`,
      previousPaths: [`/in/dentists/mh/thane/naupada/smile-dental-old`],
    });
    await dbs.staff.db.insert(directoryDailyCounts).values([
      { listingKey: SMILE_KEY, day: "2026-09-30", kind: "view", count: 1 },
      { listingKey: CLIENT_KEY, day: "2026-09-30", kind: "view", count: 10 },
      { listingKey: OLD_CLIENT_KEY, day: "2026-09-30", kind: "view", count: 100 },
    ]);
    const kept = await newReview(SMILE_KEY, PHONE_1, EARLIER);
    expect((await backfillDirectoryPlaces(dbs.staff.db, NOW)).dailyCountsMerged).toBe(2);

    // The website still writes by key until the platform takes ids: a new counter and a newer review.
    await dbs.staff.db.insert(directoryDailyCounts).values({ listingKey: OLD_CLIENT_KEY, day: "2026-09-30", kind: "view", count: 1 });
    const newer = await newReview(CLIENT_KEY, PHONE_1, NOW);
    const result = await backfillDirectoryPlaces(dbs.staff.db, LATER);

    const counts = await dbs.staff.db.select().from(directoryDailyCounts);
    expect(counts.map((row) => [row.listingKey, row.placeId, row.count])).toEqual([[SMILE_KEY, SMILE.id, 112]]);
    const reviews = await reviewsById();
    expect(reviews.get(kept)).toEqual({ placeId: SMILE.id, status: "hidden", hiddenAt: LATER });
    expect(reviews.get(newer)).toEqual({ placeId: SMILE.id, status: "published", hiddenAt: null });
    expect(result).toMatchObject({ dailyCountsMerged: 1, reviewsHidden: 1 });
    expect(result.perTable.directory_reviews.backfilled).toBe(1);
  });

  it("breaks ties the same way every time: the later review, and the first verification by key", async () => {
    await newClientListing({ slug: "smile-dental-clinic", replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental` });
    const first = await newReview(CLIENT_KEY, PHONE_1, NOW);
    const second = await newReview(SMILE_KEY, PHONE_1, NOW);
    await dbs.staff.db.insert(directoryVerifications).values([
      { listingKey: CLIENT_KEY, businessName: "Smile Dental Clinic", phone: PHONE_2, verifiedAt: NOW, verifiedByUserId: STAFF },
      { listingKey: SMILE_KEY, businessName: "Smile Dental", phone: PHONE_1, verifiedAt: NOW, verifiedByUserId: STAFF },
    ]);

    await backfillDirectoryPlaces(dbs.staff.db, NOW);

    // Ids are time-ordered (uuidv7), so with equal times the review written last stays.
    const reviews = await reviewsById();
    expect(reviews.get(first)?.status).toBe("hidden");
    expect(reviews.get(second)?.status).toBe("published");
    const verifications = await dbs.staff.db.select().from(directoryVerifications);
    expect(verifications.map((row) => row.listingKey)).toEqual([SMILE_KEY]);
  });
});

describe("reviews on a backfilled place", () => {
  /** Smile Dental taken over by a client, with one number's review at both of its addresses. */
  async function twoReviewsFromOneNumber(older: string, newer: string): Promise<{ older: string; newer: string }> {
    await newClientListing({
      slug: "smile-dental-clinic",
      replacesSourcePath: `/in/dentists/mh/thane/naupada/smile-dental`,
      previousPaths: [`/in/dentists/mh/thane/naupada/smile-dental-old`],
    });
    const ids = { older: await newReview(older, PHONE_1, EARLIER), newer: await newReview(newer, PHONE_1, NOW) };
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    return ids;
  }

  it("restoring a hidden review hides the same number's other published review of the business", async () => {
    const { older, newer } = await twoReviewsFromOneNumber(SMILE_KEY, CLIENT_KEY);

    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: older, now: LATER })).toBe(true);

    const reviews = await reviewsById();
    expect(reviews.get(older)).toEqual({ placeId: SMILE.id, status: "published", hiddenAt: null });
    expect(reviews.get(newer)).toEqual({ placeId: SMILE.id, status: "hidden", hiddenAt: LATER });
  });

  it("a re-review at an address whose review was hidden replaces the number's review of the business", async () => {
    const { older, newer } = await twoReviewsFromOneNumber(CLIENT_KEY, SMILE_KEY);
    const otp = await newReviewOtp(CLIENT_KEY, PHONE_1, 3);

    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: otp, maxAttempts: 5, now: LATER })).toEqual({
      reviewId: older,
      replaced: true,
    });

    const [republished] = await dbs.staff.db.select().from(directoryReviews).where(eq(directoryReviews.id, older));
    expect(republished).toMatchObject({ status: "published", rating: 3, placeId: SMILE.id });
    expect((await reviewsById()).get(newer)).toEqual({ placeId: SMILE.id, status: "hidden", hiddenAt: LATER });
  });

  it("a first review at another address of the business replaces the number's published review of it", async () => {
    const { older, newer } = await twoReviewsFromOneNumber(SMILE_KEY, CLIENT_KEY);
    const otp = await newReviewOtp(OLD_CLIENT_KEY, PHONE_1, 4);

    const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: otp, maxAttempts: 5, now: LATER });

    // Since Task 7 a review is written by place: the number's review of the business is replaced where it is.
    expect(published).toEqual({ reviewId: newer, replaced: true });
    const reviews = await reviewsById();
    expect(reviews.get(newer)).toEqual({ placeId: SMILE.id, status: "published", hiddenAt: null });
    expect(reviews.get(older)?.status).toBe("hidden");
    expect(reviews.size).toBe(2);
    // The next backfill finds nothing left to fill or merge.
    const result = await backfillDirectoryPlaces(dbs.staff.db, LATER);
    expect(result).toMatchObject({ reviewsHidden: 0 });
    expect(result.perTable.directory_reviews.backfilled).toBe(0);
  });

  it("leaves another number's review, and the same number's review of another business, alone", async () => {
    await twoReviewsFromOneNumber(SMILE_KEY, CLIENT_KEY);
    const otherNumber = await newReview(OLD_CLIENT_KEY, PHONE_2, NOW);
    const otherBusiness = await newReview(GYM_KEY, PHONE_1, NOW);
    await backfillDirectoryPlaces(dbs.staff.db, NOW);

    await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: await newReviewOtp(SMILE_KEY, PHONE_1, 2), maxAttempts: 5, now: LATER });

    const reviews = await reviewsById();
    expect(reviews.get(otherNumber)?.status).toBe("published");
    expect(reviews.get(otherBusiness)?.status).toBe("published");
  });
});
