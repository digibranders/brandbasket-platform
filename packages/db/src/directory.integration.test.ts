import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimDirectoryReviewOtpAttempt,
  countDirectoryEnquiries,
  countDirectoryReviews,
  countDirectoryTrusted,
  countDirectoryVerifications,
  createDirectoryReviewOtp,
  deleteDirectoryReviewOtp,
  findDirectoryReviewOtp,
  hideDirectoryReview,
  incrementDirectoryDailyCount,
  insertDirectoryEnquiry,
  listDirectoryEnquiriesForStaff,
  listDirectoryReviewsForStaff,
  listDirectoryVerifications,
  listListingEnquiries,
  listPublishedDirectoryReviews,
  markDirectoryEnquiryHandled,
  publishDirectoryReviewFromOtp,
  purgeExpiredDirectoryReviewOtps,
  purgeOldDirectoryDailyCounts,
  readDirectoryRatings,
  readDirectorySignals,
  readDirectoryShareCounts,
  readDirectoryStatuses,
  removeDirectoryVerification,
  restoreDirectoryReview,
  setDirectoryTrusted,
  TooManyRatingKeysError,
  TooManySignalKeysError,
  TooManyStatusKeysError,
  trustDirectoryBusiness,
  upsertDirectoryVerification,
  type DirectoryReviewOtpPayload,
  type NewDirectoryEnquiry,
} from "./queries/directory";
import type { DirectoryLookup, DirectoryRef } from "./queries/directory-refs";
import {
  directoryDailyCounts,
  directoryEnquiries,
  directoryReviewOtps,
  directoryReviews,
  directoryVerifications,
  users,
  type DirectoryEventKind,
} from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF_USER = "staff-1";
const OTHER_STAFF_USER = "staff-2";
const NOW = new Date("2026-09-29T10:00:00.000Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const DENTIST = "dentists/thane/naupada/smile-dental";
const SALON = "salons/thane/vasant-vihar/glow-studio";
const GYM = "gyms/thane/majiwada/iron-house";

const PRIYA = "+919876543210";
const RAVI = "+919811111111";
const ANITA = "+919822222222";
const MEERA = "+919833333333";

let dbs: TestDatabases;
let otpSeq = 0;

/** A key no place has: read and written by the key alone, as before ids (the place-based paths are covered in
 * directory-by-place.integration.test.ts). */
function byKey(listingKey: string): DirectoryRef {
  return { placeId: null, listingKey };
}

function byKeys(listingKeys: readonly string[]): DirectoryLookup {
  return { placeIds: [], unplacedKeys: listingKeys };
}

function payload(overrides: Partial<DirectoryReviewOtpPayload> = {}): DirectoryReviewOtpPayload {
  return {
    businessName: "Smile Dental",
    reviewerName: "Priya Sharma",
    rating: 5,
    text: "Painless and on time.",
    highlights: ["good_service"],
    ...overrides,
  };
}

/** A fresh, v4-shaped id: the platform supplies the OTP id up front (it salts the hash). */
function nextOtpId(): string {
  otpSeq += 1;
  return `00000000-0000-4000-8000-${otpSeq.toString().padStart(12, "0")}`;
}

async function createOtp(
  listingKey: string,
  phone: string,
  overrides: Partial<DirectoryReviewOtpPayload> = {},
  expiresAt = new Date(NOW.getTime() + TEN_MINUTES_MS),
): Promise<string> {
  return createDirectoryReviewOtp(dbs.staff.db, {
    id: nextOtpId(),
    business: byKey(listingKey),
    phone,
    codeHash: "hash",
    payload: payload(overrides),
    expiresAt,
  });
}

/** Claims an attempt and publishes, the way the confirm route does once the code matched. */
async function review(listingKey: string, phone: string, overrides: Partial<DirectoryReviewOtpPayload> = {}, now = NOW) {
  const otpId = await createOtp(listingKey, phone, overrides, new Date(now.getTime() + TEN_MINUTES_MS));
  const claim = await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now });
  expect(claim).not.toBeNull();
  const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now });
  if (published === null) throw new Error("The review was not published");
  return published;
}

function minutesAfter(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

const BUSINESS_ENQUIRY: NewDirectoryEnquiry = {
  kind: "business",
  business: byKey(DENTIST),
  businessName: "Smile Dental",
  serviceLabel: "Dentists",
  areaLabel: "Naupada",
  name: "Ravi Kumar",
  phone: RAVI,
  message: "Do you do braces?",
};

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: STAFF_USER, name: "Sam Staff", email: "sam@fynix.test" },
    { id: OTHER_STAFF_USER, name: "Olu Other", email: "olu@fynix.test" },
  ]);
});

describe("publishDirectoryReviewFromOtp", () => {
  it("publishes the held review, verifies and deletes the code", async () => {
    const otpId = await createOtp(DENTIST, PRIYA);
    expect(await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toEqual({ attempts: 1 });

    const published = await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW });
    expect(published).toMatchObject({ replaced: false });

    const [row] = await dbs.staff.db.select().from(directoryReviews).where(eq(directoryReviews.id, published?.reviewId ?? ""));
    expect(row).toMatchObject({
      listingKey: DENTIST,
      phone: PRIYA,
      businessName: "Smile Dental",
      reviewerName: "Priya Sharma",
      rating: 5,
      text: "Painless and on time.",
      highlights: ["good_service"],
      status: "published",
      createdAt: NOW,
    });
    expect(await findDirectoryReviewOtp(dbs.staff.db, otpId)).toBeNull();
  });

  it("replaces the same phone's earlier review of the listing and publishes it again, even if hidden", async () => {
    const first = await review(DENTIST, PRIYA, { rating: 2, text: "Long wait." });
    expect(await hideDirectoryReview(dbs.staff.db, { reviewId: first.reviewId, staffUserId: STAFF_USER, now: minutesAfter(1) })).toBe(true);

    const second = await review(DENTIST, PRIYA, { rating: 4, text: null, highlights: ["on_time", "clean"] }, minutesAfter(5));
    expect(second).toEqual({ reviewId: first.reviewId, replaced: true });

    const rows = await dbs.staff.db.select().from(directoryReviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rating: 4,
      text: null,
      highlights: ["on_time", "clean"],
      status: "published",
      hiddenAt: null,
      hiddenByUserId: null,
      createdAt: minutesAfter(5),
    });
  });

  it("keeps different phones, and one phone's reviews of different listings, apart", async () => {
    await review(DENTIST, PRIYA);
    await review(DENTIST, RAVI);
    await review(SALON, PRIYA, { businessName: "Glow Studio" });
    expect(await dbs.staff.db.$count(directoryReviews)).toBe(3);
  });

  it("publishes nothing for an expired, already used, over-attempted or unknown code", async () => {
    const expired = await createOtp(DENTIST, PRIYA, {}, minutesAfter(-1));
    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: expired, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    const used = await createOtp(DENTIST, RAVI);
    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: used, maxAttempts: MAX_ATTEMPTS, now: NOW })).not.toBeNull();
    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: used, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    const exhausted = await createOtp(DENTIST, ANITA);
    await dbs.staff.db.update(directoryReviewOtps).set({ attempts: 6 }).where(eq(directoryReviewOtps.id, exhausted));
    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: exhausted, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    expect(await publishDirectoryReviewFromOtp(dbs.staff.db, { otpId: "not-a-uuid", maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();
    expect(await dbs.staff.db.$count(directoryReviews)).toBe(1);
  });

  it("rolls the code's verification back when the review cannot be stored", async () => {
    const otpId = await createOtp(DENTIST, PRIYA, { highlights: ["not_a_highlight" as never] });
    const failure = await captureErrorText(publishDirectoryReviewFromOtp(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW }));
    expect(failure).toContain("directory_reviews_highlights_check");
    expect((await findDirectoryReviewOtp(dbs.staff.db, otpId))?.verifiedAt).toBeNull();
  });
});

describe("review codes", () => {
  it("claims attempts up to the ceiling and no further, and not once expired", async () => {
    const otpId = await createOtp(DENTIST, PRIYA);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      expect(await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toEqual({ attempts: attempt });
    }
    expect(await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })).toBeNull();

    const other = await createOtp(DENTIST, RAVI);
    expect(await claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId: other, maxAttempts: MAX_ATTEMPTS, now: minutesAfter(11) })).toBeNull();
  });

  it("lets only one of many racing claims take the last try", async () => {
    const otpId = await createOtp(DENTIST, PRIYA);
    await dbs.staff.db.update(directoryReviewOtps).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(directoryReviewOtps.id, otpId));
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => claimDirectoryReviewOtpAttempt(dbs.staff.db, { otpId, maxAttempts: MAX_ATTEMPTS, now: NOW })),
    );
    expect(claims.filter((claim) => claim !== null)).toEqual([{ attempts: MAX_ATTEMPTS }]);
  });

  it("finds a code with its payload, and deletes it", async () => {
    const otpId = await createOtp(DENTIST, PRIYA, { highlights: ["expert", "quality"] });
    expect(await findDirectoryReviewOtp(dbs.staff.db, otpId)).toMatchObject({
      listingKey: DENTIST,
      phone: PRIYA,
      attempts: 0,
      verifiedAt: null,
      payload: { highlights: ["expert", "quality"], rating: 5 },
    });
    expect(await findDirectoryReviewOtp(dbs.staff.db, "nope")).toBeNull();
    expect(await deleteDirectoryReviewOtp(dbs.staff.db, otpId)).toBe(true);
    expect(await deleteDirectoryReviewOtp(dbs.staff.db, otpId)).toBe(false);
  });

  it("purges codes an hour past expiry and keeps the rest", async () => {
    await createOtp(DENTIST, PRIYA, {}, minutesAfter(-61));
    const recent = await createOtp(DENTIST, RAVI, {}, minutesAfter(-59));
    const live = await createOtp(DENTIST, ANITA);
    expect(await purgeExpiredDirectoryReviewOtps(dbs.staff.db, NOW)).toBe(1);
    const left = await dbs.staff.db.select({ id: directoryReviewOtps.id }).from(directoryReviewOtps);
    expect(left.map((row) => row.id).sort()).toEqual([recent, live].sort());
  });
});

describe("readDirectoryRatings", () => {
  it("averages to one decimal, counts, and picks the most-picked highlight", async () => {
    await review(DENTIST, PRIYA, { rating: 5, highlights: ["quality", "on_time"] });
    await review(DENTIST, RAVI, { rating: 4, highlights: ["quality"] });
    await review(DENTIST, ANITA, { rating: 4, highlights: ["good_service"] });
    await review(SALON, PRIYA, { rating: 3, highlights: [] });

    const ratings = await readDirectoryRatings(dbs.staff.db, byKeys([DENTIST, SALON, GYM]));
    expect(ratings.get(DENTIST)).toEqual({ average: 4.3, count: 3, topHighlight: { id: "quality", count: 2 } });
    expect(ratings.get(SALON)).toEqual({ average: 3, count: 1, topHighlight: null });
    expect(ratings.has(GYM)).toBe(false);
  });

  it("breaks a highlight tie by the fixed list order", async () => {
    await review(DENTIST, PRIYA, { highlights: ["quick_response", "clean"] });
    await review(DENTIST, RAVI, { highlights: ["clean", "quick_response"] });
    const ratings = await readDirectoryRatings(dbs.staff.db, byKeys([DENTIST]));
    expect(ratings.get(DENTIST)?.topHighlight).toEqual({ id: "clean", count: 2 });
  });

  it("rounds halves away from zero", async () => {
    await review(DENTIST, PRIYA, { rating: 4 });
    await review(DENTIST, RAVI, { rating: 5 });
    await review(DENTIST, ANITA, { rating: 5 });
    await review(DENTIST, MEERA, { rating: 5 });
    // 19 / 4 = 4.75
    expect((await readDirectoryRatings(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.average).toBe(4.8);
  });

  it("leaves hidden reviews out of the rating and the highlights", async () => {
    await review(DENTIST, PRIYA, { rating: 5, highlights: ["expert"] });
    const hidden = await review(DENTIST, RAVI, { rating: 1, highlights: ["clean"] });
    await hideDirectoryReview(dbs.staff.db, { reviewId: hidden.reviewId, staffUserId: STAFF_USER, now: NOW });
    expect((await readDirectoryRatings(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)).toEqual({
      average: 5,
      count: 1,
      topHighlight: { id: "expert", count: 1 },
    });

    await hideDirectoryReview(dbs.staff.db, { reviewId: (await review(SALON, PRIYA)).reviewId, staffUserId: STAFF_USER, now: NOW });
    expect((await readDirectoryRatings(dbs.staff.db, byKeys([SALON]))).size).toBe(0);
  });

  it("takes no keys, duplicates, and refuses more than 50", async () => {
    await review(DENTIST, PRIYA);
    expect((await readDirectoryRatings(dbs.staff.db, byKeys([]))).size).toBe(0);
    expect((await readDirectoryRatings(dbs.staff.db, byKeys([DENTIST, DENTIST]))).get(DENTIST)?.count).toBe(1);
    const tooMany = Array.from({ length: 51 }, (_, index) => `dentists/thane/naupada/clinic-${index}`);
    await expect(readDirectoryRatings(dbs.staff.db, byKeys(tooMany))).rejects.toBeInstanceOf(TooManyRatingKeysError);
  });
});

describe("listPublishedDirectoryReviews", () => {
  it("pages published reviews newest first with a first name and initial only", async () => {
    await review(DENTIST, PRIYA, { reviewerName: "Priya Anand Sharma" }, minutesAfter(1));
    await review(DENTIST, RAVI, { reviewerName: "Ravi" }, minutesAfter(2));
    const hidden = await review(DENTIST, ANITA, { reviewerName: "Anita Rao" }, minutesAfter(3));
    await hideDirectoryReview(dbs.staff.db, { reviewId: hidden.reviewId, staffUserId: STAFF_USER, now: minutesAfter(4) });
    await review(SALON, MEERA, { reviewerName: "Meera Iyer" }, minutesAfter(5));

    const first = await listPublishedDirectoryReviews(dbs.staff.db, { business: byKey(DENTIST), page: 1, pageSize: 1 });
    expect(first.total).toBe(2);
    expect(first.reviews.map((row) => row.displayName)).toEqual(["Ravi"]);
    const second = await listPublishedDirectoryReviews(dbs.staff.db, { business: byKey(DENTIST), page: 2, pageSize: 1 });
    expect(second.reviews).toEqual([
      expect.objectContaining({ displayName: "Priya S.", rating: 5, text: "Painless and on time.", highlights: ["good_service"] }),
    ]);
    expect(second.reviews[0]).not.toHaveProperty("phone");
    expect(second.reviews[0]).not.toHaveProperty("reviewerName");
    const beyond = await listPublishedDirectoryReviews(dbs.staff.db, { business: byKey(DENTIST), page: 3, pageSize: 1 });
    expect(beyond).toEqual({ reviews: [], total: 2 });
  });

  it("refuses a page below 1", async () => {
    await expect(listPublishedDirectoryReviews(dbs.staff.db, { business: byKey(DENTIST), page: 0, pageSize: 10 })).rejects.toBeInstanceOf(RangeError);
  });
});

describe("staff review moderation", () => {
  it("hides and restores, once each, and lists by status with counts", async () => {
    const older = await review(DENTIST, PRIYA, {}, minutesAfter(1));
    const newer = await review(SALON, RAVI, { businessName: "Glow Studio" }, minutesAfter(2));

    expect(await hideDirectoryReview(dbs.staff.db, { reviewId: older.reviewId, staffUserId: STAFF_USER, now: minutesAfter(3) })).toBe(true);
    expect(await hideDirectoryReview(dbs.staff.db, { reviewId: older.reviewId, staffUserId: STAFF_USER, now: minutesAfter(3) })).toBe(false);
    const [hiddenRow] = await dbs.staff.db.select().from(directoryReviews).where(eq(directoryReviews.id, older.reviewId));
    expect(hiddenRow).toMatchObject({ status: "hidden", hiddenAt: minutesAfter(3), hiddenByUserId: STAFF_USER });

    expect(await countDirectoryReviews(dbs.staff.db)).toEqual({ published: 1, hidden: 1 });
    const all = await listDirectoryReviewsForStaff(dbs.staff.db, { status: "all", limit: 25, offset: 0 });
    expect(all.total).toBe(2);
    expect(all.rows.map((row) => row.id)).toEqual([newer.reviewId, older.reviewId]);
    expect(all.rows[1]).toMatchObject({ reviewerName: "Priya Sharma", phone: PRIYA, status: "hidden" });
    const hiddenOnly = await listDirectoryReviewsForStaff(dbs.staff.db, { status: "hidden", limit: 25, offset: 0 });
    expect(hiddenOnly.rows.map((row) => row.id)).toEqual([older.reviewId]);
    const paged = await listDirectoryReviewsForStaff(dbs.staff.db, { status: "all", limit: 1, offset: 1 });
    expect(paged).toMatchObject({ total: 2, rows: [expect.objectContaining({ id: older.reviewId })] });

    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: older.reviewId, now: minutesAfter(4) })).toBe(true);
    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: older.reviewId, now: minutesAfter(4) })).toBe(false);
    expect(await restoreDirectoryReview(dbs.staff.db, { reviewId: "nope", now: NOW })).toBe(false);
    expect(await countDirectoryReviews(dbs.staff.db)).toEqual({ published: 2, hidden: 0 });
  });
});

describe("enquiries", () => {
  it("stores both kinds, lists new ones newest first, and marks one handled once", async () => {
    const business = await insertDirectoryEnquiry(dbs.staff.db, BUSINESS_ENQUIRY);
    await dbs.staff.db.update(directoryEnquiries).set({ createdAt: minutesAfter(-5) }).where(eq(directoryEnquiries.id, business));
    const topList = await insertDirectoryEnquiry(dbs.staff.db, {
      kind: "top_list",
      business: null,
      businessName: null,
      serviceLabel: "Dentists",
      areaLabel: "Thane",
      name: "Anita Rao",
      phone: ANITA,
      message: null,
    });

    const fresh = await listDirectoryEnquiriesForStaff(dbs.staff.db, { status: "new", limit: 25, offset: 0 });
    expect(fresh.total).toBe(2);
    expect(fresh.rows.map((row) => row.id)).toEqual([topList, business]);
    expect(fresh.rows[1]).toMatchObject({ kind: "business", businessName: "Smile Dental", message: "Do you do braces?" });

    expect(await markDirectoryEnquiryHandled(dbs.staff.db, { enquiryId: business, staffUserId: STAFF_USER, now: NOW })).toBe(true);
    expect(await markDirectoryEnquiryHandled(dbs.staff.db, { enquiryId: business, staffUserId: STAFF_USER, now: NOW })).toBe(false);
    expect(await countDirectoryEnquiries(dbs.staff.db)).toEqual({ new: 1, handled: 1 });
    const handled = await listDirectoryEnquiriesForStaff(dbs.staff.db, { status: "handled", limit: 25, offset: 0 });
    expect(handled.rows).toEqual([expect.objectContaining({ id: business, status: "handled", handledAt: NOW })]);
  });

  it("lists one business's own enquiries for its owner, newest first, and no one else's", async () => {
    const older = await insertDirectoryEnquiry(dbs.staff.db, BUSINESS_ENQUIRY);
    await dbs.staff.db.update(directoryEnquiries).set({ createdAt: minutesAfter(-5) }).where(eq(directoryEnquiries.id, older));
    const newer = await insertDirectoryEnquiry(dbs.staff.db, { ...BUSINESS_ENQUIRY, name: "Second Visitor", message: null });
    await insertDirectoryEnquiry(dbs.staff.db, { ...BUSINESS_ENQUIRY, business: byKey("dentists/thane/naupada/another-clinic"), businessName: "Another Clinic" });

    const own = await listListingEnquiries(dbs.staff.db, byKey(DENTIST), 20);
    expect(own.map((row) => row.id)).toEqual([newer, older]);
    expect(own[0]).toMatchObject({ name: "Second Visitor", phone: BUSINESS_ENQUIRY.phone, message: null });
    expect(await listListingEnquiries(dbs.staff.db, byKey(DENTIST), 1)).toHaveLength(1);
    expect(await listListingEnquiries(dbs.staff.db, byKey("dentists/thane/naupada/nobody"), 20)).toEqual([]);
  });

  it("refuses a business enquiry without its listing, and a top-list one with one", async () => {
    const row = {
      kind: "business" as const,
      businessName: "Smile Dental",
      serviceLabel: "Dentists",
      areaLabel: "Naupada",
      name: "Ravi Kumar",
      phone: RAVI,
      message: "Do you do braces?",
    };
    const missing = await captureErrorText(dbs.staff.db.insert(directoryEnquiries).values({ ...row, listingKey: null }));
    expect(missing).toContain("directory_enquiries_kind_check");
    const extra = await captureErrorText(
      dbs.staff.db.insert(directoryEnquiries).values({ ...row, listingKey: DENTIST, kind: "top_list" }),
    );
    expect(extra).toContain("directory_enquiries_kind_check");
  });
});

describe("table rules", () => {
  it("refuses a malformed listing key, a bad rating, a third or repeated highlight and a non-E.164 phone", async () => {
    const base = { listingKey: DENTIST, businessName: "Smile Dental", reviewerName: "Priya", phone: PRIYA, rating: 5 };
    const cases: readonly [string, Partial<typeof directoryReviews.$inferInsert>][] = [
      ["directory_reviews_listing_key_check", { listingKey: "dentists/thane/Naupada/smile" }],
      ["directory_reviews_listing_key_check", { listingKey: "dentists/thane/smile" }],
      ["directory_reviews_rating_check", { rating: 6 }],
      ["directory_reviews_highlights_check", { highlights: ["clean", "expert", "quality"] }],
      ["directory_reviews_highlights_check", { highlights: ["clean", "clean"] }],
      ["directory_reviews_phone_check", { phone: "9876543210" }],
      ["directory_reviews_text_check", { text: "" }],
      ["directory_reviews_hidden_check", { status: "hidden" }],
    ];
    for (const [constraint, overrides] of cases) {
      expect(await captureErrorText(dbs.staff.db.insert(directoryReviews).values({ ...base, ...overrides }))).toContain(constraint);
    }
  });

  it("gives the app and public roles no access", async () => {
    for (const role of ["fynix_app", "fynix_public"]) {
      for (const table of [
        "directory_reviews",
        "directory_review_otps",
        "directory_enquiries",
        "directory_verifications",
        "directory_daily_counts",
      ]) {
        const result = await dbs.owner.db.execute<{ allowed: boolean }>(
          sql`select has_table_privilege(${role}, ${`public.${table}`}, 'SELECT, INSERT, UPDATE, DELETE') as allowed`,
        );
        expect(result.rows[0]?.allowed, `${role} on ${table}`).toBe(false);
      }
    }
  });
});

describe("verified businesses", () => {
  function verify(
    listingKey: string,
    businessName: string,
    phone: string | null,
    now = NOW,
    staffUserId = STAFF_USER,
    trusted?: boolean,
  ) {
    return upsertDirectoryVerification(dbs.staff.db, {
      listingKey,
      businessName,
      phone,
      staffUserId,
      now,
      ...(trusted === undefined ? {} : { trusted }),
    });
  }

  it("verifies a business, and verifying it again replaces its details and date", async () => {
    expect(await verify(DENTIST, "Smile Dental", PRIYA)).toEqual({ replaced: false });
    expect(await verify(DENTIST, "Smile Dental Clinic", null, minutesAfter(5), OTHER_STAFF_USER)).toEqual({ replaced: true });

    const rows = await dbs.staff.db.select().from(directoryVerifications);
    expect(rows).toEqual([
      {
        listingKey: DENTIST,
        // A key no place has is verified by the key alone.
        placeId: null,
        businessName: "Smile Dental Clinic",
        phone: null,
        verifiedAt: minutesAfter(5),
        verifiedByUserId: OTHER_STAFF_USER,
        trusted: false,
        updatedAt: minutesAfter(5),
      },
    ]);
    expect(await countDirectoryVerifications(dbs.staff.db)).toBe(1);
  });

  it("is not trusted unless staff grant it", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(false);
    expect(await countDirectoryTrusted(dbs.staff.db)).toBe(0);
  });

  it("verifies and trusts in one go, and shows the trust in the statuses and the staff list", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA, NOW, STAFF_USER, true);
    await verify(SALON, "Glow Studio", null, minutesAfter(1));

    const statuses = await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST, SALON]));
    expect(Object.fromEntries(statuses)).toEqual({
      [DENTIST]: { verifiedAt: NOW, phone: PRIYA, trusted: true },
      [SALON]: { verifiedAt: minutesAfter(1), phone: null, trusted: false },
    });
    const listed = await listDirectoryVerifications(dbs.staff.db, { limit: 25, offset: 0, search: "" });
    expect(listed.rows.map((row) => [row.listingKey, row.trusted])).toEqual([
      [SALON, false],
      [DENTIST, true],
    ]);
    expect(await countDirectoryTrusted(dbs.staff.db)).toBe(1);
  });

  it("keeps the trust when a business is verified again without saying, and changes it when told", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA, NOW, STAFF_USER, true);
    // The owner's own re-verify, or a staff re-verify that leaves the choice alone, must not strip a granted tag.
    await verify(DENTIST, "Smile Dental Clinic", PRIYA, minutesAfter(5));
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(true);

    await verify(DENTIST, "Smile Dental Clinic", PRIYA, minutesAfter(6), STAFF_USER, false);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(false);
  });

  it("grants and takes back trust on a verified business, once each, and not on one that is not verified", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA);
    expect(await setDirectoryTrusted(dbs.staff.db, DENTIST, true, minutesAfter(1))).toBe(true);
    expect(await setDirectoryTrusted(dbs.staff.db, DENTIST, true, minutesAfter(2))).toBe(false);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(true);
    // The verification date is when the details were confirmed, so granting trust leaves it alone.
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.verifiedAt).toEqual(NOW);

    expect(await setDirectoryTrusted(dbs.staff.db, DENTIST, false, minutesAfter(3))).toBe(true);
    expect(await setDirectoryTrusted(dbs.staff.db, DENTIST, false, minutesAfter(4))).toBe(false);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(false);

    expect(await setDirectoryTrusted(dbs.staff.db, GYM, true, NOW)).toBe(false);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([GYM]))).size).toBe(0);
  });

  it("trusts a business that is not verified by verifying it, and one that is by adding only the tag", async () => {
    const input = { listingKey: DENTIST, businessName: "Smile Dental", phone: null, staffUserId: STAFF_USER, now: NOW };
    expect(await trustDirectoryBusiness(dbs.staff.db, input)).toBe(true);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)).toEqual({ verifiedAt: NOW, phone: null, trusted: true });
    expect(await trustDirectoryBusiness(dbs.staff.db, { ...input, now: minutesAfter(5) })).toBe(false);

    // Verified earlier, with a number and by someone else: the details and the date stay.
    await verify(SALON, "Glow Studio", PRIYA, NOW, OTHER_STAFF_USER);
    expect(
      await trustDirectoryBusiness(dbs.staff.db, { ...input, listingKey: SALON, businessName: "Other Name", now: minutesAfter(6) }),
    ).toBe(true);
    const row = (await dbs.staff.db.select().from(directoryVerifications).where(eq(directoryVerifications.listingKey, SALON)))[0];
    expect(row).toMatchObject({ businessName: "Glow Studio", phone: PRIYA, verifiedAt: NOW, verifiedByUserId: OTHER_STAFF_USER, trusted: true });
  });

  it("loses the trust with the verification, so verifying again starts untrusted", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA, NOW, STAFF_USER, true);
    expect(await removeDirectoryVerification(dbs.staff.db, DENTIST)).toBe(true);
    await verify(DENTIST, "Smile Dental", PRIYA, minutesAfter(1));
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)?.trusted).toBe(false);
  });

  it("reads the statuses of many keys at once, leaving unverified ones out", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA);
    await verify(SALON, "Glow Studio", null, minutesAfter(1));

    const statuses = await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST, SALON, GYM, DENTIST]));
    expect(Object.fromEntries(statuses)).toEqual({
      [DENTIST]: { verifiedAt: NOW, phone: PRIYA, trusted: false },
      [SALON]: { verifiedAt: minutesAfter(1), phone: null, trusted: false },
    });
  });

  it("takes no keys, and refuses more than 50", async () => {
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([]))).size).toBe(0);
    const tooMany = Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`);
    await expect(readDirectoryStatuses(dbs.staff.db, byKeys(tooMany))).rejects.toBeInstanceOf(TooManyStatusKeysError);
  });

  it("lists newest first with who verified it, pages, and searches names with wildcards taken literally", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA, NOW);
    await verify(SALON, "Glow Studio 100%", null, minutesAfter(1), OTHER_STAFF_USER);
    await verify(GYM, "Iron House", RAVI, minutesAfter(2));

    const all = await listDirectoryVerifications(dbs.staff.db, { limit: 2, offset: 0, search: "" });
    expect(all.total).toBe(3);
    expect(all.rows.map((row) => row.listingKey)).toEqual([GYM, SALON]);
    expect(all.rows[1]).toEqual({
      listingKey: SALON,
      placeId: null,
      businessName: "Glow Studio 100%",
      phone: null,
      verifiedAt: minutesAfter(1),
      verifiedByName: "Olu Other",
      trusted: false,
    });
    const second = await listDirectoryVerifications(dbs.staff.db, { limit: 2, offset: 2, search: "  " });
    expect(second.rows.map((row) => row.listingKey)).toEqual([DENTIST]);

    const smile = await listDirectoryVerifications(dbs.staff.db, { limit: 25, offset: 0, search: " sMiLe " });
    expect(smile).toMatchObject({ total: 1, rows: [{ listingKey: DENTIST }] });
    const percent = await listDirectoryVerifications(dbs.staff.db, { limit: 25, offset: 0, search: "0%" });
    expect(percent.rows.map((row) => row.listingKey)).toEqual([SALON]);
    const underscore = await listDirectoryVerifications(dbs.staff.db, { limit: 25, offset: 0, search: "_" });
    expect(underscore.total).toBe(0);
  });

  it("removes a verification once", async () => {
    await verify(DENTIST, "Smile Dental", PRIYA);
    expect(await removeDirectoryVerification(dbs.staff.db, DENTIST)).toBe(true);
    expect(await removeDirectoryVerification(dbs.staff.db, DENTIST)).toBe(false);
    expect((await readDirectoryStatuses(dbs.staff.db, byKeys([DENTIST]))).size).toBe(0);
  });

  it("refuses a malformed listing key, a blank or long name, a non-E.164 phone and an unknown verifier", async () => {
    const base = { listingKey: DENTIST, businessName: "Smile Dental", phone: PRIYA, verifiedAt: NOW, verifiedByUserId: STAFF_USER };
    const cases: readonly [string, Partial<typeof directoryVerifications.$inferInsert>][] = [
      ["directory_verifications_listing_key_check", { listingKey: "dentists/thane/Naupada/smile" }],
      ["directory_verifications_listing_key_check", { listingKey: "dentists/thane/smile" }],
      ["directory_verifications_business_name_check", { businessName: "" }],
      ["directory_verifications_business_name_check", { businessName: "x".repeat(201) }],
      ["directory_verifications_phone_check", { phone: "9876543210" }],
      ["directory_verifications_verified_by_user_id_users_id_fk", { verifiedByUserId: "nobody" }],
    ];
    for (const [constraint, overrides] of cases) {
      expect(await captureErrorText(dbs.staff.db.insert(directoryVerifications).values({ ...base, ...overrides }))).toContain(constraint);
    }
  });
});

describe("daily counts and trending", () => {
  const TODAY = "2026-09-29";

  /** The calendar day `days` before TODAY, `YYYY-MM-DD`. */
  function daysAgo(days: number): string {
    const date = new Date(`${TODAY}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  async function seed(listingKey: string, day: string, kind: DirectoryEventKind, count: number): Promise<void> {
    await dbs.staff.db.insert(directoryDailyCounts).values({ listingKey, day, kind, count });
  }

  async function signalOf(listingKey: string) {
    return (await readDirectorySignals(dbs.staff.db, byKeys([listingKey]), TODAY)).get(listingKey);
  }

  it("counts one more each time, separately per listing, day and kind, and atomically under a race", async () => {
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(DENTIST), kind: "view", day: TODAY })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(DENTIST), kind: "view", day: TODAY })).toBe(2);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(DENTIST), kind: "call", day: TODAY })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(DENTIST), kind: "view", day: daysAgo(1) })).toBe(1);
    expect(await incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(SALON), kind: "view", day: TODAY })).toBe(1);

    await Promise.all(
      Array.from({ length: 20 }, () => incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(GYM), kind: "website", day: TODAY })),
    );
    const rows = await dbs.staff.db.select().from(directoryDailyCounts).where(eq(directoryDailyCounts.listingKey, GYM));
    expect(rows).toEqual([{ listingKey: GYM, placeId: null, day: TODAY, kind: "website", count: 20 }]);
  });

  it("scores views plus three times every contact tap, this week against the week before", async () => {
    await seed(DENTIST, TODAY, "view", 10);
    await seed(DENTIST, daysAgo(3), "call", 2);
    await seed(DENTIST, daysAgo(6), "whatsapp", 1);
    await seed(DENTIST, daysAgo(6), "enquire", 1);
    await seed(DENTIST, daysAgo(7), "directions", 1);
    await seed(DENTIST, daysAgo(13), "website", 1);
    await seed(DENTIST, daysAgo(13), "view", 4);
    // Outside both weeks: two weeks back, and a day that has not happened yet.
    await seed(DENTIST, daysAgo(14), "view", 100);
    await seed(DENTIST, daysAgo(-1), "view", 100);

    expect(await signalOf(DENTIST)).toEqual({ score: 10 + 3 * (2 + 1 + 1), previousScore: 3 + 3 + 4, trending: true });
  });

  it("trends on a first week of enough interest, and not one short of it", async () => {
    await seed(DENTIST, TODAY, "view", 20);
    await seed(SALON, TODAY, "view", 19);
    await seed(GYM, daysAgo(2), "call", 7);

    const signals = await readDirectorySignals(dbs.staff.db, byKeys([DENTIST, SALON, GYM]), TODAY);
    expect(signals.get(DENTIST)).toEqual({ score: 20, previousScore: 0, trending: true });
    expect(signals.get(SALON)).toEqual({ score: 19, previousScore: 0, trending: false });
    expect(signals.get(GYM)).toEqual({ score: 21, previousScore: 0, trending: true });
  });

  it("trends at exactly one and a half times last week, and not just under it", async () => {
    await seed(DENTIST, TODAY, "view", 30);
    await seed(DENTIST, daysAgo(7), "view", 20);
    await seed(SALON, TODAY, "view", 29);
    await seed(SALON, daysAgo(7), "view", 20);

    expect(await signalOf(DENTIST)).toEqual({ score: 30, previousScore: 20, trending: true });
    expect(await signalOf(SALON)).toEqual({ score: 29, previousScore: 20, trending: false });
  });

  it("does not trend on a steady or falling week, however busy", async () => {
    await seed(DENTIST, TODAY, "view", 500);
    await seed(DENTIST, daysAgo(10), "view", 500);
    await seed(SALON, daysAgo(8), "view", 50);

    expect(await signalOf(DENTIST)).toEqual({ score: 500, previousScore: 500, trending: false });
    expect(await signalOf(SALON)).toEqual({ score: 0, previousScore: 50, trending: false });
  });

  it("does not trend on growth that is still below the minimum score", async () => {
    await seed(DENTIST, TODAY, "view", 12);
    await seed(DENTIST, daysAgo(7), "view", 1);
    expect(await signalOf(DENTIST)).toEqual({ score: 12, previousScore: 1, trending: false });
  });

  it("leaves shares out of the Trending score, however many there are", async () => {
    await seed(DENTIST, TODAY, "view", 10);
    await seed(DENTIST, TODAY, "share", 500);
    await seed(SALON, TODAY, "share", 500);

    expect(await signalOf(DENTIST)).toEqual({ score: 10, previousScore: 0, trending: false });
    expect(await signalOf(SALON)).toBeUndefined();
  });

  it("totals every share a business ever had, however old, and leaves out one with none", async () => {
    await seed(DENTIST, TODAY, "share", 2);
    await seed(DENTIST, daysAgo(30), "share", 3);
    await seed(DENTIST, daysAgo(400), "share", 5);
    await seed(DENTIST, TODAY, "view", 99);
    await seed(SALON, TODAY, "view", 4);
    await seed(GYM, daysAgo(1), "share", 1);

    const shares = await readDirectoryShareCounts(dbs.staff.db, byKeys([DENTIST, SALON, DENTIST]));
    expect(shares.get(DENTIST)).toBe(10);
    expect(shares.has(SALON)).toBe(false);
    expect(shares.has(GYM)).toBe(false);
    expect((await readDirectoryShareCounts(dbs.staff.db, byKeys([]))).size).toBe(0);

    const tooMany = Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`);
    await expect(readDirectoryShareCounts(dbs.staff.db, byKeys(tooMany))).rejects.toBeInstanceOf(TooManySignalKeysError);
  });

  it("keeps old share counts when it purges old counts of anything else", async () => {
    await seed(DENTIST, daysAgo(200), "share", 4);
    await seed(DENTIST, daysAgo(200), "view", 4);

    expect(await purgeOldDirectoryDailyCounts(dbs.staff.db, TODAY)).toBe(1);
    expect((await readDirectoryShareCounts(dbs.staff.db, byKeys([DENTIST]))).get(DENTIST)).toBe(4);
  });

  it("leaves out keys with no counts, takes duplicates and no keys, and refuses more than 50 or a bad day", async () => {
    await seed(DENTIST, TODAY, "view", 1);
    const signals = await readDirectorySignals(dbs.staff.db, byKeys([DENTIST, SALON, DENTIST]), TODAY);
    expect([...signals.keys()]).toEqual([DENTIST]);
    expect((await readDirectorySignals(dbs.staff.db, byKeys([]), TODAY)).size).toBe(0);

    const tooMany = Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`);
    await expect(readDirectorySignals(dbs.staff.db, byKeys(tooMany), TODAY)).rejects.toBeInstanceOf(TooManySignalKeysError);
    for (const day of ["2026-9-29", "2026-02-30", "today", ""]) {
      await expect(readDirectorySignals(dbs.staff.db, byKeys([DENTIST]), day)).rejects.toBeInstanceOf(RangeError);
      await expect(incrementDirectoryDailyCount(dbs.staff.db, { business: byKey(DENTIST), kind: "view", day })).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("purges counts more than 60 days old and keeps the rest", async () => {
    await seed(DENTIST, daysAgo(61), "view", 1);
    await seed(DENTIST, daysAgo(60), "view", 1);
    await seed(SALON, daysAgo(90), "call", 1);
    await seed(SALON, TODAY, "call", 1);

    expect(await purgeOldDirectoryDailyCounts(dbs.staff.db, TODAY)).toBe(2);
    const left = await dbs.staff.db.select({ listingKey: directoryDailyCounts.listingKey, day: directoryDailyCounts.day }).from(directoryDailyCounts);
    expect(left).toEqual(
      expect.arrayContaining([
        { listingKey: DENTIST, day: daysAgo(60) },
        { listingKey: SALON, day: TODAY },
      ]),
    );
    expect(left).toHaveLength(2);
  });

  it("refuses a malformed listing key, a negative count and an unknown kind", async () => {
    const base = { listingKey: DENTIST, day: TODAY, kind: "view" as const, count: 1 };
    const cases: readonly [string, Partial<typeof directoryDailyCounts.$inferInsert>][] = [
      ["directory_daily_counts_listing_key_check", { listingKey: "dentists/thane/Naupada/smile" }],
      ["directory_daily_counts_listing_key_check", { listingKey: "dentists/thane/smile" }],
      ["directory_daily_counts_count_check", { count: -1 }],
    ];
    for (const [constraint, overrides] of cases) {
      expect(await captureErrorText(dbs.staff.db.insert(directoryDailyCounts).values({ ...base, ...overrides }))).toContain(constraint);
    }
    const unknownKind = dbs.staff.db.execute(
      sql`insert into directory_daily_counts (listing_key, day, kind, count) values (${DENTIST}, ${TODAY}, 'sneeze', 1)`,
    );
    expect(await captureErrorText(unknownKind)).toContain("directory_event_kind");
  });
});
