import { and, asc, eq, gt, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { ScopedTransaction } from "../scope";
import { appointments, businesses, patients } from "../schema";
import { listAppointmentsForPatient, type AppointmentRow } from "./appointments";
import { currentBusinessId, isUuid } from "./tenant";

/*
 * The clinic's patient register (docs/superpowers/specs/2026-09-29-clinic-patients-design.md). Every function here is
 * customer-scoped: it runs inside withTenantScope, and row-level security on patients (0051) also requires the
 * appointments module to be on, so with the module off reads come back empty and writes find nothing -- the same
 * behaviour as every appointments query.
 *
 * Patients are never inserted here: the appointments_link_patient trigger (0050) creates them from bookings. The
 * three writes that can race a booking -- editing a second phone, merging, erasing -- first take the same
 * per-business advisory lock bookSlot and reassignAppointment take
 * (`pg_advisory_xact_lock(hashtextextended('appointments:' || businessId, 0))`), so a booking cannot link itself to
 * a patient that is being merged away or erased, or create a patient from a number that is being given to another,
 * in between this code's check and its write.
 */

/** Erasing a patient renames each of their bookings to this; the guard trigger in 0051 accepts no other name. */
export const ERASED_PATIENT_NAME = "Deleted patient";

/** A patient may carry at most this many tags (patients_tags_check). */
export const MAX_PATIENT_TAGS = 5;

/** Between 1 and 200 inclusive, the most one list page shows. */
const MAX_PATIENT_LIST_LIMIT = 200;

/** The shortest run of digits a search matches against phone numbers: fewer would match nearly every number. */
const MIN_PHONE_SEARCH_DIGITS = 3;

/** "Not seen in 6 months": the last visit was before today minus this many months. */
const LAPSED_AFTER_MONTHS = 6;

export interface PatientRow {
  readonly id: string;
  readonly name: string;
  /** E.164, the number the patient was first booked with; never changes (the link trigger finds them by it). */
  readonly phone: string;
  readonly altPhone: string | null;
  readonly tags: readonly string[];
  /** When they were first seen: their earliest booking, or for a register row made before 0050, the earliest
   * booking the backfill found. */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const PATIENT_COLUMNS = {
  id: patients.id,
  name: patients.name,
  phone: patients.phone,
  altPhone: patients.altPhone,
  tags: patients.tags,
  createdAt: patients.createdAt,
  updatedAt: patients.updatedAt,
} as const;

async function lockBookings(tx: ScopedTransaction, businessId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('appointments:' || ${businessId}, 0))`);
}

// ---------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------

/** All; with an upcoming booking; created this calendar month; or last attended more than six months ago and
 * nothing booked since. */
export type PatientFilter = "all" | "upcoming" | "new" | "lapsed";

export interface ListPatientsInput {
  readonly filter: PatientFilter;
  /** Matched against the name (case-insensitive, anywhere in it) and, when it holds 3 or more digits, against the
   * digits of the phone and second phone. Blank lists everyone. */
  readonly search: string;
  /** "Upcoming" and the next visit are booked appointments starting after this instant. */
  readonly now: Date;
  /** Today in the business's time zone, "YYYY-MM-DD": the reference for "new this month" and "not seen in 6 months". */
  readonly today: string;
  /** Clamped to 1..200: one page of the list. */
  readonly limit: number;
  /** How many matching patients to skip first, for the pages after the first; negative counts as 0. */
  readonly offset: number;
}

export interface PatientListRow extends PatientRow {
  /** Bookings marked Attended. */
  readonly visits: number;
  readonly noShows: number;
  /** The latest Attended booking's local date, "YYYY-MM-DD". */
  readonly lastVisitDate: string | null;
  /** The earliest booked appointment starting after `now`. */
  readonly nextStartsAt: Date | null;
  readonly nextLocalDate: string | null;
  /** "HH:MM". */
  readonly nextLocalStart: string | null;
}

export interface PatientList {
  /** How many patients match the filter and search, before the limit and offset: what the pages are counted from.
   * A window count, so it rides on the returned rows -- an offset past the last match returns no rows and so a
   * total of 0, and the caller treats that as "no such page" rather than "no patients". */
  readonly total: number;
  readonly rows: readonly PatientListRow[];
}

/** Escapes LIKE's own wildcards (and its escape character) so a search for "50%" or "a_b" matches them literally. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function clampListLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PATIENT_LIST_LIMIT);
}

function clampListOffset(offset: number): number {
  return Number.isFinite(offset) ? Math.max(Math.trunc(offset), 0) : 0;
}

/**
 * The register list: every patient of the business matching `filter` and `search`, with their visit counts, last
 * visit and next booking, ordered by next visit (soonest first) for "upcoming" and by name otherwise. Visits and
 * no-shows are counted per patient in one grouped pass over the business's bookings, and the next booking is one
 * DISTINCT ON pass, so the whole list is three scans however many patients it has. `total` is a window count over
 * the same filtered set, taken before the limit and offset. Paged with limit/offset over a total order (the name
 * or next-visit order always ends in the patient id), so no patient is skipped or repeated between pages.
 */
export async function listPatients(tx: ScopedTransaction, input: ListPatientsInput): Promise<PatientList> {
  const businessId = await currentBusinessId(tx);

  const stats = tx
    .select({
      patientId: sql<string>`${appointments.patientId}`.as("stats_patient_id"),
      visits: sql<number>`count(*) filter (where ${appointments.status} = 'done')::int`.as("visits"),
      noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`.as("no_shows"),
      lastVisitDate: sql<string | null>`(max(${appointments.localDate}) filter (where ${appointments.status} = 'done'))::text`.as(
        "last_visit_date",
      ),
    })
    .from(appointments)
    .where(and(eq(appointments.businessId, businessId), isNotNull(appointments.patientId)))
    .groupBy(appointments.patientId)
    .as("stats");

  const next = tx
    .selectDistinctOn([appointments.patientId], {
      patientId: sql<string>`${appointments.patientId}`.as("next_patient_id"),
      startsAt: sql<string>`${appointments.startsAt}`.as("next_starts_at"),
      localDate: sql<string>`${appointments.localDate}::text`.as("next_local_date"),
      localStart: sql<string>`${appointments.localStart}::text`.as("next_local_start"),
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        isNotNull(appointments.patientId),
        eq(appointments.status, "booked"),
        gt(appointments.startsAt, input.now),
      ),
    )
    .orderBy(appointments.patientId, asc(appointments.startsAt), asc(appointments.id))
    .as("next");

  const conditions: SQL[] = [eq(patients.businessId, businessId)];

  const search = input.search.trim();
  if (search !== "") {
    const byName = sql`${patients.name} ilike ${likeContains(search)}`;
    const digits = search.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_SEARCH_DIGITS) {
      const byPhone = sql`(${patients.phone} like ${likeContains(digits)} or ${patients.altPhone} like ${likeContains(digits)})`;
      conditions.push(sql`(${byName} or ${byPhone})`);
    } else {
      conditions.push(byName);
    }
  }

  switch (input.filter) {
    case "upcoming":
      conditions.push(sql`${next.patientId} is not null`);
      break;
    case "new":
      // created_at is an instant; "this month" is the business's calendar month, so it is read in the business's
      // time zone (UTC for a business that has none, which cannot have the module on anyway).
      conditions.push(
        sql`(${patients.createdAt} at time zone coalesce((select ${businesses.timeZone} from ${businesses} where ${businesses.id} = ${businessId}), 'UTC'))::date
          >= date_trunc('month', ${input.today}::date)::date`,
      );
      break;
    case "lapsed":
      conditions.push(
        sql`${stats.lastVisitDate} is not null`,
        sql`${stats.lastVisitDate}::date < (${input.today}::date - make_interval(months => ${LAPSED_AFTER_MONTHS}))::date`,
        sql`${next.patientId} is null`,
      );
      break;
    case "all":
      break;
  }

  const order =
    input.filter === "upcoming"
      ? [sql`${next.startsAt} asc`, sql`lower(${patients.name}) asc`, asc(patients.id)]
      : [sql`lower(${patients.name}) asc`, asc(patients.id)];

  const rows = await tx
    .select({
      ...PATIENT_COLUMNS,
      visits: sql<number>`coalesce(${stats.visits}, 0)::int`,
      noShows: sql<number>`coalesce(${stats.noShows}, 0)::int`,
      lastVisitDate: stats.lastVisitDate,
      nextStartsAt: next.startsAt,
      nextLocalDate: next.localDate,
      nextLocalStart: next.localStart,
      total: sql<number>`(count(*) over ())::int`,
    })
    .from(patients)
    .leftJoin(stats, eq(stats.patientId, patients.id))
    .leftJoin(next, eq(next.patientId, patients.id))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(clampListLimit(input.limit))
    .offset(clampListOffset(input.offset));

  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map(({ total: _total, nextStartsAt, nextLocalStart, lastVisitDate, nextLocalDate, ...row }) => ({
      ...row,
      lastVisitDate: lastVisitDate ?? null,
      nextStartsAt: nextStartsAt === null ? null : new Date(nextStartsAt),
      nextLocalDate: nextLocalDate ?? null,
      nextLocalStart: nextLocalStart === null ? null : nextLocalStart.slice(0, 5),
    })),
  };
}

/** Every patient in the register: the Patients page's big number. */
export async function countPatients(tx: ScopedTransaction): Promise<number> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(patients)
    .where(eq(patients.businessId, businessId));
  return rows[0]?.count ?? 0;
}

export async function findPatient(tx: ScopedTransaction, id: string): Promise<PatientRow | null> {
  if (!isUuid(id)) return null;
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(PATIENT_COLUMNS)
    .from(patients)
    .where(and(eq(patients.id, id), eq(patients.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The patient whose phone or second phone is `phone` (E.164), preferring the one whose main number it is -- the
 * same rule the link trigger books by, so this finds the record a booking from that number would join. */
export async function findPatientByPhone(tx: ScopedTransaction, phone: string): Promise<PatientRow | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select(PATIENT_COLUMNS)
    .from(patients)
    .where(and(eq(patients.businessId, businessId), or(eq(patients.phone, phone), eq(patients.altPhone, phone))))
    .orderBy(sql`(${patients.phone} = ${phone}) desc`, asc(patients.createdAt), asc(patients.id))
    .limit(1);
  return rows[0] ?? null;
}

/** A patient's whole history, every booking whatever its outcome, newest first. Empty for another business's
 * patient or a malformed id. */
export async function listPatientAppointments(tx: ScopedTransaction, patientId: string): Promise<AppointmentRow[]> {
  if (!isUuid(patientId)) return [];
  return listAppointmentsForPatient(tx, patientId);
}

// ---------------------------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------------------------

export interface PatientEdit {
  readonly name: string;
  /** E.164, or null to clear it. */
  readonly altPhone: string | null;
  /** Already cleaned by the caller (packages/shared's patient form); at most five. */
  readonly tags: readonly string[];
}

export type UpdatePatientResult = "updated" | "not_found" | "phone_in_use";

/**
 * Saves the clinic's edit of a patient's name, second phone and tags. `phone_in_use` when the second phone is
 * already a number of another patient of this business (their phone or second phone) or this patient's own phone:
 * a number must lead the link trigger to one patient only. That check runs under the booking lock, so a booking
 * cannot create a patient from the same number between the check and the save.
 */
export async function updatePatient(
  tx: ScopedTransaction,
  id: string,
  edit: PatientEdit,
  now: Date,
): Promise<UpdatePatientResult> {
  if (!isUuid(id)) return "not_found";
  const businessId = await currentBusinessId(tx);
  await lockBookings(tx, businessId);

  const patient = await findPatient(tx, id);
  if (patient === null) return "not_found";

  if (edit.altPhone !== null) {
    if (edit.altPhone === patient.phone) return "phone_in_use";
    const [holder] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(
          eq(patients.businessId, businessId),
          ne(patients.id, id),
          or(eq(patients.phone, edit.altPhone), eq(patients.altPhone, edit.altPhone)),
        ),
      )
      .limit(1);
    if (holder !== undefined) return "phone_in_use";
  }

  const rows = await tx
    .update(patients)
    .set({ name: edit.name, altPhone: edit.altPhone, tags: [...edit.tags], updatedAt: now })
    .where(and(eq(patients.id, id), eq(patients.businessId, businessId)))
    .returning({ id: patients.id });
  return rows.length > 0 ? "updated" : "not_found";
}

/** Keep's tags, then the removed record's, without case-insensitive duplicates, capped at MAX_PATIENT_TAGS. */
function mergeTags(keep: readonly string[], removed: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...keep, ...removed]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }
  return merged.slice(0, MAX_PATIENT_TAGS);
}

export type MergePatientsResult = "merged" | "not_found" | "same";

/**
 * Folds `removeId` into `keepId`: every booking of the removed record moves to the kept one (keeping the name and
 * number it was booked with -- the guard trigger in 0051 allows exactly that shape), the removed record's phone
 * becomes the kept one's second phone when it has none (so its future bookings still land here), their tags are
 * combined, and the removed record is deleted. `same` when both ids are one patient; `not_found` when either is not
 * a patient of this business. Under the booking lock, so no booking can link itself to the removed record between
 * the move and the delete.
 */
export async function mergePatients(
  tx: ScopedTransaction,
  keepId: string,
  removeId: string,
  now: Date,
): Promise<MergePatientsResult> {
  if (!isUuid(keepId) || !isUuid(removeId)) return "not_found";
  if (keepId.toLowerCase() === removeId.toLowerCase()) return "same";
  const businessId = await currentBusinessId(tx);
  await lockBookings(tx, businessId);

  const [keep, remove] = await Promise.all([findPatient(tx, keepId), findPatient(tx, removeId)]);
  if (keep === null || remove === null) return "not_found";

  await tx
    .update(appointments)
    .set({ patientId: keep.id })
    .where(and(eq(appointments.businessId, businessId), eq(appointments.patientId, remove.id)));

  await tx.delete(patients).where(and(eq(patients.id, remove.id), eq(patients.businessId, businessId)));

  await tx
    .update(patients)
    .set({
      altPhone: keep.altPhone ?? remove.phone,
      tags: mergeTags(keep.tags, remove.tags),
      updatedAt: now,
    })
    .where(and(eq(patients.id, keep.id), eq(patients.businessId, businessId)));
  return "merged";
}

export type ErasePatientResult = "erased" | "not_found" | "has_upcoming";

/**
 * Deletes a patient and removes them from every one of their bookings: each keeps its slot, doctor, service and
 * outcome (so the calendar and counts still add up) but loses the patient link, phone, email, patient note and
 * clinic note, and is renamed ERASED_PATIENT_NAME. `has_upcoming` while any of their bookings is still booked and
 * starts after `now` -- the clinic cancels it first -- and the guard trigger in 0051 refuses the same case against
 * the database's own clock. Under the booking lock, so a new booking cannot link itself to the patient mid-erase.
 */
export async function erasePatient(tx: ScopedTransaction, id: string, now: Date): Promise<ErasePatientResult> {
  if (!isUuid(id)) return "not_found";
  const businessId = await currentBusinessId(tx);
  await lockBookings(tx, businessId);

  const patient = await findPatient(tx, id);
  if (patient === null) return "not_found";

  const [upcoming] = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        eq(appointments.patientId, id),
        eq(appointments.status, "booked"),
        gt(appointments.startsAt, now),
      ),
    )
    .limit(1);
  if (upcoming !== undefined) return "has_upcoming";

  await tx
    .update(appointments)
    .set({
      patientId: null,
      patientName: ERASED_PATIENT_NAME,
      phone: null,
      email: null,
      patientNote: null,
      clinicNote: null,
    })
    .where(and(eq(appointments.businessId, businessId), eq(appointments.patientId, id)));

  const deleted = await tx
    .delete(patients)
    .where(and(eq(patients.id, id), eq(patients.businessId, businessId)))
    .returning({ id: patients.id });
  return deleted.length > 0 ? "erased" : "not_found";
}
