import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { biddingClosesAt, weekStartsAt } from "./directory-ad-rules";
import { findChargeForBusiness, recordChargePayment } from "./queries/charges";
import {
  claimDirectoryReviewOtpAttempt,
  createDirectoryReviewOtp,
  hideDirectoryReview,
  incrementDirectoryDailyCount,
  insertDirectoryEnquiry,
  listListingEnquiries,
  listPublishedDirectoryReviews,
  publishDirectoryReviewFromOtp,
  readDirectoryRatings,
  readDirectorySignals,
  readDirectoryStatuses,
  restoreDirectoryReview,
  setDirectoryTrusted,
  upsertDirectoryVerification,
  type DirectoryReviewOtpPayload,
} from "./queries/directory";
import {
  createListingAccountBusiness,
  decideDirectoryClaim,
  findClaimablePlace,
  findClaimForBusiness,
  findListingOwner,
  listWinsForBusiness,
  PlaceNotClaimableError,
  placeStaffAds,
  readClaimedWebsites,
  readLiveDirectoryAds,
  saveDirectoryAdBid,
  setClaimWebsite,
  setDirectoryAdPrice,
  settleDirectoryAds,
  sumListingInterest,
  type AdChargePricing,
} from "./queries/directory-ads";
import { readListingLeads } from "./queries/directory-leads";
import { saveListingPlacement } from "./queries/directory-listings";
import { backfillDirectoryPlaces } from "./queries/directory-place-backfill";
import { createPlatformPlace, importOpenDataPlaces } from "./queries/directory-places";
import { readLiveDirectoryPictures } from "./queries/directory-pictures";
import {
  answerByAsked,
  resolveDirectoryAsk,
  resolveDirectoryNamed,
  type DirectoryAsk,
  type DirectoryRef,
} from "./queries/directory-refs";
import {
  businesses,
  businessMembers,
  directoryAdBids,
  directoryAdWins,
  directoryClaims,
  directoryDailyCounts,
  directoryEnquiries,
  directoryListings,
  DIRECTORY_PICTURE_SLOTS,
  directoryPictures,
  directoryPlaceLegacyKeys,
  directoryPlaces,
  directoryReviewOtps,
  directoryReviews,
  directoryStaffAds,
  directoryVerifications,
  users,
} from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

/*
 * Task 7 of docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md: the directory reads and writes by
 * place id. A key the registry knows is read and written as its place; a key it does not know is still read and
 * written by the key alone, as before ids, until the website has switched (Task 12) and keys go (Task 13).
 */

/** The slots added for the Business profile's banner and gallery: empty in every answer that does not name them. */
const NO_OTHER_SLOTS = Object.fromEntries(DIRECTORY_PICTURE_SLOTS.filter((slot) => slot === "banner" || slot.startsWith("gallery_")).map((slot) => [slot, null]));

const STAFF = "staff-1";
const OWNER = "owner-a";
const NOW = new Date("2026-09-30T06:00:00.000Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const SMILE = "k7m2q9a";
const GLOW = "b3cdefg";
const UNKNOWN_ID = "zzzzzz2";
const SMILE_KEY = "dentists/thane/naupada/smile-dental";
/** A second address of the same business: a client's earlier address, registered as a legacy key of its place. */
const SMILE_OLD_KEY = "dentists/thane/naupada/smile-dental-clinic";
const GLOW_KEY = "salons/thane/vasant-vihar/glow-studio";
/** An address no place has. */
const GYM_KEY = "gyms/thane/majiwada/iron-house";

const BY_SMILE_KEY: DirectoryRef = { placeId: SMILE, listingKey: SMILE_KEY };
const BY_SMILE_OLD_KEY: DirectoryRef = { placeId: SMILE, listingKey: SMILE_OLD_KEY };
const BY_SMILE_ID: DirectoryRef = { placeId: SMILE, listingKey: null };
const BY_GYM_KEY: DirectoryRef = { placeId: null, listingKey: GYM_KEY };

const PRIYA = "+919876543210";
const RAVI = "+919811111111";

/** 18% GST, rounded half up, as chargedAmountCents does. */
const PRICING: AdChargePricing = {
  taxRateBasisPoints: 1800,
  chargedPaise: (net) => Math.floor((net * 11_800 + 5_000) / 10_000),
  describe: (win) => `Ad, ${win.placement} spot ${win.spot}, week of ${win.weekStart}`,
};
const WEEK = "2026-10-05";
const AFTER_CLOSE = new Date(biddingClosesAt(WEEK).getTime() + 60_000);
const IN_THE_WEEK = new Date(weekStartsAt(WEEK).getTime() + 2 * 60 * 60 * 1000);

let dbs: TestDatabases;
let otpSeq = 0;

function payload(overrides: Partial<DirectoryReviewOtpPayload> = {}): DirectoryReviewOtpPayload {
  return { businessName: "Smile Dental", reviewerName: "Priya Sharma", rating: 5, text: null, highlights: [], ...overrides };
}

function nextOtpId(): string {
  otpSeq += 1;
  return `00000000-0000-4000-8000-${otpSeq.toString().padStart(12, "0")}`;
}

/** Asks for a code and publishes, the way the confirm route does once the code matched. */
async function review(business: DirectoryRef, phone: string, overrides: Partial<DirectoryReviewOtpPayload> = {}) {
  const otpId = await createDirectoryReviewOtp(dbs.staff.db, {
    id: nextOtpId(),
    business,
    phone,
    codeHash: "hash",
    payload: payload(overrides),
    expiresAt: new Date(NOW.getTime() + TEN_MINUTES_MS),
  });
  expect(await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).not.toBeNull();
  const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
  if (published === null) throw new Error("The review was not published");
  return published;
}

async function reviewRows() {
  return dbs.staff.db
    .select({
      listingKey: directoryReviews.listingKey,
      placeId: directoryReviews.placeId,
      phone: directoryReviews.phone,
      rating: directoryReviews.rating,
      status: directoryReviews.status,
    })
    .from(directoryReviews)
    .orderBy(directoryReviews.createdAt, directoryReviews.id);
}

async function signUp(listingKey: string): Promise<{ readonly businessId: string; readonly claimId: string }> {
  return createListingAccountBusiness(dbs.staff.db, { userId: OWNER, listingKey, businessName: "Smile Dental", phone: "+919820000000" });
}

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
  await importOpenDataPlaces(
    dbs.staff.db,
    [
      { sourceRef: "osm:node/1", id: SMILE, citySlug: "thane", urlSlug: "smile-dental", legacyKey: SMILE_KEY },
      { sourceRef: "osm:node/2", id: GLOW, citySlug: "thane", urlSlug: "glow-studio", legacyKey: GLOW_KEY },
    ],
    NOW,
  );
  await dbs.staff.db.insert(directoryPlaceLegacyKeys).values({ listingKey: SMILE_OLD_KEY, placeId: SMILE });
});

describe("resolving what a request asks about", () => {
  it("reads asked ids as themselves, known keys as their place and unknown keys as themselves", async () => {
    const resolved = await resolveDirectoryAsk(dbs.staff.db, { ids: [GLOW, UNKNOWN_ID], keys: [SMILE_KEY, SMILE_OLD_KEY, GYM_KEY] });
    expect(resolved.lookup).toEqual({ placeIds: [GLOW, UNKNOWN_ID, SMILE], unplacedKeys: [GYM_KEY] });
    expect(resolved.readAs).toEqual(
      new Map([
        [GLOW, GLOW],
        [UNKNOWN_ID, UNKNOWN_ID],
        [SMILE_KEY, SMILE],
        [SMILE_OLD_KEY, SMILE],
        [GYM_KEY, GYM_KEY],
      ]),
    );
  });

  it("names a write's business: an id only when the place exists, a key as its place or on its own", async () => {
    expect(await resolveDirectoryNamed(dbs.staff.db, { by: "id", id: SMILE })).toEqual(BY_SMILE_ID);
    expect(await resolveDirectoryNamed(dbs.staff.db, { by: "id", id: UNKNOWN_ID })).toBeNull();
    expect(await resolveDirectoryNamed(dbs.staff.db, { by: "key", key: SMILE_OLD_KEY })).toEqual(BY_SMILE_OLD_KEY);
    expect(await resolveDirectoryNamed(dbs.staff.db, { by: "key", key: GYM_KEY })).toEqual(BY_GYM_KEY);
  });
});

describe("reviews by place", () => {
  it("stores the place with the key it was asked by, or alone when asked by id", async () => {
    await review(BY_SMILE_KEY, PRIYA, { rating: 5 });
    await review(BY_SMILE_ID, RAVI, { rating: 4 });
    await review(BY_GYM_KEY, PRIYA, { rating: 3 });
    expect(await reviewRows()).toEqual([
      { listingKey: SMILE_KEY, placeId: SMILE, phone: PRIYA, rating: 5, status: "published" },
      { listingKey: null, placeId: SMILE, phone: RAVI, rating: 4, status: "published" },
      { listingKey: GYM_KEY, placeId: null, phone: PRIYA, rating: 3, status: "published" },
    ]);
  });

  it("rates a place across every address it was reviewed at, and an unknown key on its own", async () => {
    await review(BY_SMILE_KEY, PRIYA, { rating: 5, highlights: ["quality"] });
    await review(BY_SMILE_OLD_KEY, RAVI, { rating: 4, highlights: ["quality"] });
    await review(BY_GYM_KEY, PRIYA, { rating: 3 });

    const ratings = await readDirectoryRatings(dbs.staff.db, { placeIds: [SMILE, GLOW], unplacedKeys: [GYM_KEY] });
    expect(ratings).toEqual(
      new Map([
        [SMILE, { average: 4.5, count: 2, topHighlight: { id: "quality", count: 2 } }],
        [GYM_KEY, { average: 3, count: 1, topHighlight: null }],
      ]),
    );

    const resolved = await resolveDirectoryAsk(dbs.staff.db, { ids: [], keys: [SMILE_KEY, SMILE_OLD_KEY] });
    const byAsked = answerByAsked(resolved, await readDirectoryRatings(dbs.staff.db, resolved.lookup));
    expect(byAsked.get(SMILE_KEY)?.count).toBe(2);
    expect(byAsked.get(SMILE_OLD_KEY)?.count).toBe(2);

    const page = await listPublishedDirectoryReviews(dbs.staff.db, { business: BY_SMILE_ID, page: 1, pageSize: 10 });
    expect(page.total).toBe(2);
    expect(page.reviews.map((entry) => entry.rating).sort()).toEqual([4, 5]);
    const gym = await listPublishedDirectoryReviews(dbs.staff.db, { business: BY_GYM_KEY, page: 1, pageSize: 10 });
    expect(gym.total).toBe(1);
  });

  it("replaces a number's review of the place wherever it was left, by key or by id", async () => {
    const first = await review(BY_SMILE_KEY, PRIYA, { rating: 2 });
    const again = await review(BY_SMILE_OLD_KEY, PRIYA, { rating: 4 });
    expect(again).toEqual({ reviewId: first.reviewId, replaced: true });
    const byId = await review(BY_SMILE_ID, PRIYA, { rating: 5 });
    expect(byId).toEqual({ reviewId: first.reviewId, replaced: true });

    expect(await reviewRows()).toEqual([{ listingKey: SMILE_KEY, placeId: SMILE, phone: PRIYA, rating: 5, status: "published" }]);
    expect((await readDirectoryRatings(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [] })).get(SMILE)?.count).toBe(1);
  });

  it("replaces the number's review written by key before the backfill, gives it the place, and re-publishes a hidden one", async () => {
    // Written by key before the place was known: no place_id yet.
    const [early] = await dbs.staff.db
      .insert(directoryReviews)
      .values({ listingKey: SMILE_OLD_KEY, businessName: "Smile Dental", reviewerName: "Priya Sharma", phone: PRIYA, rating: 1, createdAt: NOW, updatedAt: NOW })
      .returning({ id: directoryReviews.id });
    const placed = await review(BY_SMILE_ID, PRIYA, { rating: 3 });
    expect(placed).toEqual({ reviewId: early?.id, replaced: true });
    expect(await reviewRows()).toEqual([{ listingKey: SMILE_OLD_KEY, placeId: SMILE, phone: PRIYA, rating: 3, status: "published" }]);

    expect(await hideDirectoryReview(dbs.staff.db, { reviewId: placed.reviewId, staffUserId: STAFF, now: NOW })).toBe(true);
    const again = await review(BY_SMILE_KEY, PRIYA, { rating: 4 });
    expect(again).toEqual({ reviewId: placed.reviewId, replaced: true });
    expect(await reviewRows()).toEqual([{ listingKey: SMILE_OLD_KEY, placeId: SMILE, phone: PRIYA, rating: 4, status: "published" }]);
  });

  it("refuses a review that names no business, and a code for a place that does not exist", async () => {
    const neither = dbs.staff.db.insert(directoryReviews).values({
      listingKey: null,
      businessName: "Nobody",
      reviewerName: "Priya Sharma",
      phone: PRIYA,
      rating: 5,
    });
    expect(await captureErrorText(neither)).toContain("directory_reviews_business_check");
    const unknown = createDirectoryReviewOtp(dbs.staff.db, {
      id: nextOtpId(),
      business: { placeId: UNKNOWN_ID, listingKey: null },
      phone: PRIYA,
      codeHash: "hash",
      payload: payload(),
      expiresAt: NOW,
    });
    expect(await captureErrorText(unknown)).toContain("directory_review_otps_place_id_directory_places_id_fk");
    const noCodeBusiness = dbs.staff.db
      .insert(directoryReviewOtps)
      .values({ listingKey: null, phone: PRIYA, codeHash: "hash", payload: payload(), expiresAt: NOW });
    expect(await captureErrorText(noCodeBusiness)).toContain("directory_review_otps_business_check");
  });
});

describe("restoring a review of a place", () => {
  it("hides the number's published review of the place at its other address", async () => {
    const first = await review(BY_SMILE_KEY, PRIYA, { rating: 2 });
    await hideDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, staffUserId: STAFF, now: NOW });
    // Staff hid it; the same number then reviewed by id, which made a new published row.
    const second = await review(BY_SMILE_ID, PRIYA, { rating: 5 });
    expect(second.reviewId).toBe(first.reviewId);
    await hideDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, staffUserId: STAFF, now: NOW });
    await dbs.staff.db.insert(directoryReviews).values({
      listingKey: SMILE_OLD_KEY,
      placeId: SMILE,
      businessName: "Smile Dental",
      reviewerName: "Priya Sharma",
      phone: PRIYA,
      rating: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, now: NOW })).toBe(true);
    expect((await reviewRows()).map((row) => [row.listingKey, row.rating, row.status])).toEqual([
      [SMILE_KEY, 5, "published"],
      [SMILE_OLD_KEY, 3, "hidden"],
    ]);
  });
});

describe("restoring a review while the same number publishes", () => {
  /** The lock publishReviewOfPlace and restoreDirectoryReview take for one number's reviews of one place. */
  const reviewLock = (placeId: string, phone: string) => sql`select pg_advisory_xact_lock(hashtextextended(${`directory-review:${placeId}:${phone}`}, 0))`;

  /** Resolves once a backend of this database is waiting for an advisory lock. */
  async function someoneWaitsForAdvisoryLock(): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiting = await dbs.staff.db.execute<{ waiting: boolean }>(
        sql`select exists (select 1 from pg_locks where locktype = 'advisory' and not granted) as waiting`,
      );
      if (waiting.rows[0]?.waiting === true) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Nothing waited for the review lock");
  }

  it("takes the review lock before the hidden row, so a publish holding the lock is never blocked by it", async () => {
    const first = await review(BY_SMILE_KEY, PRIYA, { rating: 2 });
    await hideDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, staffUserId: STAFF, now: NOW });

    // Stands in for a publish that holds the lock and is about to read (FOR UPDATE) the number's reviews of the place.
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const publisher = dbs.staff.db.transaction(async (tx) => {
      await tx.execute(reviewLock(SMILE, PRIYA));
      held();
      await released;
    });
    await holding;

    const restoring = restoreDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, now: NOW });
    try {
      await someoneWaitsForAdvisoryLock();
      // The restore waits for the lock without holding the hidden row, so the publish could lock that row now.
      const locked = await dbs.staff.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '200ms'`);
        return tx
          .select({ id: directoryReviews.id })
          .from(directoryReviews)
          .where(eq(directoryReviews.id, first.reviewId))
          .for("update");
      });
      expect(locked).toEqual([{ id: first.reviewId }]);
    } finally {
      release();
      await publisher;
    }
    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, now: NOW })).toBe(false);
    expect(await restoring).toBe(true);
    expect((await reviewRows()).map((row) => row.status)).toEqual(["published"]);
  });

  it("does not restore a review a concurrent publish has already re-published", async () => {
    const first = await review(BY_SMILE_KEY, PRIYA, { rating: 2 });
    await hideDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, staffUserId: STAFF, now: NOW });
    const results = await Promise.allSettled([
      restoreDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, now: NOW }),
      review(BY_SMILE_ID, PRIYA, { rating: 5 }),
      restoreDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, now: NOW }),
      review(BY_SMILE_KEY, PRIYA, { rating: 4 }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
    const rows = await reviewRows();
    expect(rows.filter((row) => row.status === "published")).toHaveLength(1);
  });
});

describe("enquiries by place", () => {
  const enquiry = {
    kind: "business" as const,
    businessName: "Smile Dental",
    serviceLabel: "Dentists",
    areaLabel: "Naupada",
    name: "Ravi Kumar",
    phone: RAVI,
    message: null,
  };

  it("stores the place, and lists a business's enquiries whichever address or id they came by", async () => {
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_SMILE_KEY });
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_SMILE_ID, name: "By Id" });
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_GYM_KEY, name: "Gym Visitor" });
    await insertDirectoryEnquiry(dbs.staff.db, {
      kind: "top_list",
      business: null,
      businessName: null,
      serviceLabel: "Dentists",
      areaLabel: "Thane",
      name: "List Visitor",
      phone: RAVI,
      message: null,
    });

    const stored = await dbs.staff.db
      .select({ listingKey: directoryEnquiries.listingKey, placeId: directoryEnquiries.placeId, name: directoryEnquiries.name })
      .from(directoryEnquiries)
      .orderBy(directoryEnquiries.createdAt, directoryEnquiries.id);
    expect(stored).toEqual([
      { listingKey: SMILE_KEY, placeId: SMILE, name: "Ravi Kumar" },
      { listingKey: null, placeId: SMILE, name: "By Id" },
      { listingKey: GYM_KEY, placeId: null, name: "Gym Visitor" },
      { listingKey: null, placeId: null, name: "List Visitor" },
    ]);
    expect((await listListingEnquiries(dbs.staff.db, BY_SMILE_OLD_KEY, 10)).map((row) => row.name).sort()).toEqual(["By Id", "Ravi Kumar"]);
    expect((await listListingEnquiries(dbs.staff.db, BY_GYM_KEY, 10)).map((row) => row.name)).toEqual(["Gym Visitor"]);
  });

  it("gives the owner's Leads page every lead the business got, whichever address or id it came by", async () => {
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_SMILE_KEY });
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_SMILE_ID, name: "By Id" });
    await insertDirectoryEnquiry(dbs.staff.db, { ...enquiry, business: BY_GYM_KEY, name: "Gym Visitor" });
    const since = new Date(0);
    const leads = await readListingLeads(dbs.staff.db, BY_SMILE_OLD_KEY, { limit: 25, offset: 0, since });
    expect(leads.leads.map((lead) => lead.name).sort()).toEqual(["By Id", "Ravi Kumar"]);
    expect([leads.total, leads.sinceCount]).toEqual([2, 2]);
    expect((await readListingLeads(dbs.staff.db, BY_GYM_KEY, { limit: 25, offset: 0, since })).total).toBe(1);
  });

  it("refuses a business enquiry that names no business, and a top-list one that names a place", async () => {
    const values = { kind: "business" as const, businessName: "Smile Dental", serviceLabel: "Dentists", areaLabel: "Naupada", name: "Ravi", phone: RAVI };
    expect(await captureErrorText(dbs.staff.db.insert(directoryEnquiries).values(values))).toContain("directory_enquiries_kind_check");
    const topList = dbs.staff.db
      .insert(directoryEnquiries)
      .values({ ...values, kind: "top_list", businessName: null, placeId: SMILE });
    expect(await captureErrorText(topList)).toContain("directory_enquiries_kind_check");
  });
});

describe("events and Trending by place", () => {
  const TODAY = "2026-09-30";

  it("counts a place once per day and kind, whichever address or id the visit came by", async () => {
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_KEY, kind: "view", day: TODAY })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_OLD_KEY, kind: "view", day: TODAY })).toBe(2);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_ID, kind: "view", day: TODAY })).toBe(3);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_GYM_KEY, kind: "view", day: TODAY })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_GYM_KEY, kind: "view", day: TODAY })).toBe(2);

    const rows = await dbs.staff.db
      .select({ listingKey: directoryDailyCounts.listingKey, placeId: directoryDailyCounts.placeId, count: directoryDailyCounts.count })
      .from(directoryDailyCounts)
      .orderBy(directoryDailyCounts.count);
    // A place's counter carries no key: concurrent first visits by different keys meet on the place alone.
    expect(rows).toEqual([
      { listingKey: GYM_KEY, placeId: null, count: 2 },
      { listingKey: null, placeId: SMILE, count: 3 },
    ]);

    for (let visitor = 0; visitor < 7; visitor += 1) {
      await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_ID, kind: "call", day: TODAY });
    }
    const signals = await readDirectorySignals(dbs.staff.db, { placeIds: [SMILE, GLOW], unplacedKeys: [GYM_KEY] }, TODAY);
    expect(signals).toEqual(
      new Map([
        [SMILE, { score: 24, previousScore: 0, trending: true }],
        [GYM_KEY, { score: 2, previousScore: 0, trending: false }],
      ]),
    );
    expect(await sumListingInterest(dbs.staff.db, BY_SMILE_OLD_KEY, TODAY)).toMatchObject({ view: 3, call: 7 });
    expect(await sumListingInterest(dbs.staff.db, BY_GYM_KEY, TODAY)).toMatchObject({ view: 2, call: 0 });
  });

  it("counts every one of many concurrent first visits of the day, whichever address or id they came by", async () => {
    for (let round = 0; round < 10; round += 1) {
      await dbs.staff.db.delete(directoryDailyCounts);
      const visits = [BY_SMILE_KEY, BY_SMILE_OLD_KEY, BY_SMILE_ID, BY_SMILE_KEY, BY_SMILE_ID, BY_SMILE_OLD_KEY];
      await Promise.all(visits.map((business) => incrementDirectoryDailyCount(dbs.staff.db, { business, kind: "call", day: TODAY })));
      const rows = await dbs.staff.db.select({ placeId: directoryDailyCounts.placeId, count: directoryDailyCounts.count }).from(directoryDailyCounts);
      expect(rows).toEqual([{ placeId: SMILE, count: visits.length }]);
    }
  });

  it("refuses a counter that names no business", async () => {
    const neither = dbs.staff.db.insert(directoryDailyCounts).values({ day: TODAY, kind: "view", count: 1 });
    expect(await captureErrorText(neither)).toContain("directory_daily_counts_business_check");
  });
});

describe("Verified by place", () => {
  it("keeps one verification per place, whichever address staff verified it at", async () => {
    expect(
      await upsertDirectoryVerification(dbs.staff.db, { listingKey: SMILE_KEY, businessName: "Smile Dental", phone: null, staffUserId: STAFF, now: NOW }),
    ).toEqual({ replaced: false });
    const later = new Date(NOW.getTime() + 60_000);
    expect(
      await upsertDirectoryVerification(dbs.staff.db, {
        listingKey: SMILE_OLD_KEY,
        businessName: "Smile Dental Clinic",
        phone: "+919820011223",
        staffUserId: STAFF,
        now: later,
      }),
    ).toEqual({ replaced: true });
    await upsertDirectoryVerification(dbs.staff.db, { listingKey: GYM_KEY, businessName: "Iron House", phone: null, staffUserId: STAFF, now: NOW });

    const rows = await dbs.staff.db
      .select({ listingKey: directoryVerifications.listingKey, placeId: directoryVerifications.placeId, phone: directoryVerifications.phone })
      .from(directoryVerifications)
      .orderBy(directoryVerifications.listingKey);
    expect(rows).toEqual([
      { listingKey: SMILE_KEY, placeId: SMILE, phone: "+919820011223" },
      { listingKey: GYM_KEY, placeId: null, phone: null },
    ]);
    expect(await readDirectoryStatuses(dbs.staff.db, { placeIds: [SMILE, GLOW], unplacedKeys: [GYM_KEY] })).toEqual(
      new Map([
        [SMILE, { verifiedAt: later, phone: "+919820011223", trusted: false }],
        [GYM_KEY, { verifiedAt: NOW, phone: null, trusted: false }],
      ]),
    );
  });
});

describe("Trusted by place", () => {
  it("gives and takes away trust on a place's one verification, whichever of its addresses is named", async () => {
    await upsertDirectoryVerification(dbs.staff.db, { listingKey: SMILE_KEY, businessName: "Smile Dental", phone: null, staffUserId: STAFF, now: NOW });
    expect(await setDirectoryTrusted(dbs.staff.db, SMILE_OLD_KEY, true, NOW)).toBe(true);
    expect((await readDirectoryStatuses(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [] })).get(SMILE)?.trusted).toBe(true);
    expect(await setDirectoryTrusted(dbs.staff.db, SMILE_KEY, true, NOW)).toBe(false);
    expect(await setDirectoryTrusted(dbs.staff.db, SMILE_KEY, false, NOW)).toBe(true);
    expect((await readDirectoryStatuses(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [] })).get(SMILE)?.trusted).toBe(false);
    expect(await dbs.staff.db.select({ listingKey: directoryVerifications.listingKey }).from(directoryVerifications)).toEqual([
      { listingKey: SMILE_KEY },
    ]);
  });
});

describe("claims and owners by place", () => {
  it("claims the place the link's key names, verifies the place on approval, and shows its website and pictures", async () => {
    const { businessId, claimId } = await signUp(SMILE_OLD_KEY);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ listingKey: SMILE_OLD_KEY, placeId: SMILE });
    expect(await findListingOwner(dbs.staff.db, BY_SMILE_ID)).toBeNull();

    await setClaimWebsite(dbs.staff.db, businessId, "https://smiledental.example/");
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOW })).toBe("decided");
    const verified = await dbs.staff.db.select({ placeId: directoryVerifications.placeId }).from(directoryVerifications);
    expect(verified).toEqual([{ placeId: SMILE }]);

    expect(await readClaimedWebsites(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [SMILE_OLD_KEY] })).toEqual(
      new Map([[SMILE, "https://smiledental.example/"]]),
    );
    expect(await findListingOwner(dbs.staff.db, BY_SMILE_KEY)).toMatchObject({ businessId, account: "listing", emailConfirmed: true });
    expect(await findListingOwner(dbs.staff.db, { placeId: null, listingKey: SMILE_OLD_KEY })).toBeNull();

    const pictureId = "00000000-0000-4000-8000-00000000aaaa";
    await dbs.staff.db.insert(directoryPictures).values({
      id: pictureId,
      businessId,
      slot: "listing",
      storageKey: `t/${businessId}/${pictureId}/display`,
      mimeType: "image/webp",
      bytes: 100,
      width: 640,
      height: 640,
      sha256: "a".repeat(64),
      status: "approved",
      decidedAt: NOW,
      decidedByUserId: STAFF,
      uploadedByUserId: OWNER,
    });
    expect(await readLiveDirectoryPictures(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [] })).toEqual(
      new Map([[SMILE, { listing: pictureId, ad_tall: null, ad_wide: null, ...NO_OTHER_SLOTS }]]),
    );
  });

  it("still claims an address no place has by its key alone", async () => {
    const { businessId, claimId } = await signUp(GYM_KEY);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ listingKey: GYM_KEY, placeId: null });
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOW });
    expect(await findListingOwner(dbs.staff.db, BY_GYM_KEY)).toMatchObject({ businessId, account: "listing" });
  });

  it("finds a client whose listing has the place, and not one that only shares an address", async () => {
    await dbs.staff.db.insert(users).values({ id: "client-owner", name: "Client Owner", email: "client@example.com", emailVerified: true });
    const [client] = await dbs.staff.db.insert(businesses).values({ name: "Smile Dental", slug: "smile-dental-client", currency: "INR" }).returning({ id: businesses.id });
    if (client === undefined) throw new Error("No business");
    await dbs.staff.db.insert(businessMembers).values({ businessId: client.id, userId: "client-owner", role: "owner" });
    const saved = await saveListingPlacement(
      dbs.staff.db,
      client.id,
      {
        categorySlug: "dentists",
        stateCode: "mh",
        citySlug: "thane",
        areaSlug: "naupada",
        slug: "smile-dental",
        lat: 19.19,
        lon: 72.97,
        pinLabel: "Gokhale Road",
        whatsappPhone: null,
        bookingUrl: null,
        replacesSourcePath: null,
        takeOverPlaceId: null,
      },
      NOW,
    );
    // A new listing at the open-data business's own address takes that business over (Task 8).
    expect(saved.placeId).toBe(SMILE);
    expect(await findListingOwner(dbs.staff.db, BY_SMILE_ID)).toMatchObject({ businessId: client.id, account: "client", emailConfirmed: true });
    // A listing from before places, which the backfill has not reached, only shares the address: it owns nothing.
    await dbs.staff.db.update(directoryListings).set({ placeId: null }).where(eq(directoryListings.businessId, client.id));
    expect(await findListingOwner(dbs.staff.db, BY_SMILE_KEY)).toBeNull();
  });
});

describe("claims by place id", () => {
  const OTHER_OWNER = "owner-b";
  const SMILE_MUMBAI_KEY = "dentists/mumbai/andheri/smile-dental";

  function signUpById(placeId: string, userId = OWNER) {
    return createListingAccountBusiness(dbs.staff.db, { userId, placeId, businessName: "Smile Dental", phone: "+919820000000" });
  }

  async function refusal(work: Promise<unknown>): Promise<string> {
    const error = await work.then(
      () => null,
      (caught: unknown) => caught,
    );
    if (!(error instanceof PlaceNotClaimableError)) throw new Error("The claim was not refused with PlaceNotClaimableError");
    return error.reason;
  }

  beforeEach(async () => {
    await dbs.staff.db.insert(users).values({ id: OTHER_OWNER, name: "Owner B", email: "owner-b@example.com", emailVerified: true });
  });

  it("claims an open-data place by its id, storing the place and the address in the place's own city", async () => {
    // Another city's address of the same place is never picked: the market is read from the key.
    await dbs.staff.db.insert(directoryPlaceLegacyKeys).values({ listingKey: SMILE_MUMBAI_KEY, placeId: SMILE });
    const { businessId } = await signUpById(SMILE);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ placeId: SMILE, listingKey: SMILE_KEY, origin: "claimed", status: "pending" });
    expect(await findClaimablePlace(dbs.staff.db, SMILE)).toEqual({ kind: "claimable", placeId: SMILE, listingKey: SMILE_KEY });
  });

  it("lets two owners ask for a place while no claim is approved, and refuses it once one is", async () => {
    const first = await signUpById(SMILE);
    await signUpById(SMILE, OTHER_OWNER);
    expect(await decideDirectoryClaim(dbs.staff.db, { claimId: first.claimId, approve: true, staffId: STAFF, now: NOW })).toBe("decided");
    expect(await findClaimablePlace(dbs.staff.db, SMILE)).toEqual({ kind: "refused", reason: "already-claimed" });
    expect(await findClaimablePlace(dbs.staff.db, GLOW)).toMatchObject({ kind: "claimable" });
  });

  it("sees an approved claim made by one of the place's keys before the backfill gave it a place", async () => {
    const byKey = await signUp(SMILE_OLD_KEY);
    await dbs.staff.db.update(directoryClaims).set({ placeId: null }).where(eq(directoryClaims.id, byKey.claimId));
    await decideDirectoryClaim(dbs.staff.db, { claimId: byKey.claimId, approve: true, staffId: STAFF, now: NOW });
    expect(await findClaimablePlace(dbs.staff.db, SMILE)).toEqual({ kind: "refused", reason: "already-claimed" });
  });

  it("refuses an id no place has, and writes nothing", async () => {
    expect(await refusal(signUpById(UNKNOWN_ID))).toBe("unknown-place");
    expect(await findClaimablePlace(dbs.staff.db, UNKNOWN_ID)).toEqual({ kind: "refused", reason: "unknown-place" });
    expect(await dbs.staff.db.select({ id: businesses.id }).from(businesses)).toEqual([]);
  });

  it("refuses an approved claim's place, and writes no business for the second owner", async () => {
    const first = await signUpById(SMILE);
    await decideDirectoryClaim(dbs.staff.db, { claimId: first.claimId, approve: true, staffId: STAFF, now: NOW });
    expect(await refusal(signUpById(SMILE, OTHER_OWNER))).toBe("already-claimed");
    expect(await dbs.staff.db.select({ id: businesses.id }).from(businesses)).toHaveLength(1);
  });

  it("refuses a place a client's listing has, and one a client listing from before places sits at", async () => {
    await dbs.staff.db.insert(users).values({ id: "client-owner", name: "Client Owner", email: "client@example.com", emailVerified: true });
    const [client] = await dbs.staff.db.insert(businesses).values({ name: "Smile Dental", slug: "smile-dental-client", currency: "INR" }).returning({ id: businesses.id });
    if (client === undefined) throw new Error("No business");
    await dbs.staff.db.insert(businessMembers).values({ businessId: client.id, userId: "client-owner", role: "owner" });
    await saveListingPlacement(
      dbs.staff.db,
      client.id,
      {
        categorySlug: "dentists",
        stateCode: "mh",
        citySlug: "thane",
        areaSlug: "naupada",
        slug: "smile-dental",
        lat: 19.19,
        lon: 72.97,
        pinLabel: "Gokhale Road",
        whatsappPhone: null,
        bookingUrl: null,
        replacesSourcePath: null,
        takeOverPlaceId: null,
      },
      NOW,
    );
    expect(await refusal(signUpById(SMILE))).toBe("has-client-listing");

    // The backfill has not reached the listing, and the place is still open data: the address alone says it is taken.
    await dbs.staff.db.update(directoryListings).set({ placeId: null }).where(eq(directoryListings.businessId, client.id));
    await dbs.staff.db.update(directoryPlaces).set({ origin: "open_data" }).where(eq(directoryPlaces.id, SMILE));
    expect(await refusal(signUpById(SMILE))).toBe("has-client-listing");
  });

  it("refuses a business an owner added, which is never an open-data business to claim", async () => {
    const added = await createPlatformPlace(dbs.staff.db, { origin: "added", stateCode: "mh", citySlug: "thane", urlSlug: "tooth-fairy" }, NOW);
    expect(await refusal(signUpById(added))).toBe("not-open-data");
  });

  it("refuses a place with no address in its own city, since the market is read from the address", async () => {
    const elsewhere = "c4dfghj";
    await importOpenDataPlaces(
      dbs.staff.db,
      [{ sourceRef: "osm:node/3", id: elsewhere, citySlug: "thane", urlSlug: "glow-studio-annex", legacyKey: "salons/mumbai/andheri/glow-studio-annex" }],
      NOW,
    );
    expect(await refusal(signUpById(elsewhere))).toBe("no-address");
    expect(await findClaimablePlace(dbs.staff.db, elsewhere)).toEqual({ kind: "refused", reason: "no-address" });
  });

  it("takes the first address in plain byte order, whatever the database's collation", async () => {
    // A collation that skips punctuation would put "ab" first; byte order puts "a-z" first.
    const sorted = "d5efghj";
    await importOpenDataPlaces(
      dbs.staff.db,
      [{ sourceRef: "osm:node/4", id: sorted, citySlug: "thane", urlSlug: "ab", legacyKey: "salons/thane/vasant-vihar/ab" }],
      NOW,
    );
    await dbs.staff.db.insert(directoryPlaceLegacyKeys).values({ listingKey: "salons/thane/vasant-vihar/a-z", placeId: sorted });
    expect(await findClaimablePlace(dbs.staff.db, sorted)).toEqual({ kind: "claimable", placeId: sorted, listingKey: "salons/thane/vasant-vihar/a-z" });
  });

  it("still claims by the address, as before ids", async () => {
    const { businessId } = await signUp(SMILE_KEY);
    expect(await findClaimForBusiness(dbs.staff.db, businessId)).toMatchObject({ placeId: SMILE, listingKey: SMILE_KEY });
  });
});

describe("ads by place", () => {
  async function approvedClaim(): Promise<string> {
    const { businessId, claimId } = await signUp(SMILE_KEY);
    await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOW });
    await setDirectoryAdPrice(dbs.staff.db, { categorySlug: "dentists", topWeekPaise: 50_000, sideWeekPaise: 30_000, staffId: STAFF });
    return businessId;
  }

  it("carries the claim's place from bid to win to the live ad", async () => {
    const businessId = await approvedClaim();
    expect(
      await saveDirectoryAdBid(dbs.staff.db, { businessId, placement: "top", weekStart: WEEK, amountPaise: 60_000, now: NOW }),
    ).toEqual({ kind: "saved" });
    const [bid] = await dbs.staff.db.select({ placeId: directoryAdBids.placeId }).from(directoryAdBids);
    expect(bid?.placeId).toBe(SMILE);

    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    const [win] = await listWinsForBusiness(dbs.staff.db, businessId, WEEK);
    const [stored] = await dbs.staff.db.select({ placeId: directoryAdWins.placeId }).from(directoryAdWins);
    expect(stored?.placeId).toBe(SMILE);

    const charge = await findChargeForBusiness(dbs.staff.db, businessId, win?.chargeId ?? "");
    await recordChargePayment(dbs.staff.db, {
      chargeId: win?.chargeId ?? "",
      businessId,
      provider: "fake",
      providerPaymentId: "pay_ad_place",
      amountCents: charge?.amountCents ?? 0,
      currency: "INR",
      paidAt: AFTER_CLOSE,
      now: AFTER_CLOSE,
    });
    const live = await readLiveDirectoryAds(dbs.staff.db, { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" }, IN_THE_WEEK);
    expect(live.top).toEqual({ spot: 1, key: SMILE_KEY, linkUrl: null, picture: null, placeId: SMILE, name: "Smile Dental", tagline: null });

    // The win must name its bid's place, as it must its bid's business.
    const mismatch = dbs.staff.db.update(directoryAdWins).set({ placeId: GLOW }).where(eq(directoryAdWins.businessId, businessId));
    expect(await captureErrorText(mismatch)).toContain("does not match its bid");
  });

  it("takes an ad down once the claim no longer has the bid's place", async () => {
    const businessId = await approvedClaim();
    await saveDirectoryAdBid(dbs.staff.db, { businessId, placement: "top", weekStart: WEEK, amountPaise: 60_000, now: NOW });
    // Staff moved the claim to another business's place before the auction closed: the bid is not its to win.
    await dbs.staff.db.update(directoryClaims).set({ placeId: GLOW }).where(eq(directoryClaims.businessId, businessId));
    await settleDirectoryAds(dbs.staff.db, AFTER_CLOSE, PRICING);
    expect(await listWinsForBusiness(dbs.staff.db, businessId, WEEK)).toEqual([]);
  });

  it("places a staff ad on the place its key names", async () => {
    expect(
      await placeStaffAds(dbs.staff.db, {
        listingKey: SMILE_OLD_KEY,
        businessName: "Smile Dental",
        tagline: null,
        market: { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" },
        placement: "side",
        spot: 1,
        fromWeek: WEEK,
        weeks: 1,
        agreedPaise: null,
        note: null,
        staffId: STAFF,
        now: NOW,
      }),
    ).toEqual({ kind: "placed", weeks: 1 });
    const [ad] = await dbs.staff.db.select({ placeId: directoryStaffAds.placeId }).from(directoryStaffAds);
    expect(ad?.placeId).toBe(SMILE);
    const live = await readLiveDirectoryAds(dbs.staff.db, { categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada" }, IN_THE_WEEK);
    expect(live.side).toEqual([{ spot: 1, key: SMILE_OLD_KEY, linkUrl: null, picture: null, placeId: SMILE, name: "Smile Dental", tagline: null }]);
  });
});

describe("between the import and the backfill", () => {
  const TODAY = "2026-09-30";
  const ASK: DirectoryAsk = { ids: [SMILE], keys: [SMILE_KEY, SMILE_OLD_KEY] };
  let businessId = "";
  let pictureId = "";

  /** What the platform wrote by key before it knew places: none of these rows has a place_id yet. */
  beforeEach(async () => {
    await dbs.staff.db.insert(directoryReviews).values([
      { listingKey: SMILE_KEY, businessName: "Smile Dental", reviewerName: "Priya Sharma", phone: PRIYA, rating: 4, createdAt: NOW, updatedAt: NOW },
      { listingKey: SMILE_OLD_KEY, businessName: "Smile Dental", reviewerName: "Ravi Kumar", phone: RAVI, rating: 2, createdAt: NOW, updatedAt: NOW },
    ]);
    await dbs.staff.db.insert(directoryVerifications).values({
      listingKey: SMILE_OLD_KEY,
      businessName: "Smile Dental",
      phone: "+919820011223",
      verifiedAt: NOW,
      verifiedByUserId: STAFF,
    });
    await dbs.staff.db.insert(directoryDailyCounts).values([
      { listingKey: SMILE_KEY, day: TODAY, kind: "view", count: 7 },
      { listingKey: SMILE_OLD_KEY, day: TODAY, kind: "call", count: 3 },
    ]);
    await dbs.staff.db.insert(directoryEnquiries).values({
      kind: "business",
      listingKey: SMILE_KEY,
      businessName: "Smile Dental",
      serviceLabel: "Dentists",
      areaLabel: "Naupada",
      name: "Early Visitor",
      phone: RAVI,
    });
    const claim = await signUp(SMILE_OLD_KEY);
    businessId = claim.businessId;
    await dbs.staff.db.update(directoryClaims).set({ placeId: null }).where(eq(directoryClaims.id, claim.claimId));
    await setClaimWebsite(dbs.staff.db, businessId, "https://smiledental.example/");
    await decideDirectoryClaim(dbs.staff.db, { claimId: claim.claimId, approve: true, staffId: STAFF, now: NOW });
    pictureId = "00000000-0000-4000-8000-00000000bbbb";
    await dbs.staff.db.insert(directoryPictures).values({
      id: pictureId,
      businessId,
      slot: "listing",
      storageKey: `t/${businessId}/${pictureId}/display`,
      mimeType: "image/webp",
      bytes: 100,
      width: 640,
      height: 640,
      sha256: "a".repeat(64),
      status: "approved",
      decidedAt: NOW,
      decidedByUserId: STAFF,
      uploadedByUserId: OWNER,
    });
  });

  /** Everything the website and the owner's dashboard read about Smile Dental, by its id and both its keys. */
  async function answers() {
    const resolved = await resolveDirectoryAsk(dbs.staff.db, ASK);
    const byAsked = async <T,>(read: Promise<ReadonlyMap<string, T>>) => Object.fromEntries(answerByAsked(resolved, await read));
    return {
      ratings: await byAsked(readDirectoryRatings(dbs.staff.db, resolved.lookup)),
      statuses: await byAsked(readDirectoryStatuses(dbs.staff.db, resolved.lookup)),
      signals: await byAsked(readDirectorySignals(dbs.staff.db, resolved.lookup, TODAY)),
      websites: await byAsked(readClaimedWebsites(dbs.staff.db, resolved.lookup)),
      pictures: await byAsked(readLiveDirectoryPictures(dbs.staff.db, resolved.lookup)),
      reviewsById: (await listPublishedDirectoryReviews(dbs.staff.db, { business: BY_SMILE_ID, page: 1, pageSize: 10 })).total,
      reviewsByKey: (await listPublishedDirectoryReviews(dbs.staff.db, { business: BY_SMILE_KEY, page: 1, pageSize: 10 })).total,
      owner: (await findListingOwner(dbs.staff.db, BY_SMILE_ID))?.businessId ?? null,
      interest: await sumListingInterest(dbs.staff.db, BY_SMILE_OLD_KEY, TODAY),
      enquiries: (await listListingEnquiries(dbs.staff.db, BY_SMILE_ID, 10)).map((row) => row.name),
    };
  }

  it("answers for a place's key-only rows by id and by every key, and the same once the backfill has run", async () => {
    const before = await answers();
    const rating = { average: 3, count: 2, topHighlight: null };
    const status = { verifiedAt: NOW, phone: "+919820011223", trusted: false };
    const signal = { score: 16, previousScore: 0, trending: false };
    const pictures = { listing: pictureId, ad_tall: null, ad_wide: null, ...NO_OTHER_SLOTS };
    expect(before).toEqual({
      ratings: { [SMILE]: rating, [SMILE_KEY]: rating, [SMILE_OLD_KEY]: rating },
      statuses: { [SMILE]: status, [SMILE_KEY]: status, [SMILE_OLD_KEY]: status },
      signals: { [SMILE]: signal, [SMILE_KEY]: signal, [SMILE_OLD_KEY]: signal },
      websites: { [SMILE]: "https://smiledental.example/", [SMILE_KEY]: "https://smiledental.example/", [SMILE_OLD_KEY]: "https://smiledental.example/" },
      pictures: { [SMILE]: pictures, [SMILE_KEY]: pictures, [SMILE_OLD_KEY]: pictures },
      reviewsById: 2,
      reviewsByKey: 2,
      owner: businessId,
      interest: { view: 7, call: 3, whatsapp: 0, enquire: 0, directions: 0, website: 0, share: 0 },
      enquiries: ["Early Visitor"],
    });

    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    expect(await answers()).toEqual(before);
  });

  it("writes onto the place's key-only rows without colliding with them, and the backfill keeps every count", async () => {
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_KEY, kind: "view", day: TODAY })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_ID, kind: "view", day: TODAY })).toBe(2);
    expect(
      await upsertDirectoryVerification(dbs.staff.db, { listingKey: SMILE_KEY, businessName: "Smile Dental", phone: null, staffUserId: STAFF, now: NOW }),
    ).toEqual({ replaced: true });
    expect(await dbs.staff.db.select({ placeId: directoryVerifications.placeId }).from(directoryVerifications)).toEqual([{ placeId: SMILE }]);

    const [early] = await dbs.staff.db.select({ id: directoryReviews.id }).from(directoryReviews).where(eq(directoryReviews.phone, PRIYA));
    const again = await review(BY_SMILE_OLD_KEY, PRIYA, { rating: 5 });
    expect(again).toEqual({ reviewId: early?.id, replaced: true });

    const signals = () => readDirectorySignals(dbs.staff.db, { placeIds: [SMILE], unplacedKeys: [] }, TODAY);
    expect((await signals()).get(SMILE)?.score).toBe(18);
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    expect((await signals()).get(SMILE)?.score).toBe(18);
    // A second run, after a view counted by id and one more written by key, still keeps every count.
    await incrementDirectoryDailyCount(dbs.staff.db, { business: BY_SMILE_ID, kind: "view", day: TODAY });
    await dbs.staff.db.insert(directoryDailyCounts).values({ listingKey: SMILE_KEY, day: TODAY, kind: "view", count: 2 });
    await backfillDirectoryPlaces(dbs.staff.db, NOW);
    expect((await signals()).get(SMILE)?.score).toBe(21);
    expect(await dbs.staff.db.select({ count: directoryDailyCounts.count }).from(directoryDailyCounts).where(eq(directoryDailyCounts.kind, "view"))).toEqual([
      { count: 12 },
    ]);
  });

  it("restores a key-only review onto its place, hiding the number's review the place has since", async () => {
    const [early] = await dbs.staff.db.select({ id: directoryReviews.id }).from(directoryReviews).where(eq(directoryReviews.phone, RAVI));
    await hideDirectoryReview(dbs.staff.db, { reviewId: early?.id ?? "", staffUserId: STAFF, now: NOW });
    const [since] = await dbs.staff.db
      .insert(directoryReviews)
      .values({ placeId: SMILE, businessName: "Smile Dental", reviewerName: "Ravi Kumar", phone: RAVI, rating: 5, createdAt: NOW, updatedAt: NOW })
      .returning({ id: directoryReviews.id });
    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: early?.id ?? "", now: NOW })).toBe(true);
    const rows = await dbs.staff.db
      .select({ id: directoryReviews.id, placeId: directoryReviews.placeId, status: directoryReviews.status })
      .from(directoryReviews)
      .where(eq(directoryReviews.phone, RAVI))
      .orderBy(directoryReviews.id);
    expect(rows).toEqual([
      { id: early?.id, placeId: SMILE, status: "published" },
      { id: since?.id, placeId: SMILE, status: "hidden" },
    ]);
  });

  it("still finds a client by its listing's address while the listing has no place", async () => {
    await dbs.staff.db.insert(users).values({ id: "gym-owner", name: "Gym Owner", email: "gym@example.com", emailVerified: true });
    const [gym] = await dbs.staff.db.insert(businesses).values({ name: "Iron House", slug: "iron-house", currency: "INR" }).returning({ id: businesses.id });
    if (gym === undefined) throw new Error("No business");
    await dbs.staff.db.insert(businessMembers).values({ businessId: gym.id, userId: "gym-owner", role: "owner" });
    await saveListingPlacement(
      dbs.staff.db,
      gym.id,
      {
        categorySlug: "gyms",
        stateCode: "mh",
        citySlug: "thane",
        areaSlug: "majiwada",
        slug: "iron-house",
        lat: 19.2,
        lon: 72.98,
        pinLabel: "Majiwada",
        whatsappPhone: null,
        bookingUrl: null,
        replacesSourcePath: null,
        takeOverPlaceId: null,
      },
      NOW,
    );
    // A listing from before places, which the backfill has not reached (a new one gets its place on its first save).
    await dbs.staff.db.update(directoryListings).set({ placeId: null }).where(eq(directoryListings.businessId, gym.id));
    expect(await findListingOwner(dbs.staff.db, BY_GYM_KEY)).toMatchObject({ businessId: gym.id, account: "client" });
  });
});
