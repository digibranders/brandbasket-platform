import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  DIRECTORY_DEALS_LIVE_MAX,
  DIRECTORY_DEAL_BADGE_MAX,
  DIRECTORY_DEAL_MAX_DAYS,
  DIRECTORY_DEAL_TERMS_MAX,
  DIRECTORY_DEAL_TITLE_MAX,
  businesses,
  directoryClaims,
  directoryDeals,
  type DirectoryDealStatus,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * A listing owner's deals (docs/superpowers/specs/2026-10-07-deals-offers-design.md). The customer reads its own rows
 * through row-level security; every write runs on the staff connection after the platform has checked the customer or
 * the staff member. A deal is "on show" from its first day to its last while it is live and not removed; days are
 * ISO dates ("2026-10-07") in the business's own calendar, which the caller works out.
 */

export interface DirectoryDeal {
  readonly id: string;
  readonly businessId: string;
  readonly title: string;
  readonly badge: string;
  readonly terms: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: DirectoryDealStatus;
  readonly takenDownReason: string | null;
  readonly createdAt: Date;
}

const DEAL_COLUMNS = {
  id: directoryDeals.id,
  businessId: directoryDeals.businessId,
  title: directoryDeals.title,
  badge: directoryDeals.badge,
  terms: directoryDeals.terms,
  startsOn: directoryDeals.startsOn,
  endsOn: directoryDeals.endsOn,
  status: directoryDeals.status,
  takenDownReason: directoryDeals.takenDownReason,
  createdAt: directoryDeals.createdAt,
} as const;

/** What an owner fills in; the platform has already checked the shapes, and the database holds the same limits. */
export interface DirectoryDealFields {
  readonly title: string;
  readonly badge: string;
  readonly terms: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/** Thrown for a deal the rules refuse; the platform checks first, so this is the last line, not the user's message. */
export class InvalidDirectoryDealError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDirectoryDealError";
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(day: string): number {
  if (!ISO_DAY.test(day)) throw new InvalidDirectoryDealError(`"${day}" is not a date.`);
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day) throw new InvalidDirectoryDealError(`"${day}" is not a date.`);
  return time / 86_400_000;
}

/** The fields trimmed, or an InvalidDirectoryDealError naming what is wrong. */
export function checkDealFields(fields: DirectoryDealFields): DirectoryDealFields {
  const title = fields.title.trim();
  const badge = fields.badge.trim();
  const terms = fields.terms.trim();
  if (title === "" || title.length > DIRECTORY_DEAL_TITLE_MAX) throw new InvalidDirectoryDealError(`The title is 1 to ${String(DIRECTORY_DEAL_TITLE_MAX)} characters.`);
  if (badge === "" || badge.length > DIRECTORY_DEAL_BADGE_MAX) throw new InvalidDirectoryDealError(`The badge is 1 to ${String(DIRECTORY_DEAL_BADGE_MAX)} characters.`);
  if (terms === "" || terms.length > DIRECTORY_DEAL_TERMS_MAX) throw new InvalidDirectoryDealError(`The terms are 1 to ${String(DIRECTORY_DEAL_TERMS_MAX)} characters.`);
  const span = dayNumber(fields.endsOn) - dayNumber(fields.startsOn);
  if (span < 0) throw new InvalidDirectoryDealError("A deal cannot end before it starts.");
  if (span >= DIRECTORY_DEAL_MAX_DAYS) throw new InvalidDirectoryDealError(`A deal runs at most ${String(DIRECTORY_DEAL_MAX_DAYS)} days.`);
  return { title, badge, terms, startsOn: fields.startsOn, endsOn: fields.endsOn };
}

/** The business's deals that have not been removed, newest first, whatever their status or dates. */
export async function listOwnDeals(db: Runner, businessId: string): Promise<DirectoryDeal[]> {
  return db
    .select(DEAL_COLUMNS)
    .from(directoryDeals)
    .where(and(eq(directoryDeals.businessId, businessId), isNull(directoryDeals.removedAt)))
    .orderBy(desc(directoryDeals.createdAt), desc(directoryDeals.id));
}

/** Locks the business's claim row for the rest of the transaction; its status, or null when it has no claim. */
async function lockClaim(tx: ScopedTransaction, businessId: string): Promise<"pending" | "approved" | "rejected" | null> {
  const rows = await tx
    .select({ status: directoryClaims.status })
    .from(directoryClaims)
    .where(eq(directoryClaims.businessId, businessId))
    .limit(1)
    .for("update");
  return rows[0]?.status ?? null;
}

export type CreateDirectoryDealOutcome =
  | { readonly kind: "created"; readonly deal: DirectoryDeal }
  /** No claim, or a rejected one: there is no listing for a deal to be on. */
  | { readonly kind: "no-claim" }
  /** The business already has DIRECTORY_DEALS_LIVE_MAX deals that are live and not over. */
  | { readonly kind: "limit" };

/**
 * Posts a deal at once. One business's writes run one after the other (the claim row is locked), so the live limit
 * cannot be passed by two requests together. `today` is the business's date, for counting the deals still running.
 */
export async function createDirectoryDeal(
  db: Database,
  input: { readonly businessId: string; readonly userId: string; readonly fields: DirectoryDealFields; readonly today: string },
): Promise<CreateDirectoryDealOutcome> {
  const fields = checkDealFields(input.fields);
  return db.transaction(async (tx) => {
    const claim = await lockClaim(tx, input.businessId);
    if (claim === null || claim === "rejected") return { kind: "no-claim" };
    const running = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(directoryDeals)
      .where(
        and(
          eq(directoryDeals.businessId, input.businessId),
          eq(directoryDeals.status, "live"),
          isNull(directoryDeals.removedAt),
          gte(directoryDeals.endsOn, input.today),
        ),
      );
    if ((running[0]?.count ?? 0) >= DIRECTORY_DEALS_LIVE_MAX) return { kind: "limit" };
    const rows = await tx
      .insert(directoryDeals)
      .values({ businessId: input.businessId, createdByUserId: input.userId, ...fields })
      .returning(DEAL_COLUMNS);
    const deal = rows[0];
    if (deal === undefined) throw new Error("The deal was not saved.");
    return { kind: "created", deal };
  });
}

/**
 * Changes one of the business's own deals. False when it is not found, is another business's, was removed or taken
 * down by staff (the owner cannot bring a taken-down deal back by editing it).
 */
export async function updateDirectoryDeal(
  db: Database,
  input: { readonly businessId: string; readonly dealId: string; readonly fields: DirectoryDealFields },
): Promise<boolean> {
  if (!isUuid(input.dealId)) return false;
  const fields = checkDealFields(input.fields);
  const rows = await db
    .update(directoryDeals)
    .set(fields)
    .where(
      and(
        eq(directoryDeals.id, input.dealId),
        eq(directoryDeals.businessId, input.businessId),
        eq(directoryDeals.status, "live"),
        isNull(directoryDeals.removedAt),
      ),
    )
    .returning({ id: directoryDeals.id });
  return rows.length > 0;
}

/** The owner removes one of its own deals (it stops showing, the row stays on record). False when there is none. */
export async function removeDirectoryDeal(db: Database, input: { readonly businessId: string; readonly dealId: string; readonly now: Date }): Promise<boolean> {
  if (!isUuid(input.dealId)) return false;
  const rows = await db
    .update(directoryDeals)
    .set({ removedAt: input.now })
    .where(and(eq(directoryDeals.id, input.dealId), eq(directoryDeals.businessId, input.businessId), isNull(directoryDeals.removedAt)))
    .returning({ id: directoryDeals.id });
  return rows.length > 0;
}

/** Staff take a deal down with a reason the owner sees. False when it is not found, removed, or already down. */
export async function takeDownDirectoryDeal(
  db: Database,
  input: { readonly dealId: string; readonly staffId: string; readonly reason: string; readonly now: Date },
): Promise<boolean> {
  if (!isUuid(input.dealId)) return false;
  const reason = input.reason.trim();
  if (reason === "" || reason.length > 300) throw new InvalidDirectoryDealError("The reason is 1 to 300 characters.");
  const rows = await db
    .update(directoryDeals)
    .set({ status: "taken_down", takenDownAt: input.now, takenDownByUserId: input.staffId, takenDownReason: reason })
    .where(and(eq(directoryDeals.id, input.dealId), eq(directoryDeals.status, "live"), isNull(directoryDeals.removedAt)))
    .returning({ id: directoryDeals.id });
  return rows.length > 0;
}

export interface StaffDirectoryDeal extends DirectoryDeal {
  readonly businessName: string;
}

/** Every deal on show on `today`, oldest first, for the staff console's list. */
export async function listDealsOnShowForStaff(db: Database, today: string): Promise<StaffDirectoryDeal[]> {
  return db
    .select({ ...DEAL_COLUMNS, businessName: businesses.name })
    .from(directoryDeals)
    .innerJoin(businesses, eq(businesses.id, directoryDeals.businessId))
    .where(
      and(eq(directoryDeals.status, "live"), isNull(directoryDeals.removedAt), lte(directoryDeals.startsOn, today), gte(directoryDeals.endsOn, today)),
    )
    .orderBy(asc(directoryDeals.createdAt), asc(directoryDeals.id));
}

/** A deal on show, with the listing it is on, for the website's feed. */
export interface PublicDirectoryDeal {
  readonly id: string;
  readonly placeId: string | null;
  readonly listingKey: string;
  readonly businessName: string;
  readonly title: string;
  readonly badge: string;
  readonly terms: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/**
 * The deals on show on `today` whose business's claim is approved: nobody's offer shows on a listing they have not
 * proved is theirs. Newest first.
 */
export async function readDealsOnShow(db: Database, today: string): Promise<PublicDirectoryDeal[]> {
  return db
    .select({
      id: directoryDeals.id,
      placeId: directoryClaims.placeId,
      listingKey: directoryClaims.listingKey,
      businessName: directoryClaims.businessName,
      title: directoryDeals.title,
      badge: directoryDeals.badge,
      terms: directoryDeals.terms,
      startsOn: directoryDeals.startsOn,
      endsOn: directoryDeals.endsOn,
    })
    .from(directoryDeals)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryDeals.businessId))
    .where(
      and(
        eq(directoryClaims.status, "approved"),
        eq(directoryDeals.status, "live"),
        isNull(directoryDeals.removedAt),
        lte(directoryDeals.startsOn, today),
        gte(directoryDeals.endsOn, today),
      ),
    )
    .orderBy(desc(directoryDeals.createdAt), desc(directoryDeals.id));
}
