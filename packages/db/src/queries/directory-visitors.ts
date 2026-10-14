import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  consentRecords,
  directoryEnquiries,
  directoryReviewComments,
  directoryReviewOtps,
  directoryReviews,
  directoryVisitors,
  ERASED_VISITOR_NAME,
  type DirectoryVisitor,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import type { StaffPageInput } from "./directory";
import { directoryRefId, matchesDirectoryRef, type DirectoryRef } from "./directory-refs";
import { isUuid } from "./tenant";

/**
 * Website visitor accounts (0118): a name and a number that a code proved when the account was made. Every function runs on the staff
 * connection, from the platform's /api/directory/* routes. What a visitor typed is validated in the platform first;
 * the table's CHECKs are the backstop.
 */

/**
 * The visitor for a number that has just proven it, created on first sight. A returning number keeps its account and
 * takes the name just given (the latest wins), and counts as seen now.
 */
export async function upsertDirectoryVisitor(db: Database, input: { readonly phone: string; readonly name: string; readonly now: Date }): Promise<DirectoryVisitor> {
  const rows = await db
    .insert(directoryVisitors)
    .values({ phone: input.phone, name: input.name, lastSeenAt: input.now })
    .onConflictDoUpdate({ target: directoryVisitors.phone, set: { name: input.name, lastSeenAt: input.now } })
    .returning();
  const visitor = rows[0];
  if (visitor === undefined) throw new Error("Upserting a directory visitor returned no row.");
  return visitor;
}

/** The visitor with this id, or null when there is none (or the id is not a UUID). */
export async function findDirectoryVisitor(db: Database, id: string): Promise<DirectoryVisitor | null> {
  if (!isUuid(id)) return null;
  const rows = await db.select().from(directoryVisitors).where(eq(directoryVisitors.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Notes that a visitor came back, so the account's last-seen date stays true. */
export async function touchDirectoryVisitor(db: Database, id: string, now: Date): Promise<void> {
  if (!isUuid(id)) return;
  await db.update(directoryVisitors).set({ lastSeenAt: now }).where(eq(directoryVisitors.id, id));
}

// ---------------------------------------------------------------------------------------------------------------
// Staff console
// ---------------------------------------------------------------------------------------------------------------

/** A visitor account as the staff console lists it. The number is returned whole; masking it is the console's job. */
export interface StaffDirectoryVisitor {
  readonly id: string;
  readonly phone: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

export interface StaffDirectoryVisitorPage {
  readonly rows: readonly StaffDirectoryVisitor[];
  /** Rows matching the search, for paging. */
  readonly total: number;
}

/** A search of this many digits or more is also matched against the number (by its ending), so a pasted number finds its account. */
export const MIN_VISITOR_PHONE_SEARCH_DIGITS = 6;

/** `term` as an ILIKE pattern matching it anywhere, with its own wildcards escaped. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

/**
 * Visitor accounts, the most recently active first. A non-blank `search` keeps those whose name contains it
 * (case-insensitive) or, when it holds at least six digits, whose number ends with those digits.
 */
export async function listDirectoryVisitorsForStaff(
  db: Database,
  input: StaffPageInput & { readonly search: string },
): Promise<StaffDirectoryVisitorPage> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new RangeError(`Limit must be a positive whole number, received ${input.limit}`);
  if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new RangeError(`Offset must be a whole number from 0, received ${input.offset}`);
  const search = input.search.trim();
  const digits = search.replace(/\D/g, "");
  const byName = sql`${directoryVisitors.name} ilike ${likeContains(search)}`;
  const where =
    search === ""
      ? undefined
      : digits.length >= MIN_VISITOR_PHONE_SEARCH_DIGITS
        ? sql`(${byName} or ${directoryVisitors.phone} like ${`%${digits}`})`
        : byName;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: directoryVisitors.id,
        phone: directoryVisitors.phone,
        name: directoryVisitors.name,
        createdAt: directoryVisitors.createdAt,
        lastSeenAt: directoryVisitors.lastSeenAt,
      })
      .from(directoryVisitors)
      .where(where)
      .orderBy(desc(directoryVisitors.lastSeenAt), desc(directoryVisitors.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(directoryVisitors).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export async function countDirectoryVisitors(db: Database): Promise<number> {
  const rows = await db.select({ total: count() }).from(directoryVisitors);
  return rows[0]?.total ?? 0;
}

/**
 * Erases a visitor's account, for a request to delete it. Their browser's token then reads as signed out, and the next
 * confirmed code starts a fresh account. True when there was one to erase. Reviews, comments and enquiries they sent keep
 * their own copy of the name and number and are dealt with from their own lists.
 */
export async function deleteDirectoryVisitor(db: Database, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.delete(directoryVisitors).where(eq(directoryVisitors.id, id)).returning({ id: directoryVisitors.id });
  return rows.length > 0;
}

export { ERASED_VISITOR_NAME };

/**
 * What a visitor deletes: one review or one comment by its id, or (`business`, by the business's place id) everything they
 * posted on one business page, their review there and their comments on its reviews.
 */
export interface DirectoryContributionTarget {
  readonly kind: "review" | "comment" | "business";
  readonly id: string;
}

/** A place id as the website sends it: seven of the place alphabet with at least one digit (lib/directory-api.ts). */
const PLACE_ID = /^(?=[a-z2-9]*[2-9])[23456789abcdefghjkmnpqrstuvwxyz]{7}$/;

const REVIEW_BUSINESS = { placeId: directoryReviews.placeId, listingKey: directoryReviews.listingKey } as const;

interface BusinessColumns {
  readonly placeId: string | null;
  readonly listingKey: string | null;
}

/** The business a review row names. The table's business CHECK guarantees one of the two columns. */
function reviewBusiness(row: BusinessColumns): DirectoryRef {
  if (row.placeId !== null) return { placeId: row.placeId, listingKey: row.listingKey };
  if (row.listingKey !== null) return { placeId: null, listingKey: row.listingKey };
  throw new Error("A directory review names no business");
}

/** `refs` with each business once. */
function distinctBusinesses(refs: readonly DirectoryRef[]): DirectoryRef[] {
  const byId = new Map<string, DirectoryRef>();
  for (const ref of refs) byId.set(directoryRefId(ref), ref);
  return [...byId.values()];
}

/**
 * Deletes reviews outright, with everything that hangs off them: comment codes still waiting, and every comment and owner
 * answer. Nothing of a deleted review is left behind, so its stars stop counting at once (ratings are read live from the
 * published reviews).
 */
async function deleteReviewThreads(tx: ScopedTransaction, reviewIds: readonly string[]): Promise<void> {
  if (reviewIds.length === 0) return;
  const ids = [...reviewIds];
  await tx.delete(directoryReviewOtps).where(inArray(directoryReviewOtps.reviewId, ids));
  await tx.delete(directoryReviewComments).where(inArray(directoryReviewComments.reviewId, ids));
  await tx.delete(directoryReviews).where(inArray(directoryReviews.id, ids));
}

/** The businesses the given reviews are about. */
async function businessesOfReviews(tx: ScopedTransaction, reviewIds: readonly string[]): Promise<DirectoryRef[]> {
  if (reviewIds.length === 0) return [];
  const rows = await tx
    .select({ placeId: directoryReviews.placeId, listingKey: directoryReviews.listingKey })
    .from(directoryReviews)
    .where(inArray(directoryReviews.id, [...reviewIds]));
  return rows.map(reviewBusiness);
}

/**
 * Deletes one review or comment, as one step of the caller's transaction, if and only if it was posted with `phone` (DPDP
 * Act s.12(3), s.6(4)). The number must already be proven: this does not check who is asking. A review goes with every
 * comment and owner answer under it; a comment goes alone, and only a visitor's (an owner's answer has no number). Returns
 * the business whose page showed it, or null when there was nothing of this number's to delete: unknown, someone else's,
 * or already gone. The caller cannot tell those apart, so a number's posts are never revealed to someone who only has an id.
 */
export async function deleteOwnDirectoryContribution(
  tx: ScopedTransaction,
  input: { readonly phone: string; readonly target: DirectoryContributionTarget },
): Promise<DirectoryRef | null> {
  const { phone, target } = input;
  if (target.kind === "business") return deleteOwnPostsOnBusiness(tx, phone, target.id);
  if (!isUuid(target.id)) return null;

  if (target.kind === "review") {
    // Locked first, so a comment being published on it at the same moment waits and then finds it gone.
    const rows = await tx
      .select({ id: directoryReviews.id, placeId: directoryReviews.placeId, listingKey: directoryReviews.listingKey })
      .from(directoryReviews)
      .where(and(eq(directoryReviews.id, target.id), eq(directoryReviews.phone, phone)))
      .for("update");
    const review = rows[0];
    if (review === undefined) return null;
    await deleteReviewThreads(tx, [review.id]);
    return reviewBusiness(review);
  }

  const deleted = await tx
    .delete(directoryReviewComments)
    .where(and(eq(directoryReviewComments.id, target.id), eq(directoryReviewComments.phone, phone), eq(directoryReviewComments.authorKind, "visitor")))
    .returning({ reviewId: directoryReviewComments.reviewId });
  const comment = deleted[0];
  if (comment === undefined) return null;
  const [business] = await businessesOfReviews(tx, [comment.reviewId]);
  return business ?? null;
}

/** Everything `phone` posted on one business page: its review there, with the comments under it, and its comments there. */
async function deleteOwnPostsOnBusiness(tx: ScopedTransaction, phone: string, placeId: string): Promise<DirectoryRef | null> {
  if (!PLACE_ID.test(placeId)) return null;
  const business: DirectoryRef = { placeId, listingKey: null };
  const onBusiness = matchesDirectoryRef(REVIEW_BUSINESS, business);
  const reviews = await tx
    .select({ id: directoryReviews.id })
    .from(directoryReviews)
    .where(and(eq(directoryReviews.phone, phone), onBusiness))
    .for("update");
  await deleteReviewThreads(tx, reviews.map((review) => review.id));
  const comments = await tx
    .delete(directoryReviewComments)
    .where(
      and(
        eq(directoryReviewComments.phone, phone),
        inArray(directoryReviewComments.reviewId, tx.select({ id: directoryReviews.id }).from(directoryReviews).where(onBusiness)),
      ),
    )
    .returning({ id: directoryReviewComments.id });
  return reviews.length + comments.length > 0 ? business : null;
}

export interface OwnDirectoryContributions {
  /** The given reviews that `phone` wrote. */
  readonly reviews: readonly string[];
  /** The published comments `phone` wrote on the given reviews. */
  readonly comments: readonly string[];
}

/**
 * Which of a page's reviews, and which comments on them, a visitor wrote, so the page can offer "Delete" on those alone.
 * The number must already be proven (a visitor token): this does not check who is asking.
 */
export async function listOwnDirectoryContributions(
  db: Database,
  input: { readonly phone: string; readonly reviewIds: readonly string[] },
): Promise<OwnDirectoryContributions> {
  const ids = [...new Set(input.reviewIds.filter(isUuid))];
  if (ids.length === 0) return { reviews: [], comments: [] };
  const [reviews, comments] = await Promise.all([
    db.select({ id: directoryReviews.id }).from(directoryReviews).where(and(inArray(directoryReviews.id, ids), eq(directoryReviews.phone, input.phone))),
    db
      .select({ id: directoryReviewComments.id })
      .from(directoryReviewComments)
      .where(
        and(
          inArray(directoryReviewComments.reviewId, ids),
          eq(directoryReviewComments.phone, input.phone),
          eq(directoryReviewComments.status, "published"),
        ),
      ),
  ]);
  return { reviews: reviews.map((row) => row.id), comments: comments.map((row) => row.id) };
}

