import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { appointments, practitionerHours, practitionerLeave, practitioners } from "../schema";
import type { ClosureRow } from "./business-facts";
import type { BusinessHoursInput, BusinessHoursRow } from "./onboarding-data";
import { currentBusinessId, isUuid } from "./tenant";

/*
 * Customer-scoped reads and writes for a clinic's doctors (practitioners), their own weekly hours and their leave,
 * plus readPractitionerSchedules, the one system (staff-connection) read the booking page needs. Every scoped
 * function takes its business id from currentBusinessId(tx), never from an argument, same as business-facts.ts and
 * appointments.ts; row-level security additionally hides all three tables while the appointments module is off, so
 * a scoped call then sees nothing (reads come back empty, writes report not-found) rather than an error.
 *
 * A practitioner's own hours and leave are the per-doctor counterparts of business_hours and business_closures, and
 * travel as exactly the same row types (BusinessHoursRow/BusinessHoursInput and ClosureRow) so the slot engine and
 * the dashboard's hours editor read either without a second shape to keep in sync.
 */

/** How many practitioners a clinic may have active at once. Archived ones do not count: archiving is how a clinic
 * makes room, and past bookings keep pointing at the archived row. */
export const MAX_ACTIVE_PRACTITIONERS = 20;

export interface PractitionerRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly photoMediaId: string | null;
  readonly usesClinicHours: boolean;
  readonly position: number;
  readonly archivedAt: Date | null;
}

/** One stretch of leave. The same shape as a clinic closure, since it is the same fact about one doctor instead of
 * the whole clinic. */
export type LeaveRow = ClosureRow;

const PRACTITIONER_COLUMNS = {
  id: practitioners.id,
  name: practitioners.name,
  title: practitioners.title,
  photoMediaId: practitioners.photoMediaId,
  usesClinicHours: practitioners.usesClinicHours,
  position: practitioners.position,
  archivedAt: practitioners.archivedAt,
} as const;

/** The practitioner_hours counterpart of HOURS_COLUMNS (onboarding-data.ts): same keys, same row type. */
const PRACTITIONER_HOURS_COLUMNS = {
  id: practitionerHours.id,
  dayOfWeek: practitionerHours.dayOfWeek,
  opensAt: practitionerHours.opensAt,
  closesAt: practitionerHours.closesAt,
  closed: practitionerHours.closed,
  openAllDay: practitionerHours.openAllDay,
} as const;

const LEAVE_COLUMNS = {
  id: practitionerLeave.id,
  startsOn: practitionerLeave.startsOn,
  endsOn: practitionerLeave.endsOn,
  note: practitionerLeave.note,
} as const;

/** A blank optional text field is stored as null, never as an empty or whitespace-only string (the CHECKs on
 * title and note would reject "" anyway, with a far less useful error). */
function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

/**
 * Serialises the list-shape writes (add, move, archive) for one tenant, so two of them racing cannot both read the
 * same "19 active" or the same pair of neighbours and both act on it. A transaction-scoped advisory lock for the
 * same reason replaceOpeningHours (business-facts.ts) uses one: firstfold_app cannot lock the businesses row, and no
 * practitioners row is guaranteed to cover the whole list. The "practitioners:" prefix keeps it apart from every
 * other feature's lock on the same business id.
 */
async function lockPractitionerList(tx: ScopedTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('practitioners:' || ${businessId}, 0))`);
}

/** The lock bookSlot and reassignAppointment (appointments.ts) hold while they pick a practitioner for a slot. */
async function lockAppointments(tx: ScopedTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('appointments:' || ${businessId}, 0))`);
}

function activeOf(businessId: string, id: string): ReturnType<typeof and> {
  return and(eq(practitioners.id, id), eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt));
}

async function ownsPractitioner(tx: ScopedTransaction, businessId: string, id: string): Promise<boolean> {
  const rows = await tx
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(and(eq(practitioners.id, id), eq(practitioners.businessId, businessId)))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Practitioners
// ---------------------------------------------------------------------------------------------------------------

/** In display order: position, then id as the tiebreaker, so two practitioners sharing a position still come back
 * in the same relative order on every call. */
export async function listPractitioners(
  tx: ScopedTransaction,
  opts: { readonly includeArchived: boolean },
): Promise<PractitionerRow[]> {
  const businessId = await currentBusinessId(tx);
  const where = opts.includeArchived
    ? eq(practitioners.businessId, businessId)
    : and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt));
  return tx.select(PRACTITIONER_COLUMNS).from(practitioners).where(where).orderBy(asc(practitioners.position), asc(practitioners.id));
}

export type AddPractitionerResult =
  | { readonly kind: "added"; readonly practitioner: PractitionerRow }
  | { readonly kind: "limit" };

/**
 * Appended at the end of the list: one past the highest position any practitioner has had, archived ones
 * included, so un-archiving an old doctor later never lands them on top of a new one. Refused with `limit` once
 * MAX_ACTIVE_PRACTITIONERS are active; the count and the insert run under the list lock, so two concurrent adds
 * at 19 cannot both land.
 */
export async function addPractitioner(
  tx: ScopedTransaction,
  input: { readonly name: string; readonly title: string | null },
): Promise<AddPractitionerResult> {
  const businessId = await currentBusinessId(tx);
  await lockPractitionerList(tx, businessId);

  const [stats] = await tx
    .select({
      active: sql<number>`count(*) filter (where ${practitioners.archivedAt} is null)::int`,
      maxPosition: sql<number | null>`max(${practitioners.position})`,
    })
    .from(practitioners)
    .where(eq(practitioners.businessId, businessId));
  if ((stats?.active ?? 0) >= MAX_ACTIVE_PRACTITIONERS) return { kind: "limit" };

  const rows = await tx
    .insert(practitioners)
    .values({ businessId, name: input.name, title: blankToNull(input.title), position: (stats?.maxPosition ?? -1) + 1 })
    .returning(PRACTITIONER_COLUMNS);
  const practitioner = rows[0];
  if (practitioner === undefined) throw new Error("Practitioner insert returned no row");
  return { kind: "added", practitioner };
}

/** Renames and retitles; archived practitioners included, so a past booking's doctor can still be corrected. False
 * when `id` is not a UUID, does not exist, or belongs to another business. The name's length is left to
 * `practitioners_name_check`, which throws a CHECK_VIOLATION when broken. */
export async function updatePractitioner(
  tx: ScopedTransaction,
  id: string,
  input: { readonly name: string; readonly title: string | null },
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .update(practitioners)
    .set({ name: input.name, title: blankToNull(input.title) })
    .where(and(eq(practitioners.id, id), eq(practitioners.businessId, businessId)))
    .returning({ id: practitioners.id });
  return rows.length > 0;
}

/**
 * Swaps `id` with its neighbour above ("up") or below ("down") among the active practitioners, stepping over
 * archived ones (they are not shown in the list being reordered). False when `id` is already at that edge, is
 * archived, is another business's, or is not a UUID.
 *
 * Positions are not unique, so rather than exchanging the two raw values (which does nothing when they tie), the
 * active list is re-laid in its new order onto the positions it already had, each bumped just past the previous
 * one where needed: when positions are distinct this is exactly a swap of the two rows' values, and when they tie
 * the tie is broken in the requested order. Only rows whose position actually changes are written.
 */
export async function movePractitioner(tx: ScopedTransaction, id: string, direction: "up" | "down"): Promise<boolean> {
  if (!isUuid(id)) return false;
  const businessId = await currentBusinessId(tx);
  await lockPractitionerList(tx, businessId);

  const active = await tx
    .select({ id: practitioners.id, position: practitioners.position })
    .from(practitioners)
    .where(and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt)))
    .orderBy(asc(practitioners.position), asc(practitioners.id));
  const index = active.findIndex((row) => row.id === id);
  if (index === -1) return false;
  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  const moved = active[index];
  const neighbour = active[neighbourIndex];
  if (moved === undefined || neighbour === undefined) return false;

  const reordered = [...active];
  reordered[index] = neighbour;
  reordered[neighbourIndex] = moved;

  let previous = Number.NEGATIVE_INFINITY;
  for (const [slot, row] of reordered.entries()) {
    const original = active[slot];
    if (original === undefined) throw new Error("Practitioner reorder lost a row");
    const position = Math.max(original.position, previous + 1);
    previous = position;
    if (position !== row.position) {
      await tx
        .update(practitioners)
        .set({ position })
        .where(and(eq(practitioners.id, row.id), eq(practitioners.businessId, businessId)));
    }
  }
  return true;
}

export type ArchivePractitionerResult =
  | { readonly kind: "archived" }
  | { readonly kind: "has_upcoming"; readonly count: number }
  | { readonly kind: "last" }
  | { readonly kind: "not_found" };

/**
 * Takes `id` off every new booking by stamping archived_at; nothing is deleted, so past bookings keep a readable
 * doctor. Refused, in this order:
 *  - `not_found` when `id` is not a UUID, is another business's, or is already archived;
 *  - `last` when it is the only active practitioner, since a clinic taking bookings always needs one;
 *  - `has_upcoming` (with how many) while it still has booked appointments starting after `now` -- the clinic
 *    reassigns or cancels those first, so no patient is left booked with a doctor who no longer exists.
 *
 * It holds the list lock (so two archives cannot each leave the other as "the last one") and then the same
 * appointments lock bookSlot takes, so a booking cannot land on this practitioner between the upcoming count and
 * the archive: bookSlot re-reads which candidates are still active inside that lock. Always list lock first, then
 * appointments lock; bookSlot and reassignAppointment only ever take the latter, so the two can never deadlock.
 *
 * Lock-order warning for callers: this takes the 'practitioners:' advisory lock and then the 'appointments:' one.
 * Advisory xact locks are held until the transaction ends, so a caller must never run bookSlot or
 * reassignAppointment (which take 'appointments:') earlier in the same transaction and then call this: that
 * transaction would hold 'appointments:' while waiting for 'practitioners:', the reverse of another archive's
 * order, and the two would deadlock. Call archivePractitioner in a transaction of its own, or first.
 */
export async function archivePractitioner(tx: ScopedTransaction, id: string, now: Date): Promise<ArchivePractitionerResult> {
  if (!isUuid(id)) return { kind: "not_found" };
  const businessId = await currentBusinessId(tx);
  await lockPractitionerList(tx, businessId);
  await lockAppointments(tx, businessId);

  const target = await tx.select({ id: practitioners.id }).from(practitioners).where(activeOf(businessId, id)).limit(1);
  if (target.length === 0) return { kind: "not_found" };

  const [activeCount] = await tx
    .select({ count: count() })
    .from(practitioners)
    .where(and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt)));
  if ((activeCount?.count ?? 0) <= 1) return { kind: "last" };

  const [upcoming] = await tx
    .select({ count: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(appointments.practitionerId, id),
        eq(appointments.status, "booked"),
        gt(appointments.startsAt, now),
      ),
    );
  const upcomingCount = upcoming?.count ?? 0;
  if (upcomingCount > 0) return { kind: "has_upcoming", count: upcomingCount };

  await tx.update(practitioners).set({ archivedAt: now }).where(activeOf(businessId, id));
  return { kind: "archived" };
}

// ---------------------------------------------------------------------------------------------------------------
// Own hours
// ---------------------------------------------------------------------------------------------------------------

export type PractitionerScheduleInput =
  | { readonly usesClinicHours: true }
  | { readonly usesClinicHours: false; readonly hours: readonly BusinessHoursInput[] };

/**
 * Switches `id` between the clinic's hours and their own, replacing their own hours wholesale in the same
 * transaction: the old rows are deleted and `input.hours` inserted, so a CHECK failure on any new row (see
 * practitioner_hours_open_times_check) throws and leaves the old hours in place. Switching to clinic hours deletes
 * their own rows outright, since they are only ever read while uses_clinic_hours is false and a stale set would
 * otherwise resurface, unasked for, the next time the clinic switched back. False when `id` is not a UUID or is not
 * this business's.
 *
 * Serialised per practitioner with an advisory lock ("practitioner_hours:" prefix), same reasoning as
 * replaceOpeningHours: two saves racing must not interleave their delete-then-insert.
 */
export async function setPractitionerSchedule(
  tx: ScopedTransaction,
  id: string,
  input: PractitionerScheduleInput,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const businessId = await currentBusinessId(tx);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('practitioner_hours:' || ${id}, 0))`);

  const updated = await tx
    .update(practitioners)
    .set({ usesClinicHours: input.usesClinicHours })
    .where(and(eq(practitioners.id, id), eq(practitioners.businessId, businessId)))
    .returning({ id: practitioners.id });
  if (updated.length === 0) return false;

  await tx
    .delete(practitionerHours)
    .where(and(eq(practitionerHours.practitionerId, id), eq(practitionerHours.businessId, businessId)));
  if (!input.usesClinicHours && input.hours.length > 0) {
    await tx.insert(practitionerHours).values(
      input.hours.map((row) => ({
        businessId,
        practitionerId: id,
        dayOfWeek: row.dayOfWeek,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        closed: row.closed,
        openAllDay: row.openAllDay,
      })),
    );
  }
  return true;
}

/** Ordered by day, then by opening time, like getBusinessHours. Empty when `id` is not a UUID, is another
 * business's, or uses the clinic's hours. */
export async function listPractitionerHours(tx: ScopedTransaction, id: string): Promise<BusinessHoursRow[]> {
  if (!isUuid(id)) return [];
  const businessId = await currentBusinessId(tx);
  return tx
    .select(PRACTITIONER_HOURS_COLUMNS)
    .from(practitionerHours)
    .where(and(eq(practitionerHours.practitionerId, id), eq(practitionerHours.businessId, businessId)))
    .orderBy(asc(practitionerHours.dayOfWeek), asc(practitionerHours.opensAt), asc(practitionerHours.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------------------------------------------

/** Ordered by the day it starts, so the soonest leave reads first (same as listClosures). */
export async function listPractitionerLeave(tx: ScopedTransaction, id: string): Promise<LeaveRow[]> {
  if (!isUuid(id)) return [];
  const businessId = await currentBusinessId(tx);
  return tx
    .select(LEAVE_COLUMNS)
    .from(practitionerLeave)
    .where(and(eq(practitionerLeave.practitionerId, id), eq(practitionerLeave.businessId, businessId)))
    .orderBy(asc(practitionerLeave.startsOn), asc(practitionerLeave.id));
}

/** Null when `id` is not a UUID or is not this business's practitioner -- checked first, so the caller gets a plain
 * not-found rather than the composite foreign key's violation. The date order and note length are left to the
 * table's CHECKs. */
export async function addPractitionerLeave(
  tx: ScopedTransaction,
  id: string,
  leave: { readonly startsOn: string; readonly endsOn: string; readonly note: string | null },
): Promise<LeaveRow | null> {
  if (!isUuid(id)) return null;
  const businessId = await currentBusinessId(tx);
  if (!(await ownsPractitioner(tx, businessId, id))) return null;
  const rows = await tx
    .insert(practitionerLeave)
    .values({ businessId, practitionerId: id, startsOn: leave.startsOn, endsOn: leave.endsOn, note: blankToNull(leave.note) })
    .returning(LEAVE_COLUMNS);
  const row = rows[0];
  if (row === undefined) throw new Error("Practitioner leave insert returned no row");
  return row;
}

/** False when `leaveId` is not a UUID, does not exist, or belongs to another business. */
export async function removePractitionerLeave(tx: ScopedTransaction, leaveId: string): Promise<boolean> {
  if (!isUuid(leaveId)) return false;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .delete(practitionerLeave)
    .where(and(eq(practitionerLeave.id, leaveId), eq(practitionerLeave.businessId, businessId)))
    .returning({ id: practitionerLeave.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// System (staff connection)
// ---------------------------------------------------------------------------------------------------------------

export interface PractitionerScheduleRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly photoMediaId: string | null;
  readonly usesClinicHours: boolean;
  /** Their own weekly hours; always empty while `usesClinicHours` is true, when the clinic's hours apply instead. */
  readonly hours: readonly BusinessHoursRow[];
  readonly leave: readonly LeaveRow[];
}

/**
 * Use with the staff connection. Every active practitioner of `businessId`, in display order, with everything the
 * slot engine needs to know when each one works: their own hours (only for those not on clinic hours) and their
 * leave. Three queries in parallel -- practitioners, hours, leave -- grouped here, rather than one pair of queries
 * per practitioner. Hours and leave are joined to the active practitioners so an archived doctor's rows never
 * leave the database, and leave that ended before yesterday is left out (it can no longer affect any slot).
 */
export async function readPractitionerSchedules(db: Database, businessId: string): Promise<PractitionerScheduleRow[]> {
  const activeOfBusiness = and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt));
  const [practitionerRows, hoursRows, leaveRows] = await Promise.all([
    db
      .select({
        id: practitioners.id,
        name: practitioners.name,
        title: practitioners.title,
        photoMediaId: practitioners.photoMediaId,
        usesClinicHours: practitioners.usesClinicHours,
      })
      .from(practitioners)
      .where(activeOfBusiness)
      .orderBy(asc(practitioners.position), asc(practitioners.id)),
    db
      .select({ practitionerId: practitionerHours.practitionerId, ...PRACTITIONER_HOURS_COLUMNS })
      .from(practitionerHours)
      .innerJoin(practitioners, eq(practitioners.id, practitionerHours.practitionerId))
      .where(and(activeOfBusiness, eq(practitionerHours.businessId, businessId), eq(practitioners.usesClinicHours, false)))
      .orderBy(asc(practitionerHours.dayOfWeek), asc(practitionerHours.opensAt), asc(practitionerHours.id)),
    db
      .select({ practitionerId: practitionerLeave.practitionerId, ...LEAVE_COLUMNS })
      .from(practitionerLeave)
      .innerJoin(practitioners, eq(practitioners.id, practitionerLeave.practitionerId))
      // Leave that is wholly in the past can never block a bookable slot, so it stays in the database. ends_on is a
      // date in the clinic's own time zone while current_date is the database session's, which can be up to a day
      // ahead of (or behind) the clinic's local date; keeping anything that ended yesterday or later leaves a
      // one-day margin so no zone ever loses leave that is still today where the clinic is.
      .where(
        and(
          activeOfBusiness,
          eq(practitionerLeave.businessId, businessId),
          sql`${practitionerLeave.endsOn} >= current_date - 1`,
        ),
      )
      .orderBy(asc(practitionerLeave.startsOn), asc(practitionerLeave.id)),
  ]);

  const hoursBy = new Map<string, BusinessHoursRow[]>();
  for (const { practitionerId, ...row } of hoursRows) {
    const list = hoursBy.get(practitionerId) ?? [];
    list.push(row);
    hoursBy.set(practitionerId, list);
  }
  const leaveBy = new Map<string, LeaveRow[]>();
  for (const { practitionerId, ...row } of leaveRows) {
    const list = leaveBy.get(practitionerId) ?? [];
    list.push(row);
    leaveBy.set(practitionerId, list);
  }
  return practitionerRows.map((row) => ({ ...row, hours: hoursBy.get(row.id) ?? [], leave: leaveBy.get(row.id) ?? [] }));
}

/**
 * The active practitioners of `businessId` among `candidateIds`, as a set. For bookSlot and reassignAppointment,
 * which must refuse an archived or another business's practitioner before the composite foreign key would throw
 * on it. Non-UUID candidates are dropped rather than sent to Postgres, where they would fail the uuid cast.
 */
export async function activePractitionerIdsAmong(
  tx: ScopedTransaction,
  businessId: string,
  candidateIds: readonly string[],
): Promise<Set<string>> {
  const valid = candidateIds.filter(isUuid);
  if (valid.length === 0) return new Set();
  const rows = await tx
    .select({ id: practitioners.id })
    .from(practitioners)
    .where(and(eq(practitioners.businessId, businessId), isNull(practitioners.archivedAt), inArray(practitioners.id, valid)));
  return new Set(rows.map((row) => row.id));
}
