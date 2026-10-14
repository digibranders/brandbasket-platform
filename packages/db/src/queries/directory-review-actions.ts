import { and, count, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ContributionConsent } from "./consent-records";
import {
  directoryReviewComments,
  directoryReviewOtps,
  directoryReviews,
  type DirectoryCommentAuthor,
  type DirectoryReviewStatus,
} from "../schema";
import { isUuid } from "./tenant";
import { reviewerDisplayName, type DirectoryReviewOtpAttemptInput } from "./directory";

/**
 * What a visitor can do with a published directory review besides read it: mark it Helpful, or comment on it
 * (docs/superpowers/specs/2026-10-08-directory-review-actions-design.md). Every function here runs on the staff
 * connection: the platform's /api/directory/reviews/helpful and /comments/* routes (called by the marketing website's
 * server) and the staff console. None of it is tenant-scoped, because a directory listing is not a platform business.
 *
 * Validation of what a visitor typed (lengths, the phone number) happens in the platform before anything reaches here;
 * the table CHECKs (0108) are the backstop.
 */

/** The most comments a review shows; the rest are only counted. Must match COMMENTS_SHOWN_PER_REVIEW in apps/platform/lib/directory-api.ts. */
export const DIRECTORY_COMMENTS_SHOWN_PER_REVIEW = 20;

// ---------------------------------------------------------------------------------------------------------------
// Helpful
// ---------------------------------------------------------------------------------------------------------------

/**
 * Adds one to a published review's Helpful count and returns the new count, or null when the id names no published
 * review (hidden, unknown, or not a UUID). The caller has already decided this visitor may count once.
 */
export async function incrementDirectoryReviewHelpful(db: Database, reviewId: string): Promise<number | null> {
  if (!isUuid(reviewId)) return null;
  const rows = await db
    .update(directoryReviews)
    .set({ helpfulCount: sql`${directoryReviews.helpfulCount} + 1` })
    .where(and(eq(directoryReviews.id, reviewId), eq(directoryReviews.status, "published")))
    .returning({ helpfulCount: directoryReviews.helpfulCount });
  return rows[0]?.helpfulCount ?? null;
}

/** A published review's Helpful count, or null when the id names no published review. */
export async function readDirectoryReviewHelpful(db: Database, reviewId: string): Promise<number | null> {
  if (!isUuid(reviewId)) return null;
  const rows = await db
    .select({ helpfulCount: directoryReviews.helpfulCount })
    .from(directoryReviews)
    .where(and(eq(directoryReviews.id, reviewId), eq(directoryReviews.status, "published")))
    .limit(1);
  return rows[0]?.helpfulCount ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Comments, public reads
// ---------------------------------------------------------------------------------------------------------------

export interface PublicDirectoryComment {
  readonly id: string;
  /** reviewerDisplayName of the commenter's name: the full name and the phone never leave this module publicly. */
  readonly displayName: string;
  readonly text: string;
  readonly createdAt: Date;
  /** The business's own verified owner answering; `displayName` is then the business's name. */
  readonly byOwner: boolean;
  /** An owner changed what they wrote after posting it. */
  readonly edited: boolean;
}

export interface DirectoryReviewComments {
  /** Every published comment on the review. */
  readonly total: number;
  /** The latest DIRECTORY_COMMENTS_SHOWN_PER_REVIEW, oldest first, so they read as a conversation. */
  readonly comments: readonly PublicDirectoryComment[];
}

interface CommentRow extends Record<string, unknown> {
  readonly id: string;
  readonly review_id: string;
  readonly commenter_name: string;
  readonly author_kind: "visitor" | "owner";
  readonly business_name: string;
  readonly text: string;
  readonly created_at: Date | string;
  readonly edited_at: Date | string | null;
  readonly total: number;
}

/**
 * The published comments on each of `reviewIds` (a page of reviews), in one statement: each review's latest few, oldest
 * first, with how many it has in all. A review with none is absent.
 */
export async function readDirectoryReviewComments(
  db: Database,
  reviewIds: readonly string[],
): Promise<ReadonlyMap<string, DirectoryReviewComments>> {
  const ids = reviewIds.filter(isUuid);
  const byReview = new Map<string, { total: number; comments: PublicDirectoryComment[] }>();
  if (ids.length === 0) return byReview;

  const result = await db.execute<CommentRow>(sql`
    select id, review_id, commenter_name, author_kind, business_name, text, created_at, edited_at, total
    from (
      select c.id, c.review_id, c.commenter_name, c.author_kind, r.business_name, c.text, c.created_at, c.edited_at,
        row_number() over (partition by c.review_id order by c.created_at desc, c.id desc) as position,
        count(*) over (partition by c.review_id)::int as total
      from ${directoryReviewComments} c
      join ${directoryReviews} r on r.id = c.review_id
      where c.status = 'published' and c.review_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
    ) ranked
    where position <= ${DIRECTORY_COMMENTS_SHOWN_PER_REVIEW}
    order by review_id, created_at, id
  `);
  for (const row of result.rows) {
    const entry = byReview.get(row.review_id) ?? { total: Number(row.total), comments: [] };
    entry.comments.push({
      id: row.id,
      // An owner's answer is signed with the business's name: the account behind it stays with staff.
      displayName: row.author_kind === "owner" ? row.business_name : reviewerDisplayName(row.commenter_name),
      text: row.text,
      createdAt: new Date(row.created_at),
      byOwner: row.author_kind === "owner",
      edited: row.edited_at !== null,
    });
    byReview.set(row.review_id, entry);
  }
  return byReview;
}

// ---------------------------------------------------------------------------------------------------------------
// Comment codes
// ---------------------------------------------------------------------------------------------------------------

/** The comment waiting on its code. Opaque jsonb to Postgres, so the directory_review_comments CHECKs are what hold it to
 * shape once it is published. */
export interface DirectoryCommentOtpPayload {
  readonly commenterName: string;
  readonly text: string;
  /** What the commenter agreed to on the form, kept to record once the code is confirmed. Absent from a held comment made before it existed. */
  readonly consent?: ContributionConsent;
}

/** The review a comment is about: just what its code row needs to name the same business. */
export interface DirectoryCommentTarget {
  readonly id: string;
  readonly listingKey: string | null;
  readonly placeId: string | null;
}

/** A published review by id, or null when there is none (hidden, unknown, or not a UUID). */
export async function findPublishedDirectoryReviewForComment(db: Database, reviewId: string): Promise<DirectoryCommentTarget | null> {
  if (!isUuid(reviewId)) return null;
  const rows = await db
    .select({ id: directoryReviews.id, listingKey: directoryReviews.listingKey, placeId: directoryReviews.placeId })
    .from(directoryReviews)
    .where(and(eq(directoryReviews.id, reviewId), eq(directoryReviews.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewDirectoryCommentOtp {
  /** Supplied by the caller because the code's hash is salted with it before the insert (see hashOtpCode). */
  readonly id: string;
  readonly review: DirectoryCommentTarget;
  readonly phone: string;
  readonly codeHash: string;
  readonly payload: DirectoryCommentOtpPayload;
  readonly expiresAt: Date;
}

/** Stores the comment with its hashed code. The row carries the review's own business, which the table requires. */
export async function createDirectoryCommentOtp(db: Database, input: NewDirectoryCommentOtp): Promise<void> {
  await db.insert(directoryReviewOtps).values({
    id: input.id,
    reviewId: input.review.id,
    listingKey: input.review.listingKey,
    placeId: input.review.placeId,
    phone: input.phone,
    codeHash: input.codeHash,
    payload: input.payload,
    expiresAt: input.expiresAt,
  });
}

export interface PublishedDirectoryComment {
  readonly commentId: string;
  readonly reviewId: string;
}

/**
 * Verifies the code and publishes the comment it was holding, as one transaction: marks the code verified (only if it is
 * a comment's, unverified, unexpired and within `maxAttempts`, so a double submit, a confirm after expiry or a review's
 * code publishes nothing), adds the comment, and deletes the code. Null when nothing was published, including when the
 * review was hidden since the code was asked for. The caller must already have claimed an attempt and matched the code.
 */
export async function publishDirectoryCommentFromOtp(
  db: Database,
  input: DirectoryReviewOtpAttemptInput,
): Promise<PublishedDirectoryComment | null> {
  if (!isUuid(input.otpId)) return null;
  return db.transaction(async (tx) => {
    const verified = await tx
      .update(directoryReviewOtps)
      .set({ verifiedAt: input.now })
      .where(
        and(
          eq(directoryReviewOtps.id, input.otpId),
          isNotNull(directoryReviewOtps.reviewId),
          isNull(directoryReviewOtps.verifiedAt),
          gt(directoryReviewOtps.expiresAt, input.now),
          sql`${directoryReviewOtps.attempts} <= ${input.maxAttempts}`,
        ),
      )
      .returning({ reviewId: directoryReviewOtps.reviewId, phone: directoryReviewOtps.phone, payload: directoryReviewOtps.payload });
    const otp = verified[0];
    if (otp === undefined || otp.reviewId === null) return null;

    const reviews = await tx
      .select({ id: directoryReviews.id })
      .from(directoryReviews)
      .where(and(eq(directoryReviews.id, otp.reviewId), eq(directoryReviews.status, "published")))
      .for("share");
    if (reviews[0] === undefined) {
      await tx.delete(directoryReviewOtps).where(eq(directoryReviewOtps.id, input.otpId));
      return null;
    }

    const payload = otp.payload as DirectoryCommentOtpPayload;
    const inserted = await tx
      .insert(directoryReviewComments)
      .values({ reviewId: otp.reviewId, commenterName: payload.commenterName, phone: otp.phone, text: payload.text, createdAt: input.now })
      .returning({ id: directoryReviewComments.id });
    const comment = inserted[0];
    if (comment === undefined) throw new Error("Directory review comment insert returned no row");

    await tx.delete(directoryReviewOtps).where(eq(directoryReviewOtps.id, input.otpId));
    return { commentId: comment.id, reviewId: otp.reviewId };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Staff console
// ---------------------------------------------------------------------------------------------------------------

export interface StaffDirectoryComment {
  readonly id: string;
  readonly reviewId: string;
  readonly businessName: string;
  /** The full name of whoever wrote the review, for staff only. */
  readonly reviewerName: string;
  /** What the review says, so the comment is read in its context. */
  readonly reviewText: string | null;
  /** The full name, for staff only (an owner's account name). */
  readonly commenterName: string;
  readonly authorKind: DirectoryCommentAuthor;
  /** The visitor's number; null for the business's own owner, who is signed in rather than texted a code. */
  readonly phone: string | null;
  readonly text: string;
  readonly status: DirectoryReviewStatus;
  readonly hiddenAt: Date | null;
  readonly createdAt: Date;
}

export type DirectoryCommentFilter = DirectoryReviewStatus | "all";

export interface StaffDirectoryCommentPage {
  readonly rows: readonly StaffDirectoryComment[];
  /** Rows matching the filter, for paging. */
  readonly total: number;
}

/** Comments for the staff console, newest first, optionally only published or only hidden ones. */
export async function listDirectoryCommentsForStaff(
  db: Database,
  input: { readonly status: DirectoryCommentFilter; readonly limit: number; readonly offset: number },
): Promise<StaffDirectoryCommentPage> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new RangeError(`Limit must be a positive whole number, received ${input.limit}`);
  if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new RangeError(`Offset must be a whole number from 0, received ${input.offset}`);
  const where = input.status === "all" ? undefined : eq(directoryReviewComments.status, input.status);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: directoryReviewComments.id,
        reviewId: directoryReviewComments.reviewId,
        businessName: directoryReviews.businessName,
        reviewerName: directoryReviews.reviewerName,
        reviewText: directoryReviews.text,
        commenterName: directoryReviewComments.commenterName,
        authorKind: directoryReviewComments.authorKind,
        phone: directoryReviewComments.phone,
        text: directoryReviewComments.text,
        status: directoryReviewComments.status,
        hiddenAt: directoryReviewComments.hiddenAt,
        createdAt: directoryReviewComments.createdAt,
      })
      .from(directoryReviewComments)
      .innerJoin(directoryReviews, eq(directoryReviews.id, directoryReviewComments.reviewId))
      .where(where)
      .orderBy(desc(directoryReviewComments.createdAt), desc(directoryReviewComments.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(directoryReviewComments).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export interface DirectoryCommentCounts {
  readonly published: number;
  readonly hidden: number;
}

export async function countDirectoryComments(db: Database): Promise<DirectoryCommentCounts> {
  const rows = await db
    .select({
      published: sql<number>`count(*) filter (where ${directoryReviewComments.status} = 'published')::int`,
      hidden: sql<number>`count(*) filter (where ${directoryReviewComments.status} = 'hidden')::int`,
    })
    .from(directoryReviewComments);
  return { published: rows[0]?.published ?? 0, hidden: rows[0]?.hidden ?? 0 };
}

/** Hides a published comment: it stops showing. False when the id names no published comment (already hidden, or none). */
export async function hideDirectoryComment(
  db: Database,
  input: { readonly commentId: string; readonly staffUserId: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.commentId)) return false;
  const rows = await db
    .update(directoryReviewComments)
    .set({ status: "hidden", hiddenAt: input.now, hiddenByUserId: input.staffUserId })
    .where(and(eq(directoryReviewComments.id, input.commentId), eq(directoryReviewComments.status, "published")))
    .returning({ id: directoryReviewComments.id });
  return rows.length > 0;
}

/** Publishes a hidden comment again. False when the id names no hidden comment. */
export async function restoreDirectoryComment(db: Database, commentId: string): Promise<boolean> {
  if (!isUuid(commentId)) return false;
  const rows = await db
    .update(directoryReviewComments)
    .set({ status: "published", hiddenAt: null, hiddenByUserId: null })
    .where(and(eq(directoryReviewComments.id, commentId), eq(directoryReviewComments.status, "hidden")))
    .returning({ id: directoryReviewComments.id });
  return rows.length > 0;
}
