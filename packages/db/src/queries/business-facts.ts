import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businessAnnouncements, businessClosures, businessHours, businesses } from "../schema";
import { HOURS_COLUMNS, type BusinessHoursInput, type BusinessHoursRow } from "./onboarding-data";
import { currentBusinessId, isUuid } from "./tenant";

/*
 * Customer-scoped reads and writes for the facts a client site shows around its opening hours: closures,
 * the one-line announcement banner, and (post-launch) the hours themselves. Every scoped function takes its
 * business id from currentBusinessId(tx), never from an argument, same as onboarding-data.ts.
 *
 * readSiteFacts is the one system (staff-connection) read here: everything a client site's server-side render
 * needs about a business's opening-hours-adjacent facts, gathered in one call.
 */

export interface ClosureRow {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  /** `HH:MM` when the business keeps shorter hours on these days (a half day); null when it is shut all day. */
  readonly opensAt?: string | null;
  readonly closesAt?: string | null;
}

/** Postgres hands a time back as `HH:MM:SS`; the rest of the app reads `HH:MM`. */
function timeOfDay(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

interface StoredClosure {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

function toClosureRow(row: StoredClosure): ClosureRow {
  return { ...row, opensAt: timeOfDay(row.opensAt), closesAt: timeOfDay(row.closesAt) };
}

const CLOSURE_COLUMNS = {
  id: businessClosures.id,
  startsOn: businessClosures.startsOn,
  endsOn: businessClosures.endsOn,
  note: businessClosures.note,
  opensAt: businessClosures.opensAt,
  closesAt: businessClosures.closesAt,
} as const;

/** Ordered by the day it starts, so the soonest closure reads first. */
export async function listClosures(tx: ScopedTransaction): Promise<ClosureRow[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(CLOSURE_COLUMNS)
    .from(businessClosures)
    .where(eq(businessClosures.businessId, businessId))
    .orderBy(asc(businessClosures.startsOn), asc(businessClosures.id));
  return rows.map(toClosureRow);
}

export async function addClosure(
  tx: ScopedTransaction,
  input: {
    readonly startsOn: string;
    readonly endsOn: string;
    readonly note: string | null;
    readonly opensAt?: string | null;
    readonly closesAt?: string | null;
  },
): Promise<ClosureRow> {
  const businessId = await currentBusinessId(tx);
  const note = input.note === null || input.note.trim() === "" ? null : input.note;
  const rows = await tx
    .insert(businessClosures)
    .values({
      businessId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      note,
      opensAt: input.opensAt ?? null,
      closesAt: input.closesAt ?? null,
    })
    .returning(CLOSURE_COLUMNS);
  const closure = rows[0];
  if (closure === undefined) throw new Error("Closure insert returned no row");
  return toClosureRow(closure);
}

/** False when `closureId` is not a UUID, does not exist, or belongs to another business, rather than a Postgres
 * error or a silent no-op the caller cannot tell apart from success. */
export async function deleteClosure(tx: ScopedTransaction, closureId: string): Promise<boolean> {
  if (!isUuid(closureId)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .delete(businessClosures)
    .where(and(eq(businessClosures.id, closureId), eq(businessClosures.businessId, businessId)))
    .returning({ id: businessClosures.id });
  return rows.length > 0;
}

export interface AnnouncementRow {
  readonly message: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

const ANNOUNCEMENT_COLUMNS = {
  message: businessAnnouncements.message,
  startsOn: businessAnnouncements.startsOn,
  endsOn: businessAnnouncements.endsOn,
} as const;

export async function findAnnouncement(tx: ScopedTransaction): Promise<AnnouncementRow | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(ANNOUNCEMENT_COLUMNS)
    .from(businessAnnouncements)
    .where(eq(businessAnnouncements.businessId, businessId))
    .limit(1);
  return rows[0] ?? null;
}

/** Creates or replaces the tenant's one announcement row. */
export async function saveAnnouncement(
  tx: ScopedTransaction,
  input: { readonly message: string; readonly startsOn: string; readonly endsOn: string },
  now: Date,
): Promise<void> {
  const businessId = await currentBusinessId(tx);
  const values = { message: input.message, startsOn: input.startsOn, endsOn: input.endsOn };
  await tx
    .insert(businessAnnouncements)
    .values({ businessId, ...values })
    .onConflictDoUpdate({ target: businessAnnouncements.businessId, set: { ...values, updatedAt: now } });
}

export async function clearAnnouncement(tx: ScopedTransaction): Promise<void> {
  const businessId = await currentBusinessId(tx);
  await tx.delete(businessAnnouncements).where(eq(businessAnnouncements.businessId, businessId));
}

/**
 * For a paying customer in their panel: replaces the tenant's opening hours the same way replaceBusinessHours
 * (onboarding-data.ts) does, but without that function's onboarding-project lock, since this runs after onboarding
 * and payment, not mid-onboarding-step where that lock is needed.
 */
export async function replaceOpeningHours(
  tx: ScopedTransaction,
  rows: readonly BusinessHoursInput[],
): Promise<BusinessHoursRow[]> {
  const businessId = await currentBusinessId(tx);
  // Serialises two saves racing for the same tenant, so they run one after the other rather than interleaving
  // their delete-then-insert (which could otherwise let the second save's delete remove rows the first save had
  // not inserted yet, or vice versa). A transaction-scoped advisory lock rather than a row lock: bb_app has
  // no UPDATE grant on businesses itself (so that row cannot take a FOR UPDATE lock), and every row-owning table
  // it could lock instead -- business_profiles included -- is optional and often absent (many already-live
  // businesses have no onboarding row left, or never had one), so a FOR UPDATE on any of them can silently lock
  // nothing. The advisory lock needs no row to exist: it is keyed on the business id with a "business_hours:"
  // prefix (hashtextextended's second argument is a namespace seed, not used to add entropy here) so it cannot
  // collide with an advisory lock some other feature takes on the same business id for an unrelated reason, and
  // it is released automatically when the transaction ends, same as a row lock would be.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('business_hours:' || ${businessId}, 0))`);
  await tx.delete(businessHours).where(eq(businessHours.businessId, businessId));
  if (rows.length > 0) {
    await tx.insert(businessHours).values(
      rows.map((row) => ({
        businessId,
        dayOfWeek: row.dayOfWeek,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        closed: row.closed,
        openAllDay: row.openAllDay,
      })),
    );
  }
  return tx
    .select(HOURS_COLUMNS)
    .from(businessHours)
    .where(eq(businessHours.businessId, businessId))
    .orderBy(asc(businessHours.dayOfWeek), asc(businessHours.opensAt), asc(businessHours.id));
}

export interface SiteFacts {
  readonly timeZone: string | null;
  readonly hours: readonly BusinessHoursRow[];
  readonly closures: readonly ClosureRow[];
  readonly announcement: AnnouncementRow | null;
}

/** Use with the staff connection. Everything a client site's server-side render needs about a business's
 * opening-hours-adjacent facts, gathered in one call. */
export async function readSiteFacts(db: Database, businessId: string): Promise<SiteFacts> {
  const [businessRows, hours, closures, announcementRows] = await Promise.all([
    db.select({ timeZone: businesses.timeZone }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    db
      .select(HOURS_COLUMNS)
      .from(businessHours)
      .where(eq(businessHours.businessId, businessId))
      .orderBy(asc(businessHours.dayOfWeek), asc(businessHours.opensAt), asc(businessHours.id)),
    db
      .select(CLOSURE_COLUMNS)
      .from(businessClosures)
      .where(eq(businessClosures.businessId, businessId))
      .orderBy(asc(businessClosures.startsOn), asc(businessClosures.id)),
    db.select(ANNOUNCEMENT_COLUMNS).from(businessAnnouncements).where(eq(businessAnnouncements.businessId, businessId)).limit(1),
  ]);
  return {
    timeZone: businessRows[0]?.timeZone ?? null,
    hours,
    closures: closures.map(toClosureRow),
    announcement: announcementRows[0] ?? null,
  };
}
