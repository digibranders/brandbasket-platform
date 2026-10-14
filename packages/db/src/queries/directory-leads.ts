import { and, asc, count, desc, eq, gte, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import { directoryEnquiries } from "../schema";
import type { ListingEnquiry } from "./directory";
import { matchesDirectoryRef, type DirectoryRef } from "./directory-refs";

/**
 * A business owner's leads: the enquiries visitors sent from its page in the directory. A free listing has no limit on
 * them, so the owner's Leads page reads them a page at a time, with how many there are in all and how many came lately.
 * Enquiries are staff rows (see `getStaffDb`), read for the one business the caller has already proved is the owner's.
 * The business is named by its permanent place id where it has one, as enquiries are saved (listListingEnquiries).
 */

export interface ListingLeadsQuery {
  /** How many leads to return, newest first. */
  readonly limit: number;
  /** How many of the newest to skip. */
  readonly offset: number;
  /** The start of the recent window counted in `sinceCount`. */
  readonly since: Date;
  /** Only the leads that came through this category's list page (its label, as the enquiry stored it). */
  readonly serviceLabel?: string;
  /** Only the leads the owner has not replied to (`new`) or has (`replied`). */
  readonly reply?: LeadReplyFilter;
}

/** The two halves of an owner's leads: not yet marked replied, and marked replied. */
export type LeadReplyFilter = "new" | "replied";

/** A lead and the category page it came through: the enquiry stores that category's label. */
export interface ListingLead extends ListingEnquiry {
  readonly serviceLabel: string;
  /** When the owner marked it replied; null while it is new to them. */
  readonly ownerRepliedAt: Date | null;
}

/** How many of a business's leads are new and how many replied: the tabs' counts, whatever filter is on. */
export interface LeadReplyCounts {
  readonly all: number;
  readonly new: number;
  readonly replied: number;
}

/** How many leads a category brought: every one, and the ones from `since` on. */
export interface CategoryLeadCount {
  readonly serviceLabel: string;
  readonly total: number;
  readonly sinceCount: number;
}

export interface ListingLeads {
  readonly leads: readonly ListingLead[];
  /** Every lead the business has had (of the category asked for, when one was). */
  readonly total: number;
  /** The leads from `since` on (same). */
  readonly sinceCount: number;
  /** Each category's leads, most first, whatever category was asked for: the whole business's breakdown. */
  readonly byCategory: readonly CategoryLeadCount[];
  /** The whole business's new and replied leads, whatever category or reply filter was asked for. */
  readonly replyCounts: LeadReplyCounts;
  /** The whole business's leads from `since` on, whatever category or reply filter was asked for. */
  readonly businessSinceCount: number;
}

function replyCondition(reply: LeadReplyFilter): SQL {
  return reply === "new" ? isNull(directoryEnquiries.ownerRepliedAt) : isNotNull(directoryEnquiries.ownerRepliedAt);
}

function ownLeadsOf(business: DirectoryRef): SQL | undefined {
  return and(
    matchesDirectoryRef({ placeId: directoryEnquiries.placeId, listingKey: directoryEnquiries.listingKey }, business),
    eq(directoryEnquiries.kind, "business"),
  );
}

export async function readListingLeads(db: Database, business: DirectoryRef, query: ListingLeadsQuery): Promise<ListingLeads> {
  const ownLeads = ownLeadsOf(business);
  const shown: SQL | undefined = and(
    ownLeads,
    query.serviceLabel === undefined ? undefined : eq(directoryEnquiries.serviceLabel, query.serviceLabel),
    query.reply === undefined ? undefined : replyCondition(query.reply),
  );
  const [leads, totals, recent, categories, replies] = await Promise.all([
    db
      .select({
        id: directoryEnquiries.id,
        name: directoryEnquiries.name,
        phone: directoryEnquiries.phone,
        message: directoryEnquiries.message,
        createdAt: directoryEnquiries.createdAt,
        serviceLabel: directoryEnquiries.serviceLabel,
        ownerRepliedAt: directoryEnquiries.ownerRepliedAt,
      })
      .from(directoryEnquiries)
      .where(shown)
      .orderBy(desc(directoryEnquiries.createdAt), desc(directoryEnquiries.id))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(directoryEnquiries).where(shown),
    db
      .select({ value: count() })
      .from(directoryEnquiries)
      .where(and(shown, gte(directoryEnquiries.createdAt, query.since))),
    db
      .select({
        serviceLabel: directoryEnquiries.serviceLabel,
        total: count(),
        sinceCount: sql<number>`count(*) filter (where ${directoryEnquiries.createdAt} >= ${query.since})`.mapWith(Number),
      })
      .from(directoryEnquiries)
      .where(ownLeads)
      .groupBy(directoryEnquiries.serviceLabel)
      .orderBy(desc(count()), asc(directoryEnquiries.serviceLabel)),
    db
      .select({
        all: count(),
        replied: sql<number>`count(*) filter (where ${directoryEnquiries.ownerRepliedAt} is not null)`.mapWith(Number),
        since: sql<number>`count(*) filter (where ${directoryEnquiries.createdAt} >= ${query.since})`.mapWith(Number),
      })
      .from(directoryEnquiries)
      .where(ownLeads),
  ]);
  const all = replies[0]?.all ?? 0;
  const replied = replies[0]?.replied ?? 0;
  return {
    leads,
    total: totals[0]?.value ?? 0,
    sinceCount: recent[0]?.value ?? 0,
    byCategory: categories,
    replyCounts: { all, new: all - replied, replied },
    businessSinceCount: replies[0]?.since ?? 0,
  };
}

/** How many of the business's leads the owner has not replied to: the sidebar's count on Leads. */
export async function countNewLeads(db: Database, business: DirectoryRef): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(directoryEnquiries)
    .where(and(ownLeadsOf(business), isNull(directoryEnquiries.ownerRepliedAt)));
  return rows[0]?.value ?? 0;
}

/**
 * Marks one of the business's leads replied, or new again. The lead must be one of this business's own, so an id from
 * another business's page changes nothing. Marking again keeps the first time. Returns whether a lead of this business
 * was found.
 */
export async function setLeadReplied(db: Database, business: DirectoryRef, leadId: string, replied: boolean, now: Date): Promise<boolean> {
  const own = and(ownLeadsOf(business), eq(directoryEnquiries.id, leadId));
  const rows = await db
    .update(directoryEnquiries)
    .set({ ownerRepliedAt: replied ? sql`coalesce(${directoryEnquiries.ownerRepliedAt}, ${now.toISOString()}::timestamptz)` : null })
    .where(own)
    .returning({ id: directoryEnquiries.id });
  return rows.length > 0;
}
