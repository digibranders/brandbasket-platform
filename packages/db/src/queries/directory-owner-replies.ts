import { and, asc, count, desc, eq, exists, inArray, not, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { directoryReviewComments, directoryReviews } from "../schema";
import { reviewerDisplayName } from "./directory";
import { matchesDirectoryRef, type DirectoryRef } from "./directory-refs";
import { isUuid } from "./tenant";

/**
 * A business's verified owner answering the reviews and comments on its page in the directory
 * (docs/superpowers/specs/2026-10-12-directory-owner-replies-design.md). An answer is a comment whose `author_kind` is
 * `owner`: it shares the visitors' comments table, so it reads in the same list and staff moderate it the same way.
 *
 * Every function runs on the staff connection, for a business the caller has already proved the signed-in user owns
 * (an approved claim or the website client's own listing, as the Leads page does). The ownership is passed in as
 * `business` and every statement here is held to it: an owner can only answer reviews of that business, and can only
 * change answers under them. A visitor's review or comment is never touched. The text is validated by the platform
 * before it gets here; the table's CHECKs (0133) are the backstop.
 */

/** The longest account name a comment row keeps (directory_review_comments_commenter_name_check). */
const OWNER_NAME_MAX = 60;
/** What a nameless account is called in the staff console. */
const FALLBACK_OWNER_NAME = "Owner";

export interface OwnerIdentity {
  readonly userId: string;
  /** The account's name, kept for staff only: publicly an answer is signed with the business's name. */
  readonly name: string;
}

function staffOwnerName(name: string): string {
  const trimmed = Array.from(name.trim()).slice(0, OWNER_NAME_MAX).join("").trim();
  return trimmed === "" ? FALLBACK_OWNER_NAME : trimmed;
}

/** The reviews of `business`, as a statement fragment: a review's own place or listing key, whichever it was written under. */
function reviewOfBusiness(business: DirectoryRef): SQL {
  return matchesDirectoryRef({ placeId: directoryReviews.placeId, listingKey: directoryReviews.listingKey }, business);
}

/** Published reviews of `business` that no published owner answer sits under yet. */
function awaitingAnswer(): SQL {
  return not(
    exists(
      sql`(select 1 from ${directoryReviewComments} oc where oc.review_id = ${directoryReviews.id} and oc.author_kind = 'owner' and oc.status = 'published')`,
    ),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------

export interface NewOwnerReply {
  readonly business: DirectoryRef;
  readonly reviewId: string;
  readonly owner: OwnerIdentity;
  readonly text: string;
  readonly now: Date;
}

/**
 * Posts the owner's answer under a published review of `business`. Null when the id names no such review (unknown,
 * hidden, of another business, or not a UUID): an owner cannot reach a business that is not theirs, and says nothing
 * different about one that does not exist.
 */
export async function postOwnerReply(db: Database, input: NewOwnerReply): Promise<{ readonly commentId: string } | null> {
  if (!isUuid(input.reviewId)) return null;
  return db.transaction(async (tx) => {
    const reviews = await tx
      .select({ id: directoryReviews.id })
      .from(directoryReviews)
      .where(and(eq(directoryReviews.id, input.reviewId), eq(directoryReviews.status, "published"), reviewOfBusiness(input.business)))
      .for("share");
    if (reviews[0] === undefined) return null;

    const inserted = await tx
      .insert(directoryReviewComments)
      .values({
        reviewId: input.reviewId,
        authorKind: "owner",
        ownerUserId: input.owner.userId,
        commenterName: staffOwnerName(input.owner.name),
        text: input.text,
        createdAt: input.now,
      })
      .returning({ id: directoryReviewComments.id });
    const row = inserted[0];
    if (row === undefined) throw new Error("Directory owner reply insert returned no row");
    return { commentId: row.id };
  });
}

/** The ids of the business's reviews, as a subquery: it holds an edit or a take-down to the owner's own business. */
function reviewIdsOfBusiness(db: Database, business: DirectoryRef) {
  return db.select({ id: directoryReviews.id }).from(directoryReviews).where(reviewOfBusiness(business));
}

export interface OwnerReplyEdit {
  readonly business: DirectoryRef;
  readonly commentId: string;
  readonly text: string;
  readonly now: Date;
}

/**
 * Changes the words of an owner's published answer under a review of `business`, and records when. Gives back when the
 * answer was first posted, or null when the id names no such answer: a visitor's comment, an answer already taken down,
 * one of another business, or not a UUID.
 */
export async function editOwnerReply(db: Database, input: OwnerReplyEdit): Promise<Date | null> {
  if (!isUuid(input.commentId)) return null;
  const rows = await db
    .update(directoryReviewComments)
    .set({ text: input.text, editedAt: input.now })
    .where(
      and(
        eq(directoryReviewComments.id, input.commentId),
        eq(directoryReviewComments.authorKind, "owner"),
        eq(directoryReviewComments.status, "published"),
        inArray(directoryReviewComments.reviewId, reviewIdsOfBusiness(db, input.business)),
      ),
    )
    .returning({ createdAt: directoryReviewComments.createdAt });
  return rows[0]?.createdAt ?? null;
}

export interface OwnerReplyRemoval {
  readonly business: DirectoryRef;
  readonly commentId: string;
  readonly ownerUserId: string;
  readonly now: Date;
}

/**
 * Takes an owner's published answer down, which hides it (nothing is ever deleted, so staff can see and restore it).
 * False when the id names no such answer, for the same reasons as editOwnerReply.
 */
export async function removeOwnerReply(db: Database, input: OwnerReplyRemoval): Promise<boolean> {
  if (!isUuid(input.commentId)) return false;
  const rows = await db
    .update(directoryReviewComments)
    .set({ status: "hidden", hiddenAt: input.now, hiddenByUserId: input.ownerUserId })
    .where(
      and(
        eq(directoryReviewComments.id, input.commentId),
        eq(directoryReviewComments.authorKind, "owner"),
        eq(directoryReviewComments.status, "published"),
        inArray(directoryReviewComments.reviewId, reviewIdsOfBusiness(db, input.business)),
      ),
    )
    .returning({ id: directoryReviewComments.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// The owner's Reviews page
// ---------------------------------------------------------------------------------------------------------------

export type OwnerReviewFilter = "all" | "unanswered";

export interface OwnerReviewComment {
  readonly id: string;
  /** A visitor's first name and initial; the business's own name for the owner's answer. */
  readonly displayName: string;
  readonly text: string;
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly byOwner: boolean;
  /** Whether the owner may change or take this down: their own answers, never a visitor's comment. */
  readonly canEdit: boolean;
}

export interface OwnerReview {
  readonly id: string;
  readonly displayName: string;
  readonly rating: number;
  readonly text: string | null;
  readonly highlights: readonly string[];
  readonly createdAt: Date;
  readonly helpfulCount: number;
  /** No published owner answer sits under it yet. */
  readonly needsReply: boolean;
  /**
   * The reviewer's number, only when they ticked that this business may contact them about the review (N14); null
   * otherwise, and for every review posted before the box existed.
   */
  readonly contactPhone: string | null;
  /** Every published comment, oldest first. */
  readonly comments: readonly OwnerReviewComment[];
}

export interface OwnerReviewPage {
  readonly reviews: readonly OwnerReview[];
  /** Reviews matching the filter, for paging. */
  readonly total: number;
  /** Every published review of the business, whatever the filter. */
  readonly all: number;
  /** Published reviews the owner has not answered, whatever the filter. */
  readonly unanswered: number;
}

export interface OwnerReviewQuery {
  readonly filter: OwnerReviewFilter;
  readonly limit: number;
  readonly offset: number;
}

/** A page of the business's published reviews, newest first, each with its whole conversation. */
export async function listReviewsForOwner(db: Database, business: DirectoryRef, query: OwnerReviewQuery): Promise<OwnerReviewPage> {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1) throw new RangeError(`Limit must be a positive whole number, received ${query.limit}`);
  if (!Number.isSafeInteger(query.offset) || query.offset < 0) throw new RangeError(`Offset must be a whole number from 0, received ${query.offset}`);

  const published = and(eq(directoryReviews.status, "published"), reviewOfBusiness(business));
  const shown = query.filter === "unanswered" ? and(published, awaitingAnswer()) : published;
  const [rows, totals, everyone, waiting] = await Promise.all([
    db
      .select({
        id: directoryReviews.id,
        reviewerName: directoryReviews.reviewerName,
        rating: directoryReviews.rating,
        text: directoryReviews.text,
        highlights: directoryReviews.highlights,
        createdAt: directoryReviews.createdAt,
        helpfulCount: directoryReviews.helpfulCount,
        needsReply: sql<boolean>`${awaitingAnswer()}`.mapWith(Boolean),
        contactPhone: sql<string | null>`case when ${directoryReviews.ownerMayContact} then ${directoryReviews.phone} end`,
      })
      .from(directoryReviews)
      .where(shown)
      .orderBy(desc(directoryReviews.createdAt), desc(directoryReviews.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(directoryReviews).where(shown),
    db.select({ total: count() }).from(directoryReviews).where(published),
    db.select({ total: count() }).from(directoryReviews).where(and(published, awaitingAnswer())),
  ]);

  const comments = rows.length === 0 ? [] : await readPublishedComments(db, business, rows.map((row) => row.id));
  const byReview = new Map<string, OwnerReviewComment[]>();
  for (const comment of comments) {
    const list = byReview.get(comment.reviewId) ?? [];
    list.push(comment.comment);
    byReview.set(comment.reviewId, list);
  }

  return {
    reviews: rows.map((row) => ({
      id: row.id,
      displayName: reviewerDisplayName(row.reviewerName),
      rating: row.rating,
      text: row.text,
      highlights: row.highlights,
      createdAt: row.createdAt,
      helpfulCount: row.helpfulCount,
      needsReply: row.needsReply,
      contactPhone: row.contactPhone,
      comments: byReview.get(row.id) ?? [],
    })),
    total: totals[0]?.total ?? 0,
    all: everyone[0]?.total ?? 0,
    unanswered: waiting[0]?.total ?? 0,
  };
}

async function readPublishedComments(
  db: Database,
  business: DirectoryRef,
  reviewIds: readonly string[],
): Promise<readonly { readonly reviewId: string; readonly comment: OwnerReviewComment }[]> {
  const rows = await db
    .select({
      id: directoryReviewComments.id,
      reviewId: directoryReviewComments.reviewId,
      authorKind: directoryReviewComments.authorKind,
      commenterName: directoryReviewComments.commenterName,
      text: directoryReviewComments.text,
      createdAt: directoryReviewComments.createdAt,
      editedAt: directoryReviewComments.editedAt,
      businessName: directoryReviews.businessName,
    })
    .from(directoryReviewComments)
    .innerJoin(directoryReviews, eq(directoryReviews.id, directoryReviewComments.reviewId))
    .where(and(inArray(directoryReviewComments.reviewId, [...reviewIds]), eq(directoryReviewComments.status, "published"), reviewOfBusiness(business)))
    .orderBy(asc(directoryReviewComments.createdAt), asc(directoryReviewComments.id));
  return rows.map((row) => ({
    reviewId: row.reviewId,
    comment: {
      id: row.id,
      displayName: row.authorKind === "owner" ? row.businessName : reviewerDisplayName(row.commenterName),
      text: row.text,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      byOwner: row.authorKind === "owner",
      canEdit: row.authorKind === "owner",
    },
  }));
}

/** How many published reviews of the business have no owner answer yet, for the badge beside Reviews in the menu. */
export async function countReviewsAwaitingAnswer(db: Database, business: DirectoryRef): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(directoryReviews)
    .where(and(eq(directoryReviews.status, "published"), reviewOfBusiness(business), awaitingAnswer()));
  return rows[0]?.total ?? 0;
}
