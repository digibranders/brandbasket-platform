import { and, count, desc, eq, gt, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ContributionConsent } from "./consent-records";
import {
  DIRECTORY_REVIEW_HIGHLIGHT_IDS,
  directoryDailyCounts,
  directoryEnquiries,
  directoryPlaceLegacyKeys,
  directoryReviewOtps,
  directoryReviews,
  directoryVerifications,
  users,
  type DirectoryEnquiryKind,
  type DirectoryEnquiryStatus,
  type DirectoryEventKind,
  type DirectoryReviewHighlightId,
  type DirectoryReviewStatus,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import {
  DirectoryRowWithoutBusinessError,
  directoryBusinessOf,
  directoryLookupSize,
  isEmptyDirectoryLookup,
  matchesDirectoryLookup,
  matchesDirectoryRef,
  resolveListingKey,
  type DirectoryLookup,
  type DirectoryRef,
} from "./directory-refs";
import { isUuid } from "./tenant";

/**
 * The local directory's ratings, reviews and enquiries (docs/superpowers/specs/2026-09-29-directory-reviews-
 * enquiries-design.md). Every function here runs on the staff connection: the platform's /api/directory/* routes
 * (called by the marketing website's server) and the staff console. None of it is tenant-scoped, because a directory
 * listing is not a platform business.
 *
 * Validation of what a visitor typed (lengths, the highlight list, the phone number) happens in the platform before
 * anything reaches here; the table CHECKs (0054) are the backstop.
 *
 * Businesses are named by place id (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md, Task 7): reads
 * take a DirectoryLookup and answer by place id, or by listing key for a key no place has; writes take a DirectoryRef
 * and store the place with the key the request came by (./directory-refs).
 */

// ---------------------------------------------------------------------------------------------------------------
// Public reads: ratings and reviews
// ---------------------------------------------------------------------------------------------------------------

/** The most businesses readDirectoryRatings accepts in one call (the contract's MAX_RATING_KEYS). */
export const MAX_DIRECTORY_RATING_KEYS = 50;

export interface DirectoryRatingSummary {
  /** Mean of the published ratings, rounded to one decimal. */
  readonly average: number;
  readonly count: number;
  /** The most-picked highlight among published reviews, ties broken by DIRECTORY_REVIEW_HIGHLIGHT_IDS order; null
   * when no published review picked one. */
  readonly topHighlight: { readonly id: DirectoryReviewHighlightId; readonly count: number } | null;
}

/** Thrown when a caller asks about more businesses than one ratings read allows. */
export class TooManyRatingKeysError extends Error {
  constructor(received: number) {
    super(`At most ${MAX_DIRECTORY_RATING_KEYS} directory businesses can be read at once, received ${received}.`);
    this.name = "TooManyRatingKeysError";
  }
}

function isHighlightId(value: string): value is DirectoryReviewHighlightId {
  return (DIRECTORY_REVIEW_HIGHLIGHT_IDS as readonly string[]).includes(value);
}

interface RatingSummaryRow extends Record<string, unknown> {
  /** The place id, or the listing key of a review with no place. */
  readonly business: string;
  readonly average: number;
  readonly count: number;
  readonly top_highlight: string | null;
  readonly top_highlight_count: number | null;
}

/** The fixed highlight order as a Postgres text[] of bound parameters, for array_position's tie-break. */
function highlightOrderArray(): ReturnType<typeof sql> {
  return sql`ARRAY[${sql.join(
    DIRECTORY_REVIEW_HIGHLIGHT_IDS.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;
}

/** The columns a reviews read matches businesses on. */
const REVIEW_BUSINESS = { placeId: directoryReviews.placeId, listingKey: directoryReviews.listingKey } as const;

/**
 * The rating summary of each business in `lookup` that has at least one published review, in ONE statement: the
 * published rows are read once, averaged and counted per business (every address of a place together), and their
 * highlights unnested and counted per business so the top one (most picks, then list order) can be taken with
 * DISTINCT ON. Keyed by place id, or by listing key for a key no place has; businesses with no published review are
 * absent. Duplicates are harmless.
 */
export async function readDirectoryRatings(
  db: Database,
  lookup: DirectoryLookup,
): Promise<ReadonlyMap<string, DirectoryRatingSummary>> {
  const size = directoryLookupSize(lookup);
  if (size > MAX_DIRECTORY_RATING_KEYS) throw new TooManyRatingKeysError(size);
  if (isEmptyDirectoryLookup(lookup)) return new Map();

  const result = await db.execute<RatingSummaryRow>(sql`
    with published as (
      select ${directoryBusinessOf(REVIEW_BUSINESS)} as business, rating, highlights
      from ${directoryReviews}
      where status = 'published' and ${matchesDirectoryLookup(REVIEW_BUSINESS, lookup)}
    ),
    totals as (
      select business, round(avg(rating), 1)::float8 as average, count(*)::int as count
      from published
      group by business
    ),
    picks as (
      select business, highlight, count(*)::int as picks
      from published cross join lateral unnest(highlights) as highlight
      group by business, highlight
    ),
    top_picks as (
      select distinct on (business) business, highlight, picks
      from picks
      order by business, picks desc, array_position(${highlightOrderArray()}, highlight)
    )
    select totals.business, totals.average, totals.count,
      top_picks.highlight as top_highlight, top_picks.picks as top_highlight_count
    from totals
    left join top_picks on top_picks.business = totals.business
  `);

  const summaries = new Map<string, DirectoryRatingSummary>();
  for (const row of result.rows) {
    const highlight = row.top_highlight;
    summaries.set(row.business, {
      average: Number(row.average),
      count: Number(row.count),
      topHighlight:
        highlight !== null && isHighlightId(highlight) && row.top_highlight_count !== null
          ? { id: highlight, count: Number(row.top_highlight_count) }
          : null,
    });
  }
  return summaries;
}

/**
 * How a reviewer is shown publicly: their first word and the initial of their last, e.g. "Priya Sharma" and "Priya
 * Anand Sharma" both read "Priya S.", and a single name stays as it is. Whitespace is collapsed first; the initial is
 * the last word's first character (a whole code point, so a name in any script works) upper-cased.
 */
export function reviewerDisplayName(fullName: string): string {
  const words = fullName.trim().split(/\s+/u).filter((word) => word !== "");
  const first = words[0];
  if (first === undefined) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  if (last === undefined) return first;
  const initial = Array.from(last)[0] ?? "";
  return `${first} ${initial.toLocaleUpperCase("en")}.`;
}

export interface PublicDirectoryReview {
  readonly id: string;
  /** reviewerDisplayName of the reviewer's name: the full name and the phone never leave this module publicly. */
  readonly displayName: string;
  readonly rating: number;
  readonly text: string | null;
  readonly highlights: readonly DirectoryReviewHighlightId[];
  /** How many visitors marked it Helpful. */
  readonly helpfulCount: number;
  readonly createdAt: Date;
}

export interface PublicDirectoryReviewPage {
  readonly reviews: readonly PublicDirectoryReview[];
  /** Every published review of the business, for the page count. */
  readonly total: number;
}

export interface ListPublishedDirectoryReviewsInput {
  /** By place, every address's reviews together; a key no place has, by that key. */
  readonly business: DirectoryRef;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

/** One page of a business's published reviews, newest first (ties by id, so pages never overlap). */
export async function listPublishedDirectoryReviews(
  db: Database,
  input: ListPublishedDirectoryReviewsInput,
): Promise<PublicDirectoryReviewPage> {
  if (!Number.isSafeInteger(input.page) || input.page < 1) throw new RangeError(`Page must be a whole number from 1, received ${input.page}`);
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1) throw new RangeError(`Page size must be a positive whole number, received ${input.pageSize}`);

  const published = and(matchesDirectoryRef(REVIEW_BUSINESS, input.business), eq(directoryReviews.status, "published"));
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: directoryReviews.id,
        reviewerName: directoryReviews.reviewerName,
        rating: directoryReviews.rating,
        text: directoryReviews.text,
        highlights: directoryReviews.highlights,
        helpfulCount: directoryReviews.helpfulCount,
        createdAt: directoryReviews.createdAt,
      })
      .from(directoryReviews)
      .where(published)
      .orderBy(desc(directoryReviews.createdAt), desc(directoryReviews.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(directoryReviews).where(published),
  ]);

  return {
    reviews: rows.map((row) => ({
      id: row.id,
      displayName: reviewerDisplayName(row.reviewerName),
      rating: row.rating,
      text: row.text,
      highlights: row.highlights.filter(isHighlightId),
      helpfulCount: row.helpfulCount,
      createdAt: row.createdAt,
    })),
    total: totals[0]?.total ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Review codes
// ---------------------------------------------------------------------------------------------------------------

/** The review waiting on its code. Written and read back only by the platform's review routes; opaque jsonb to
 * Postgres, so the directory_reviews CHECKs are what hold it to shape once it is published. */
export interface DirectoryReviewOtpPayload {
  readonly businessName: string;
  readonly reviewerName: string;
  readonly rating: number;
  readonly text: string | null;
  readonly highlights: readonly DirectoryReviewHighlightId[];
  /** What the reviewer agreed to on the form, kept to record once the code is confirmed. Absent from a held review made before it existed. */
  readonly consent?: ContributionConsent;
  /** The reviewer ticked that the business may contact them about this review (N14). Absent means no. */
  readonly ownerContact?: boolean;
}

export interface NewDirectoryReviewOtp {
  /** Supplied by the caller because the code's hash is salted with it before the insert (see hashOtpCode). */
  readonly id: string;
  /** The business reviewed: a place (already checked to exist) or a key no place has. */
  readonly business: DirectoryRef;
  readonly phone: string;
  readonly codeHash: string;
  readonly payload: DirectoryReviewOtpPayload;
  readonly expiresAt: Date;
}

export interface DirectoryReviewOtpRow {
  readonly id: string;
  /** The address the review was asked by; null when asked by place id. */
  readonly listingKey: string | null;
  readonly placeId: string | null;
  /** Set for a comment's code (see directoryReviewOtps.reviewId); null for a review's. */
  readonly reviewId: string | null;
  readonly phone: string;
  readonly codeHash: string;
  readonly payload: DirectoryReviewOtpPayload;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
}

export async function createDirectoryReviewOtp(db: Database, input: NewDirectoryReviewOtp): Promise<string> {
  const rows = await db
    .insert(directoryReviewOtps)
    .values({
      id: input.id,
      listingKey: input.business.listingKey,
      placeId: input.business.placeId,
      phone: input.phone,
      codeHash: input.codeHash,
      payload: input.payload,
      expiresAt: input.expiresAt,
    })
    .returning({ id: directoryReviewOtps.id });
  const row = rows[0];
  if (row === undefined) throw new Error("Directory review OTP insert returned no row");
  return row.id;
}

/** Null for an id that is not a UUID or names no row. Returns attempts, expiry and verification alongside the payload
 * so the caller can tell an expired code from an exhausted one. */
export async function findDirectoryReviewOtp(db: Database, otpId: string): Promise<DirectoryReviewOtpRow | null> {
  if (!isUuid(otpId)) return null;
  const rows = await db.select().from(directoryReviewOtps).where(eq(directoryReviewOtps.id, otpId)).limit(1);
  const row = rows[0];
  return row === undefined ? null : { ...row, payload: row.payload as DirectoryReviewOtpPayload };
}

export interface DirectoryReviewOtpAttemptInput {
  readonly otpId: string;
  readonly maxAttempts: number;
  readonly now: Date;
}

/**
 * Atomically claims one of the code's `maxAttempts` tries and returns the new count, or null when there was none to
 * claim (no such code, already verified, expired, or out of tries). Every condition is in the one UPDATE's WHERE, so
 * two confirms racing for the last try can never both get it -- the same rule as claimOtpAttempt for bookings.
 * Callers compare the submitted code only after a successful claim.
 */
export async function claimDirectoryReviewOtpAttempt(
  db: Database,
  input: DirectoryReviewOtpAttemptInput,
): Promise<{ readonly attempts: number } | null> {
  if (!isUuid(input.otpId)) return null;
  const rows = await db
    .update(directoryReviewOtps)
    .set({ attempts: sql`${directoryReviewOtps.attempts} + 1` })
    .where(
      and(
        eq(directoryReviewOtps.id, input.otpId),
        lt(directoryReviewOtps.attempts, input.maxAttempts),
        isNull(directoryReviewOtps.verifiedAt),
        gt(directoryReviewOtps.expiresAt, input.now),
      ),
    )
    .returning({ attempts: directoryReviewOtps.attempts });
  return rows[0] ?? null;
}

/**
 * Hides `phone`'s published reviews of a place, except `keepReviewId`'s: one published review per number per business
 * (directory_reviews_place_id_phone_idx, 0077). Reviews written by key before the place was known (no place_id yet)
 * count as the place's when their key is one of its legacy keys, until the backfill gives them the place.
 */
async function hideNumbersOtherReviewsOfPlace(
  tx: ScopedTransaction,
  input: { readonly placeId: string; readonly phone: string; readonly keepReviewId: string | null; readonly now: Date },
): Promise<void> {
  const others: SQL = input.keepReviewId === null ? sql`true` : ne(directoryReviews.id, input.keepReviewId);
  await tx.execute(sql`
    update ${directoryReviews}
    set status = 'hidden', hidden_at = ${input.now}, hidden_by_user_id = null, updated_at = ${input.now}
    where ${directoryReviews.phone} = ${input.phone}
      and ${directoryReviews.status} = 'published'
      and ${others}
      and (
        ${directoryReviews.placeId} = ${input.placeId}
        or (
          ${directoryReviews.placeId} is null
          and ${directoryReviews.listingKey} in (select k.listing_key from ${directoryPlaceLegacyKeys} k where k.place_id = ${input.placeId})
        )
      )
  `);
}

/** The business a stored review or code is about. A key-only row's key is resolved again: its place may be known now. */
async function storedBusiness(
  tx: ScopedTransaction,
  table: string,
  row: { readonly placeId: string | null; readonly listingKey: string | null },
): Promise<DirectoryRef> {
  if (row.placeId !== null) return { placeId: row.placeId, listingKey: row.listingKey };
  if (row.listingKey === null) throw new DirectoryRowWithoutBusinessError(table);
  return resolveListingKey(tx, row.listingKey);
}

export interface PublishedDirectoryReview {
  readonly reviewId: string;
  /** True when this replaced the same phone's earlier review of the listing rather than adding a new one. */
  readonly replaced: boolean;
}

/** What a published review says: the visitor's own words and the business's name as it was shown to them. */
interface ReviewContent {
  readonly businessName: string;
  readonly reviewerName: string;
  readonly rating: number;
  readonly text: string | null;
  readonly highlights: DirectoryReviewHighlightId[];
  readonly ownerMayContact: boolean;
}

/**
 * The columns a re-review rewrites: published again, with no trace of a staff hide, dated now, and with no Helpful votes
 * (they were for the words it replaced; its comments stay).
 */
function republished(review: ReviewContent, now: Date) {
  return { ...review, status: "published" as const, hiddenAt: null, hiddenByUserId: null, helpfulCount: 0, createdAt: now, updatedAt: now };
}

/** Serialises everything that publishes a number's review of a place (a confirm, a staff restore) within the transaction. */
async function lockReviewsOfPlace(tx: ScopedTransaction, placeId: string, phone: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`directory-review:${placeId}:${phone}`}, 0))`);
}

/**
 * Publishes a review of a place. The number's earlier review of the place, wherever it was left (including one written
 * by a legacy key before the backfill), is replaced: the one at the address asked by, else the published one, else the
 * latest. Its other published reviews of the place are hidden first, so the replaced one can be published again.
 * Serialised per place and number (lockReviewsOfPlace), so two confirms at once cannot both insert.
 */
async function publishReviewOfPlace(
  tx: ScopedTransaction,
  business: DirectoryRef & { readonly placeId: string },
  phone: string,
  review: ReviewContent,
  now: Date,
): Promise<PublishedDirectoryReview> {
  await lockReviewsOfPlace(tx, business.placeId, phone);
  const sameAddressFirst = business.listingKey === null ? [] : [sql`(${directoryReviews.listingKey} = ${business.listingKey}) desc nulls last`];
  const existing = await tx
    .select({ id: directoryReviews.id })
    .from(directoryReviews)
    .where(and(matchesDirectoryRef(REVIEW_BUSINESS, business), eq(directoryReviews.phone, phone)))
    .orderBy(...sameAddressFirst, sql`(${directoryReviews.status} = 'published') desc`, desc(directoryReviews.updatedAt), desc(directoryReviews.id))
    .limit(1)
    .for("update");
  const replacing = existing[0]?.id ?? null;
  await hideNumbersOtherReviewsOfPlace(tx, { placeId: business.placeId, phone, keepReviewId: replacing, now });

  if (replacing !== null) {
    // A review written by key before the backfill becomes the place's as it is replaced.
    await tx
      .update(directoryReviews)
      .set({ ...republished(review, now), placeId: business.placeId })
      .where(eq(directoryReviews.id, replacing));
    return { reviewId: replacing, replaced: true };
  }
  const values = { listingKey: business.listingKey, placeId: business.placeId, phone, ...review, createdAt: now, updatedAt: now };
  const rows =
    business.listingKey === null
      ? await tx.insert(directoryReviews).values(values).returning({ id: directoryReviews.id, replaced: sql<boolean>`false` })
      : await tx
          .insert(directoryReviews)
          .values(values)
          // A review this number left at this address before its place was known: it becomes the place's.
          .onConflictDoUpdate({
            target: [directoryReviews.listingKey, directoryReviews.phone],
            set: { ...republished(review, now), placeId: business.placeId },
          })
          // xmax is 0 on a freshly inserted row version and the updating transaction's id on one ON CONFLICT updated.
          .returning({ id: directoryReviews.id, replaced: sql<boolean>`not (xmax = 0)` });
  const published = rows[0];
  if (published === undefined) throw new Error("Directory review insert returned no row");
  return { reviewId: published.id, replaced: published.replaced };
}

/** Publishes a review of a key no place has: one review per number per key, a re-review replacing the earlier one. */
async function publishReviewOfKey(
  tx: ScopedTransaction,
  listingKey: string,
  phone: string,
  review: ReviewContent,
  now: Date,
): Promise<PublishedDirectoryReview> {
  const rows = await tx
    .insert(directoryReviews)
    .values({ listingKey, phone, ...review, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [directoryReviews.listingKey, directoryReviews.phone], set: republished(review, now) })
    // xmax is 0 on a freshly inserted row version and the updating transaction's id on one ON CONFLICT updated.
    .returning({ id: directoryReviews.id, replaced: sql<boolean>`not (xmax = 0)` });
  const published = rows[0];
  if (published === undefined) throw new Error("Directory review upsert returned no row");
  return { reviewId: published.id, replaced: published.replaced };
}

/**
 * Verifies the code and publishes the review it was holding, as one transaction:
 * 1. marks the code verified, only if it is unverified, unexpired and within `maxAttempts` (so a double submit, a
 *    confirm after expiry or one that raced past the attempt ceiling publishes nothing and returns null);
 * 2. publishes the review: for a business with a place, replacing this phone's earlier review of the place wherever
 *    it was left and hiding any other (publishReviewOfPlace); for a key no place has, replacing this phone's review at
 *    that key. A replaced review takes the new name, stars, text and highlights, is published again (clearing any staff
 *    hide, as the spec asks) and is dated now, since the words shown are the new ones;
 * 3. deletes the code, which is no longer needed once its review exists.
 * The caller must already have claimed an attempt and matched the code.
 */
export async function publishDirectoryReviewFromOtp(
  db: Database,
  input: DirectoryReviewOtpAttemptInput,
): Promise<PublishedDirectoryReview | null> {
  if (!isUuid(input.otpId)) return null;
  return db.transaction(async (tx) => {
    const verified = await tx
      .update(directoryReviewOtps)
      .set({ verifiedAt: input.now })
      .where(
        and(
          eq(directoryReviewOtps.id, input.otpId),
          // A comment's code never publishes a review.
          isNull(directoryReviewOtps.reviewId),
          isNull(directoryReviewOtps.verifiedAt),
          gt(directoryReviewOtps.expiresAt, input.now),
          sql`${directoryReviewOtps.attempts} <= ${input.maxAttempts}`,
        ),
      )
      .returning({
        listingKey: directoryReviewOtps.listingKey,
        placeId: directoryReviewOtps.placeId,
        phone: directoryReviewOtps.phone,
        payload: directoryReviewOtps.payload,
      });
    const otp = verified[0];
    if (otp === undefined) return null;

    const payload = otp.payload as DirectoryReviewOtpPayload;
    const review: ReviewContent = {
      businessName: payload.businessName,
      reviewerName: payload.reviewerName,
      rating: payload.rating,
      text: payload.text,
      highlights: [...payload.highlights],
      ownerMayContact: payload.ownerContact === true,
    };
    const business = await storedBusiness(tx, "directory_review_otps", otp);
    const published =
      business.placeId === null
        ? await publishReviewOfKey(tx, business.listingKey, otp.phone, review, input.now)
        : await publishReviewOfPlace(tx, { placeId: business.placeId, listingKey: business.listingKey }, otp.phone, review, input.now);

    await tx.delete(directoryReviewOtps).where(eq(directoryReviewOtps.id, input.otpId));
    return published;
  });
}

export async function deleteDirectoryReviewOtp(db: Database, otpId: string): Promise<boolean> {
  if (!isUuid(otpId)) return false;
  const rows = await db
    .delete(directoryReviewOtps)
    .where(eq(directoryReviewOtps.id, otpId))
    .returning({ id: directoryReviewOtps.id });
  return rows.length > 0;
}

/** How long after expiry an unused review code is kept, the same grace as booking codes. */
const DIRECTORY_REVIEW_OTP_PURGE_GRACE_MS = 60 * 60 * 1000;

/**
 * Deletes review codes that expired more than an hour before `now` (a used code is already deleted when its review
 * is published). Called opportunistically, like purgeExpiredBookingData: each call only deletes rows already past
 * their own cutoff, so concurrent or skipped calls are harmless. Returns how many were deleted.
 */
export async function purgeExpiredDirectoryReviewOtps(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DIRECTORY_REVIEW_OTP_PURGE_GRACE_MS);
  const rows = await db
    .delete(directoryReviewOtps)
    .where(lt(directoryReviewOtps.expiresAt, cutoff))
    .returning({ id: directoryReviewOtps.id });
  return rows.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------------------------------------------

export type NewDirectoryEnquiry =
  | {
      readonly kind: Extract<DirectoryEnquiryKind, "business">;
      /** The business it was sent to: a place (already checked to exist) or a key no place has. */
      readonly business: DirectoryRef;
      readonly businessName: string;
      readonly serviceLabel: string;
      readonly areaLabel: string;
      readonly name: string;
      readonly phone: string;
      readonly message: string | null;
    }
  | {
      readonly kind: Extract<DirectoryEnquiryKind, "top_list">;
      readonly business: null;
      readonly businessName: null;
      readonly serviceLabel: string;
      readonly areaLabel: string;
      readonly name: string;
      readonly phone: string;
      readonly message: string | null;
    };

/** A visitor's enquiry as the business it was sent to sees it. */
export interface ListingEnquiry {
  readonly id: string;
  readonly name: string;
  /** Null once the sender erased their data. */
  readonly phone: string | null;
  readonly message: string | null;
  readonly createdAt: Date;
}

/**
 * The newest enquiries visitors sent to one business from its page or its row, for its owner's dashboard: by place,
 * whichever address or id they came by. Staff connection, after the platform has worked out which listing the
 * signed-in customer owns: the table is not the customer role's to read.
 */
export async function listListingEnquiries(db: Database, business: DirectoryRef, limit: number): Promise<ListingEnquiry[]> {
  return db
    .select({
      id: directoryEnquiries.id,
      name: directoryEnquiries.name,
      phone: directoryEnquiries.phone,
      message: directoryEnquiries.message,
      createdAt: directoryEnquiries.createdAt,
    })
    .from(directoryEnquiries)
    .where(
      and(
        matchesDirectoryRef({ placeId: directoryEnquiries.placeId, listingKey: directoryEnquiries.listingKey }, business),
        eq(directoryEnquiries.kind, "business"),
      ),
    )
    .orderBy(desc(directoryEnquiries.createdAt), desc(directoryEnquiries.id))
    .limit(limit);
}

export async function insertDirectoryEnquiry(db: Database, input: NewDirectoryEnquiry): Promise<string> {
  const rows = await db
    .insert(directoryEnquiries)
    .values({
      kind: input.kind,
      listingKey: input.business?.listingKey ?? null,
      placeId: input.business?.placeId ?? null,
      businessName: input.businessName,
      serviceLabel: input.serviceLabel,
      areaLabel: input.areaLabel,
      name: input.name,
      phone: input.phone,
      message: input.message,
    })
    .returning({ id: directoryEnquiries.id });
  const row = rows[0];
  if (row === undefined) throw new Error("Directory enquiry insert returned no row");
  return row.id;
}

// ---------------------------------------------------------------------------------------------------------------
// Staff console
// ---------------------------------------------------------------------------------------------------------------

export interface StaffPageInput {
  readonly limit: number;
  readonly offset: number;
}

function assertPage(input: StaffPageInput): void {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new RangeError(`Limit must be a positive whole number, received ${input.limit}`);
  if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new RangeError(`Offset must be a whole number from 0, received ${input.offset}`);
}

export interface StaffDirectoryReview {
  readonly id: string;
  /** The address the review was left at; null for one left by place id. */
  readonly listingKey: string | null;
  /** The business's permanent id; null for a key no place has. */
  readonly placeId: string | null;
  readonly businessName: string;
  /** The full name, for staff only. */
  readonly reviewerName: string;
  /** Null once the sender erased their data. */
  readonly phone: string | null;
  readonly rating: number;
  readonly text: string | null;
  readonly highlights: readonly DirectoryReviewHighlightId[];
  readonly status: DirectoryReviewStatus;
  readonly hiddenAt: Date | null;
  readonly createdAt: Date;
}

export type DirectoryReviewFilter = DirectoryReviewStatus | "all";

export interface StaffDirectoryReviewPage {
  readonly rows: readonly StaffDirectoryReview[];
  /** Rows matching the filter, for paging. */
  readonly total: number;
}

/** Reviews for the staff console, newest first, optionally only published or only hidden ones. */
export async function listDirectoryReviewsForStaff(
  db: Database,
  input: StaffPageInput & { readonly status: DirectoryReviewFilter },
): Promise<StaffDirectoryReviewPage> {
  assertPage(input);
  const where = input.status === "all" ? undefined : eq(directoryReviews.status, input.status);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: directoryReviews.id,
        listingKey: directoryReviews.listingKey,
        placeId: directoryReviews.placeId,
        businessName: directoryReviews.businessName,
        reviewerName: directoryReviews.reviewerName,
        phone: directoryReviews.phone,
        rating: directoryReviews.rating,
        text: directoryReviews.text,
        highlights: directoryReviews.highlights,
        status: directoryReviews.status,
        hiddenAt: directoryReviews.hiddenAt,
        createdAt: directoryReviews.createdAt,
      })
      .from(directoryReviews)
      .where(where)
      .orderBy(desc(directoryReviews.createdAt), desc(directoryReviews.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(directoryReviews).where(where),
  ]);
  return {
    rows: rows.map((row) => ({ ...row, highlights: row.highlights.filter(isHighlightId) })),
    total: totals[0]?.total ?? 0,
  };
}

export interface DirectoryReviewCounts {
  readonly published: number;
  readonly hidden: number;
}

export async function countDirectoryReviews(db: Database): Promise<DirectoryReviewCounts> {
  const rows = await db
    .select({
      published: sql<number>`count(*) filter (where ${directoryReviews.status} = 'published')::int`,
      hidden: sql<number>`count(*) filter (where ${directoryReviews.status} = 'hidden')::int`,
    })
    .from(directoryReviews);
  return { published: rows[0]?.published ?? 0, hidden: rows[0]?.hidden ?? 0 };
}

export interface HideDirectoryReviewInput {
  readonly reviewId: string;
  readonly staffUserId: string;
  readonly now: Date;
}

/** Hides a published review: it stops counting towards the rating and stops showing. False when the id names no
 * published review (already hidden, or no such review). */
export async function hideDirectoryReview(db: Database, input: HideDirectoryReviewInput): Promise<boolean> {
  if (!isUuid(input.reviewId)) return false;
  const rows = await db
    .update(directoryReviews)
    .set({ status: "hidden", hiddenAt: input.now, hiddenByUserId: input.staffUserId, updatedAt: input.now })
    .where(and(eq(directoryReviews.id, input.reviewId), eq(directoryReviews.status, "published")))
    .returning({ id: directoryReviews.id });
  return rows.length > 0;
}

/**
 * Publishes a hidden review again. The same number's other published review of the business, if it has one at
 * another of its addresses, is hidden in its place: one published review per number per business. False when the id
 * names no hidden review (including one a confirm has just published again). Staff connection.
 *
 * Takes the place's review lock (lockReviewsOfPlace) before it locks the review's row, in the order a confirm does
 * (publishReviewOfPlace locks, then reads the number's rows FOR UPDATE): the other order deadlocks with a confirm by
 * the same number. So the row is read first without a lock, and read again under both once the lock is held.
 */
export async function restoreDirectoryReview(
  db: Database,
  input: { readonly reviewId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.reviewId)) return false;
  const hiddenReview = and(eq(directoryReviews.id, input.reviewId), eq(directoryReviews.status, "hidden"));
  const columns = { listingKey: directoryReviews.listingKey, placeId: directoryReviews.placeId, phone: directoryReviews.phone };
  return db.transaction(async (tx) => {
    const seen = (await tx.select(columns).from(directoryReviews).where(hiddenReview))[0];
    if (seen === undefined) return false;
    // A key no place has holds one review per number (its unique key), so there is nothing else to hide.
    const business = await storedBusiness(tx, "directory_reviews", seen);
    // An erased review has no number, so it can neither clash with nor replace another person's.
    if (business.placeId !== null && seen.phone !== null) await lockReviewsOfPlace(tx, business.placeId, seen.phone);

    const review = (await tx.select(columns).from(directoryReviews).where(hiddenReview).for("update"))[0];
    // Published again while this waited for the lock: by a confirm from the same number, or another restore.
    if (review === undefined) return false;
    // The lock taken must still be this review's business and number. A hidden review is only ever given the place
    // its key already names (the backfill), so this does not happen; if it ever did, restoring under the wrong lock
    // could let a confirm publish a second review alongside it, so nothing is restored and staff can try again.
    const locked = await storedBusiness(tx, "directory_reviews", review);
    if (locked.placeId !== business.placeId || review.phone !== seen.phone) return false;
    if (business.placeId !== null && review.phone !== null) {
      await hideNumbersOtherReviewsOfPlace(tx, { placeId: business.placeId, phone: review.phone, keepReviewId: input.reviewId, now: input.now });
    }
    await tx
      .update(directoryReviews)
      // A review written by key before the backfill becomes its place's as it is published again.
      .set({ status: "published", hiddenAt: null, hiddenByUserId: null, updatedAt: input.now, placeId: business.placeId })
      .where(eq(directoryReviews.id, input.reviewId));
    return true;
  });
}

export interface StaffDirectoryEnquiry {
  readonly id: string;
  readonly kind: DirectoryEnquiryKind;
  /** The address the enquiry came by; null for a top-list request, or one sent by place id. */
  readonly listingKey: string | null;
  /** The business's permanent id; null for a top-list request, or a key no place has. */
  readonly placeId: string | null;
  readonly businessName: string | null;
  readonly serviceLabel: string;
  readonly areaLabel: string;
  readonly name: string;
  /** Null once the sender erased their data. */
  readonly phone: string | null;
  readonly message: string | null;
  readonly status: DirectoryEnquiryStatus;
  readonly handledAt: Date | null;
  readonly createdAt: Date;
}

export interface StaffDirectoryEnquiryPage {
  readonly rows: readonly StaffDirectoryEnquiry[];
  readonly total: number;
}

/** Enquiries with `status` for the staff console, newest first. */
export async function listDirectoryEnquiriesForStaff(
  db: Database,
  input: StaffPageInput & { readonly status: DirectoryEnquiryStatus },
): Promise<StaffDirectoryEnquiryPage> {
  assertPage(input);
  const where = eq(directoryEnquiries.status, input.status);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: directoryEnquiries.id,
        kind: directoryEnquiries.kind,
        listingKey: directoryEnquiries.listingKey,
        placeId: directoryEnquiries.placeId,
        businessName: directoryEnquiries.businessName,
        serviceLabel: directoryEnquiries.serviceLabel,
        areaLabel: directoryEnquiries.areaLabel,
        name: directoryEnquiries.name,
        phone: directoryEnquiries.phone,
        message: directoryEnquiries.message,
        status: directoryEnquiries.status,
        handledAt: directoryEnquiries.handledAt,
        createdAt: directoryEnquiries.createdAt,
      })
      .from(directoryEnquiries)
      .where(where)
      .orderBy(desc(directoryEnquiries.createdAt), desc(directoryEnquiries.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(directoryEnquiries).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export interface DirectoryEnquiryCounts {
  readonly new: number;
  readonly handled: number;
}

export async function countDirectoryEnquiries(db: Database): Promise<DirectoryEnquiryCounts> {
  const rows = await db
    .select({
      new: sql<number>`count(*) filter (where ${directoryEnquiries.status} = 'new')::int`,
      handled: sql<number>`count(*) filter (where ${directoryEnquiries.status} = 'handled')::int`,
    })
    .from(directoryEnquiries);
  return { new: rows[0]?.new ?? 0, handled: rows[0]?.handled ?? 0 };
}

/** Marks a new enquiry handled by `staffUserId`. False when the id names no new enquiry (already handled, or none). */
export async function markDirectoryEnquiryHandled(
  db: Database,
  input: { readonly enquiryId: string; readonly staffUserId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.enquiryId)) return false;
  const rows = await db
    .update(directoryEnquiries)
    .set({ status: "handled", handledAt: input.now, handledByUserId: input.staffUserId })
    .where(and(eq(directoryEnquiries.id, input.enquiryId), eq(directoryEnquiries.status, "new")))
    .returning({ id: directoryEnquiries.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Verified businesses
// ---------------------------------------------------------------------------------------------------------------

/** The most businesses readDirectoryStatuses accepts in one call (the contract's MAX_RATING_KEYS, as for ratings). */
export const MAX_DIRECTORY_STATUS_KEYS = MAX_DIRECTORY_RATING_KEYS;

/** Thrown when a caller asks about more businesses than one status read allows. */
export class TooManyStatusKeysError extends Error {
  constructor(received: number) {
    super(`At most ${MAX_DIRECTORY_STATUS_KEYS} directory businesses can be read at once, received ${received}.`);
    this.name = "TooManyStatusKeysError";
  }
}

/** The columns a verifications read matches businesses on. */
const VERIFICATION_BUSINESS = { placeId: directoryVerifications.placeId, listingKey: directoryVerifications.listingKey } as const;

export interface DirectoryListingStatus {
  readonly verifiedAt: Date;
  /** E.164, or null when the business asked for its number not to be shown. */
  readonly phone: string | null;
  /** Whether staff granted the Trusted tag by hand (a licence on the profile earns it on the website without this). */
  readonly trusted: boolean;
}

/**
 * The verification of each business in `lookup` that is verified, in ONE statement, keyed by place id, or by listing
 * key for a key no place has. Businesses that are not verified are absent. Duplicates are harmless.
 */
export async function readDirectoryStatuses(
  db: Database,
  lookup: DirectoryLookup,
): Promise<ReadonlyMap<string, DirectoryListingStatus>> {
  const size = directoryLookupSize(lookup);
  if (size > MAX_DIRECTORY_STATUS_KEYS) throw new TooManyStatusKeysError(size);
  if (isEmptyDirectoryLookup(lookup)) return new Map();

  const rows = await db
    .select({
      business: directoryBusinessOf(VERIFICATION_BUSINESS),
      verifiedAt: directoryVerifications.verifiedAt,
      phone: directoryVerifications.phone,
      trusted: directoryVerifications.trusted,
    })
    .from(directoryVerifications)
    .where(matchesDirectoryLookup(VERIFICATION_BUSINESS, lookup))
    // A place verified both by id and, before the backfill, at a key: the latest verification is the one shown.
    .orderBy(directoryVerifications.verifiedAt);
  return new Map(rows.map((row) => [row.business, { verifiedAt: row.verifiedAt, phone: row.phone, trusted: row.trusted }]));
}

export interface StaffDirectoryVerification {
  readonly listingKey: string;
  /** The business's permanent id; null for a key no place has. */
  readonly placeId: string | null;
  readonly businessName: string;
  readonly phone: string | null;
  readonly verifiedAt: Date;
  /** The staff member who verified it last. */
  readonly verifiedByName: string;
  /** Whether staff granted the Trusted tag by hand. */
  readonly trusted: boolean;
}

export interface StaffDirectoryVerificationPage {
  readonly rows: readonly StaffDirectoryVerification[];
  /** Rows matching the search, for paging. */
  readonly total: number;
}

/** `term` as an ILIKE pattern matching it anywhere, with its own wildcards escaped. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * Verified businesses for the staff console, most recently verified first, optionally only those whose name contains
 * `search` (case-insensitive; a blank search lists them all).
 */
export async function listDirectoryVerifications(
  db: Database,
  input: StaffPageInput & { readonly search: string },
): Promise<StaffDirectoryVerificationPage> {
  assertPage(input);
  const search = input.search.trim();
  const where = search === "" ? undefined : sql`${directoryVerifications.businessName} ilike ${likeContains(search)}`;
  const [rows, totals] = await Promise.all([
    db
      .select({
        listingKey: directoryVerifications.listingKey,
        placeId: directoryVerifications.placeId,
        businessName: directoryVerifications.businessName,
        phone: directoryVerifications.phone,
        verifiedAt: directoryVerifications.verifiedAt,
        verifiedByName: users.name,
        trusted: directoryVerifications.trusted,
      })
      .from(directoryVerifications)
      .innerJoin(users, eq(users.id, directoryVerifications.verifiedByUserId))
      .where(where)
      .orderBy(desc(directoryVerifications.verifiedAt), directoryVerifications.listingKey)
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(directoryVerifications).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export async function countDirectoryVerifications(db: Database): Promise<number> {
  const rows = await db.select({ total: count() }).from(directoryVerifications);
  return rows[0]?.total ?? 0;
}

/** How many verified businesses staff have granted the Trusted tag. */
export async function countDirectoryTrusted(db: Database): Promise<number> {
  const rows = await db.select({ total: count() }).from(directoryVerifications).where(eq(directoryVerifications.trusted, true));
  return rows[0]?.total ?? 0;
}

export interface UpsertDirectoryVerificationInput {
  readonly listingKey: string;
  readonly businessName: string;
  /** E.164, or null to show no number. */
  readonly phone: string | null;
  /**
   * Whether to give (true) or take away (false) the Trusted tag. Leave it out to keep what the business has: a new
   * verification starts untrusted, and verifying again, as the owner can for their own listing, never strips a tag
   * staff granted.
   */
  readonly trusted?: boolean;
  readonly staffUserId: string;
  readonly now: Date;
}

/**
 * Verifies a business, or verifies it again: an existing verification of the same business (the same place, whichever
 * of its addresses staff gave or a verification made at one of them before the backfill; the same key for a key no
 * place has) takes the new name and phone and is dated now, by `staffUserId`, since that is when the details were last
 * confirmed. It keeps the address it was first made at, and takes the place. Returns whether the business was already
 * verified. Two staff verifying one place at once queue on a lock. Staff connection: the place registry is staff-only.
 */
export async function upsertDirectoryVerification(
  db: Database,
  input: UpsertDirectoryVerificationInput,
): Promise<{ readonly replaced: boolean }> {
  const details = {
    businessName: input.businessName,
    phone: input.phone,
    verifiedAt: input.now,
    verifiedByUserId: input.staffUserId,
    updatedAt: input.now,
    ...(input.trusted === undefined ? {} : { trusted: input.trusted }),
  };
  return db.transaction(async (tx) => {
    const business = await resolveListingKey(tx, input.listingKey);
    if (business.placeId === null) {
      const rows = await tx
        .insert(directoryVerifications)
        .values({ listingKey: input.listingKey, ...details })
        .onConflictDoUpdate({ target: directoryVerifications.listingKey, set: details })
        // xmax is 0 on a freshly inserted row version and the updating transaction's id on one ON CONFLICT updated.
        .returning({ replaced: sql<boolean>`not (xmax = 0)` });
      const row = rows[0];
      if (row === undefined) throw new Error("Directory verification upsert returned no row");
      return { replaced: row.replaced };
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`directory-verification:${business.placeId}`}, 0))`);
    const existing = await tx
      .select({ listingKey: directoryVerifications.listingKey })
      .from(directoryVerifications)
      .where(matchesDirectoryRef(VERIFICATION_BUSINESS, business))
      .orderBy(sql`${directoryVerifications.placeId} is null`, desc(directoryVerifications.verifiedAt))
      .limit(1)
      .for("update");
    const kept = existing[0];
    if (kept !== undefined) {
      await tx
        .update(directoryVerifications)
        .set({ ...details, placeId: business.placeId })
        .where(eq(directoryVerifications.listingKey, kept.listingKey));
      return { replaced: true };
    }
    await tx.insert(directoryVerifications).values({ listingKey: input.listingKey, placeId: business.placeId, ...details });
    return { replaced: false };
  });
}

/**
 * Gives or takes away the Trusted tag on a verified business. `listingKey` is any address of the business: its place is
 * found from it, so the row is changed whichever address it was first verified at. It does not touch when the details
 * were confirmed. False when nothing changed: the business is not verified, or already has (or lacks) the tag, so a
 * double click or a colleague's earlier click reads as "unchanged".
 */
export async function setDirectoryTrusted(db: Database, listingKey: string, trusted: boolean, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const business = await resolveListingKey(tx, listingKey);
    const rows = await tx
      .update(directoryVerifications)
      .set({ trusted, updatedAt: now })
      .where(and(matchesDirectoryRef(VERIFICATION_BUSINESS, business), ne(directoryVerifications.trusted, trusted)))
      .returning({ listingKey: directoryVerifications.listingKey });
    return rows.length > 0;
  });
}

/**
 * Gives a business the Trusted tag, verifying it first when it is not verified yet (a Trusted business is always a
 * verified one). Already verified: only the tag is added, and the details and date are left as they were. Returns
 * whether anything changed: false when it already had the tag.
 */
export async function trustDirectoryBusiness(db: Database, input: UpsertDirectoryVerificationInput): Promise<boolean> {
  if (await setDirectoryTrusted(db, input.listingKey, true, input.now)) return true;
  const business = await resolveListingKey(db, input.listingKey);
  const existing = await db
    .select({ listingKey: directoryVerifications.listingKey })
    .from(directoryVerifications)
    .where(matchesDirectoryRef(VERIFICATION_BUSINESS, business))
    .limit(1);
  if (existing.length > 0) return false;
  await upsertDirectoryVerification(db, { ...input, trusted: true });
  return true;
}

/**
 * Removes a business's verification: the website stops showing the Verified tag and its number, and the Trusted tag
 * staff granted goes with it. By the listing key the staff console lists it under (a verification is always made at
 * one, see upsertDirectoryVerification), so exactly that row goes. False when the listing was not verified (already
 * removed, or never).
 */
export async function removeDirectoryVerification(db: Database, listingKey: string): Promise<boolean> {
  const rows = await db
    .delete(directoryVerifications)
    .where(eq(directoryVerifications.listingKey, listingKey))
    .returning({ listingKey: directoryVerifications.listingKey });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Listing signals: Trending
// ---------------------------------------------------------------------------------------------------------------

/** Trending's rule. Must match TRENDING_MIN_SCORE, TRENDING_MIN_GROWTH and TRENDING_CONTACT_WEIGHT in the contract
 * (apps/platform/lib/directory-api.ts); apps/platform/lib/directory-parity.test.ts checks. */
export const DIRECTORY_TRENDING_MIN_SCORE = 20;
export const DIRECTORY_TRENDING_MIN_GROWTH = 1.5;
export const DIRECTORY_TRENDING_CONTACT_WEIGHT = 3;
/** The most businesses readDirectorySignals accepts in one call (the contract's MAX_RATING_KEYS, as for ratings). */
export const MAX_DIRECTORY_SIGNAL_KEYS = MAX_DIRECTORY_RATING_KEYS;
/** Days of counts kept: Trending looks back 14, so this leaves room to spare and nothing older is ever read. */
export const DIRECTORY_DAILY_COUNT_RETENTION_DAYS = 60;

/** Trending compares this many days, today included, with the same number just before them. */
const TRENDING_WINDOW_DAYS = 7;
const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Thrown when a caller asks about more businesses than one signals read allows. */
export class TooManySignalKeysError extends Error {
  constructor(received: number) {
    super(`At most ${MAX_DIRECTORY_SIGNAL_KEYS} directory businesses can be read at once, received ${received}.`);
    this.name = "TooManySignalKeysError";
  }
}

/** A calendar day as `YYYY-MM-DD` that is a real date, or a RangeError: the day is bound into date arithmetic. */
function assertCalendarDay(day: string): void {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!CALENDAR_DAY_PATTERN.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new RangeError(`A day must be a real date written YYYY-MM-DD, received ${JSON.stringify(day)}`);
  }
}

export interface DirectoryDailyCountInput {
  /** The business visited: a place (already checked to exist) or a key no place has. */
  readonly business: DirectoryRef;
  readonly kind: DirectoryEventKind;
  /** The Asia/Kolkata calendar day, `YYYY-MM-DD`. */
  readonly day: string;
}

/**
 * Counts one more visitor doing `kind` on a business on `day`, in one atomic upsert; returns the new count of that
 * counter. A place has one counter per day and kind, whichever address or id the visits came by (a counter written by
 * a legacy key before the backfill is read with it, and merged into it by the backfill); a key no place has keeps its
 * own.
 */
export async function incrementDirectoryDailyCount(db: Database, input: DirectoryDailyCountInput): Promise<number> {
  assertCalendarDay(input.day);
  const { business } = input;
  // A place's counter carries no listing key: visits by different keys of one place on the same first moment of the
  // day would otherwise insert rows that meet on two unique constraints at once, and ON CONFLICT can only settle one.
  const insert = db.insert(directoryDailyCounts).values({
    listingKey: business.placeId === null ? business.listingKey : null,
    placeId: business.placeId,
    day: input.day,
    kind: input.kind,
    count: 1,
  });
  const increment = { count: sql`${directoryDailyCounts.count} + 1` };
  const rows = await (
    business.placeId === null
      ? insert.onConflictDoUpdate({
          target: [directoryDailyCounts.listingKey, directoryDailyCounts.day, directoryDailyCounts.kind],
          set: increment,
        })
      : insert.onConflictDoUpdate({
          target: [directoryDailyCounts.placeId, directoryDailyCounts.day, directoryDailyCounts.kind],
          targetWhere: sql`${directoryDailyCounts.placeId} is not null`,
          set: increment,
        })
  ).returning({ count: directoryDailyCounts.count });
  const row = rows[0];
  if (row === undefined) throw new Error("Directory daily count upsert returned no row");
  return row.count;
}

export interface DirectorySignal {
  /** Views plus DIRECTORY_TRENDING_CONTACT_WEIGHT times contact taps, over the 7 days ending today. */
  readonly score: number;
  /** The same score over the 7 days before those. */
  readonly previousScore: number;
  readonly trending: boolean;
}

/**
 * Trending: enough interest this week, and clearly more than last week -- unless last week had none, when enough is
 * enough (a business nobody looked at before cannot grow by a ratio).
 */
export function isDirectoryTrending(score: number, previousScore: number): boolean {
  if (score < DIRECTORY_TRENDING_MIN_SCORE) return false;
  return previousScore === 0 || score >= previousScore * DIRECTORY_TRENDING_MIN_GROWTH;
}

interface SignalRow extends Record<string, unknown> {
  /** The place id, or the listing key of a count with no place. */
  readonly business: string;
  readonly score: string | number;
  readonly previous_score: string | number;
}

/**
 * The interest scores of each business in `lookup` counted in the 14 days ending `today` (an Asia/Kolkata
 * `YYYY-MM-DD`), with whether it is trending, in ONE grouped statement, keyed by place id, or by listing key for a key
 * no place has. Businesses with no counts in those 14 days are absent. Duplicates are harmless.
 */
export async function readDirectorySignals(
  db: Database,
  lookup: DirectoryLookup,
  today: string,
): Promise<ReadonlyMap<string, DirectorySignal>> {
  const size = directoryLookupSize(lookup);
  if (size > MAX_DIRECTORY_SIGNAL_KEYS) throw new TooManySignalKeysError(size);
  assertCalendarDay(today);
  if (isEmptyDirectoryLookup(lookup)) return new Map();

  // Shares are for the ranking (readDirectoryShareCounts), not for Trending.
  const weighted = sql`case when ${directoryDailyCounts.kind} = 'view' then ${directoryDailyCounts.count}
    else ${directoryDailyCounts.count} * ${DIRECTORY_TRENDING_CONTACT_WEIGHT}::int end`;
  const windowStart = sql`${today}::date - ${TRENDING_WINDOW_DAYS - 1}::int`;
  const result = await db.execute<SignalRow>(sql`
    select ${directoryBusinessOf({ placeId: directoryDailyCounts.placeId, listingKey: directoryDailyCounts.listingKey })} as business,
      coalesce(sum(${weighted}) filter (where ${directoryDailyCounts.day} >= ${windowStart}), 0)::int8 as score,
      coalesce(sum(${weighted}) filter (where ${directoryDailyCounts.day} < ${windowStart}), 0)::int8 as previous_score
    from ${directoryDailyCounts}
    where ${matchesDirectoryLookup({ placeId: directoryDailyCounts.placeId, listingKey: directoryDailyCounts.listingKey }, lookup)}
      and ${directoryDailyCounts.day} >= ${today}::date - ${2 * TRENDING_WINDOW_DAYS - 1}::int
      and ${directoryDailyCounts.day} <= ${today}::date
      and ${directoryDailyCounts.kind} <> 'share'
    group by 1
  `);

  const signals = new Map<string, DirectorySignal>();
  for (const row of result.rows) {
    const score = Number(row.score);
    const previousScore = Number(row.previous_score);
    signals.set(row.business, { score, previousScore, trending: isDirectoryTrending(score, previousScore) });
  }
  return signals;
}

interface ShareRow extends Record<string, unknown> {
  /** The place id, or the listing key of a count with no place. */
  readonly business: string;
  readonly shares: string | number;
}

/**
 * How many times each business in `lookup` has been shared, ever (share counts are not purged), keyed by place id, or
 * by listing key for a key no place has. A business never shared is absent. Duplicates are harmless.
 */
export async function readDirectoryShareCounts(db: Database, lookup: DirectoryLookup): Promise<ReadonlyMap<string, number>> {
  const size = directoryLookupSize(lookup);
  if (size > MAX_DIRECTORY_SIGNAL_KEYS) throw new TooManySignalKeysError(size);
  if (isEmptyDirectoryLookup(lookup)) return new Map();

  const result = await db.execute<ShareRow>(sql`
    select ${directoryBusinessOf({ placeId: directoryDailyCounts.placeId, listingKey: directoryDailyCounts.listingKey })} as business,
      sum(${directoryDailyCounts.count})::int8 as shares
    from ${directoryDailyCounts}
    where ${matchesDirectoryLookup({ placeId: directoryDailyCounts.placeId, listingKey: directoryDailyCounts.listingKey }, lookup)}
      and ${directoryDailyCounts.kind} = 'share'
    group by 1
  `);
  return new Map(result.rows.map((row) => [row.business, Number(row.shares)]));
}

/**
 * Deletes counts more than DIRECTORY_DAILY_COUNT_RETENTION_DAYS days before `today`; returns how many rows went. Share
 * counts are kept: the ranking counts every share a profile ever had.
 */
export async function purgeOldDirectoryDailyCounts(db: Database, today: string): Promise<number> {
  assertCalendarDay(today);
  const rows = await db
    .delete(directoryDailyCounts)
    .where(
      and(
        lt(directoryDailyCounts.day, sql`${today}::date - ${DIRECTORY_DAILY_COUNT_RETENTION_DAYS}::int`),
        ne(directoryDailyCounts.kind, "share"),
      ),
    )
    .returning({ day: directoryDailyCounts.day });
  return rows.length;
}
