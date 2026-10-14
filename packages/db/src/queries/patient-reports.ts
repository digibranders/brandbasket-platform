import { and, asc, eq, exists, gte, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ScopedTransaction } from "../scope";
import { appointments, patients, practitioners } from "../schema";
import { currentBusinessId } from "./tenant";

/*
 * The clinic's Reports page (docs/superpowers/specs/2026-09-29-clinic-patients-design.md, "Reports"): counts only,
 * no medical data. Every number is aggregated in Postgres (COUNT ... FILTER, GROUP BY) so the page never pulls a
 * clinic's bookings into JS, however many it has. Like every appointments query this runs inside withTenantScope,
 * and row-level security on appointments, patients and practitioners also requires the appointments module to be
 * on, so with the module off every count is zero and every list is empty.
 *
 * Bookings are bucketed by `local_date`/`local_start`, which are already the clinic's wall-clock calendar. A
 * patient's `created_at` is an instant, so it is read in the business's time zone: the range bounds are turned
 * into instants with `AT TIME ZONE` (so the scan stays a plain comparison and is right across DST), and the month
 * buckets convert each row.
 */

/** The month chart always shows this many months, the last one being the range end's month. */
export const REPORT_MONTHS = 12;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class InvalidPatientReportInputError extends Error {
  constructor(detail: string) {
    super(`Invalid patient report input: ${detail}`);
    this.name = "InvalidPatientReportInputError";
  }
}

export interface PatientReportInput {
  /** First day of the range, "YYYY-MM-DD" in the business's calendar, inclusive. */
  readonly from: string;
  /** Last day of the range, "YYYY-MM-DD", inclusive; not before `from`. */
  readonly to: string;
  /** Any day of the month the 12-month chart ends at, "YYYY-MM-DD" (normally `to`). */
  readonly monthsEndingAt: string;
  /** The business's IANA time zone, which decides the calendar day a patient was created on. */
  readonly timeZone: string;
}

export interface PatientReportMonth {
  /** "YYYY-MM". */
  readonly month: string;
  readonly newPatients: number;
  /** Bookings marked Attended whose local date is in the month. */
  readonly visits: number;
}

export interface PatientReportHour {
  /** 0..23, the local start hour. */
  readonly hour: number;
  readonly count: number;
}

export interface PatientReportPractitioner {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /** Non-cancelled bookings in the range. */
  readonly bookings: number;
  readonly attended: number;
  readonly noShows: number;
}

export interface PatientReport {
  /** Patients first created (first booked) within the range. */
  readonly newPatients: number;
  /** Distinct patients with a non-cancelled booking in the range who had an Attended visit before it. */
  readonly returningPatients: number;
  /** Bookings in the range marked Attended. */
  readonly visits: number;
  readonly noShows: number;
  readonly cancellations: number;
  /** noShows / (visits + noShows), 0..1; null when neither happened, since a rate of nothing is not 0%. */
  readonly noShowRate: number | null;
  /** Non-cancelled bookings in the range: what the days, hours and online/clinic figures count. */
  readonly bookings: number;
  /** Exactly 12, oldest first, ending at `monthsEndingAt`'s month; a month with nothing in it is zeros. */
  readonly months: readonly PatientReportMonth[];
  /** Exactly 7 counts of non-cancelled bookings in the range, Monday first. */
  readonly weekdays: readonly number[];
  /** Exactly 24 entries, hour 0 to 23, including hours with no bookings (the page trims to the busy span). */
  readonly hours: readonly PatientReportHour[];
  /** Active practitioners, plus archived ones with bookings in the range, in the clinic's order. */
  readonly practitioners: readonly PatientReportPractitioner[];
  /** Non-cancelled bookings in the range made through the website. */
  readonly online: number;
  /** Non-cancelled bookings in the range added by the clinic. */
  readonly clinic: number;
}

function assertIsoDate(label: string, value: string): void {
  const match = ISO_DATE.exec(value);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (match === null || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidPatientReportInputError(`${label} must be a real "YYYY-MM-DD" date, got "${value}".`);
  }
}

/** packages/db cannot import @firstfold/shared, so the zone is checked with the runtime's own Intl, as
 * business-modules.ts does; Postgres would otherwise fail the whole report on an unknown name. */
function assertTimeZone(value: string): void {
  if (value.trim() === "") throw new InvalidPatientReportInputError("timeZone is empty.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    throw new InvalidPatientReportInputError(`"${value}" is not a time zone.`);
  }
}

/** The first day of `date`'s month shifted by `months`, "YYYY-MM-01". `date` must be a valid ISO date. */
function monthStart(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const shifted = new Date(Date.UTC(year, month, 1));
  return shifted.toISOString().slice(0, 10);
}

/** A type alias, not an interface: tx.execute wants a row type assignable to Record<string, unknown>. */
type MonthRow = {
  readonly month: string;
  readonly new_patients: number;
  readonly visits: number;
};

/**
 * Every figure on the Reports page for one range, in seven aggregate statements inside the caller's transaction.
 * Throws InvalidPatientReportInputError for a malformed date, `from` after `to`, or an unknown time zone.
 */
export async function readPatientReport(tx: ScopedTransaction, input: PatientReportInput): Promise<PatientReport> {
  assertIsoDate("from", input.from);
  assertIsoDate("to", input.to);
  assertIsoDate("monthsEndingAt", input.monthsEndingAt);
  if (input.from > input.to) throw new InvalidPatientReportInputError(`from ${input.from} is after to ${input.to}.`);
  assertTimeZone(input.timeZone);

  const businessId = await currentBusinessId(tx);
  const inRange = and(
    eq(appointments.businessId, businessId),
    gte(appointments.localDate, input.from),
    lte(appointments.localDate, input.to),
  );
  const notCancelled = sql`${appointments.status} <> 'cancelled'`;

  const [totals] = await tx
    .select({
      visits: sql<number>`count(*) filter (where ${appointments.status} = 'done')::int`,
      noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
      cancellations: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')::int`,
      bookings: sql<number>`count(*) filter (where ${notCancelled})::int`,
      online: sql<number>`count(*) filter (where ${notCancelled} and ${appointments.source} = 'online')::int`,
      clinic: sql<number>`count(*) filter (where ${notCancelled} and ${appointments.source} = 'clinic')::int`,
    })
    .from(appointments)
    .where(inRange);

  // The range as instants in the business's zone: from local midnight of `from` up to (not including) local
  // midnight of the day after `to`.
  const rangeStartsAt = sql`(${input.from}::date::timestamp at time zone ${input.timeZone})`;
  const rangeEndsAt = sql`((${input.to}::date + 1)::timestamp at time zone ${input.timeZone})`;
  const [created] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(patients)
    .where(
      and(
        eq(patients.businessId, businessId),
        sql`${patients.createdAt} >= ${rangeStartsAt}`,
        sql`${patients.createdAt} < ${rangeEndsAt}`,
      ),
    );

  const earlier = alias(appointments, "earlier");
  const [returning] = await tx
    .select({ count: sql<number>`count(distinct ${appointments.patientId})::int` })
    .from(appointments)
    .where(
      and(
        inRange,
        ne(appointments.status, "cancelled"),
        isNotNull(appointments.patientId),
        exists(
          tx
            .select({ one: sql`1` })
            .from(earlier)
            .where(
              and(
                eq(earlier.businessId, appointments.businessId),
                eq(earlier.patientId, appointments.patientId),
                eq(earlier.status, "done"),
                lt(earlier.localDate, input.from),
              ),
            ),
        ),
      ),
    );

  const weekday = sql<number>`extract(isodow from ${appointments.localDate})::int`;
  const hour = sql<number>`extract(hour from ${appointments.localStart})::int`;
  const weekdayRows = await tx
    .select({ weekday, count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(inRange, notCancelled))
    .groupBy(weekday);
  const hourRows = await tx
    .select({ hour, count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(and(inRange, notCancelled))
    .groupBy(hour);

  const firstMonth = monthStart(input.monthsEndingAt, -(REPORT_MONTHS - 1));
  const lastMonth = monthStart(input.monthsEndingAt, 0);
  const afterLastMonth = monthStart(input.monthsEndingAt, 1);
  const monthResult = await tx.execute<MonthRow>(sql`
    with months as (
      select generate_series(${firstMonth}::timestamp, ${lastMonth}::timestamp, interval '1 month')::date as month
    ),
    visits as (
      select date_trunc('month', ${appointments.localDate}::timestamp)::date as month, count(*)::int as n
      from ${appointments}
      where ${appointments.businessId} = ${businessId}
        and ${appointments.status} = 'done'
        and ${appointments.localDate} >= ${firstMonth}::date
        and ${appointments.localDate} < ${afterLastMonth}::date
      group by 1
    ),
    created as (
      select date_trunc('month', ${patients.createdAt} at time zone ${input.timeZone})::date as month, count(*)::int as n
      from ${patients}
      where ${patients.businessId} = ${businessId}
        and ${patients.createdAt} >= (${firstMonth}::timestamp at time zone ${input.timeZone})
        and ${patients.createdAt} < (${afterLastMonth}::timestamp at time zone ${input.timeZone})
      group by 1
    )
    select to_char(months.month, 'YYYY-MM') as month,
      coalesce(created.n, 0)::int as new_patients,
      coalesce(visits.n, 0)::int as visits
    from months
    left join visits on visits.month = months.month
    left join created on created.month = months.month
    order by months.month
  `);

  const practitionerBookings = sql<number>`count(${appointments.id}) filter (where ${notCancelled})::int`;
  const practitionerRows = await tx
    .select({
      id: practitioners.id,
      name: practitioners.name,
      archived: sql<boolean>`${practitioners.archivedAt} is not null`,
      bookings: practitionerBookings,
      attended: sql<number>`count(${appointments.id}) filter (where ${appointments.status} = 'done')::int`,
      noShows: sql<number>`count(${appointments.id}) filter (where ${appointments.status} = 'no_show')::int`,
    })
    .from(practitioners)
    .leftJoin(
      appointments,
      and(
        eq(appointments.practitionerId, practitioners.id),
        eq(appointments.businessId, practitioners.businessId),
        gte(appointments.localDate, input.from),
        lte(appointments.localDate, input.to),
      ),
    )
    .where(eq(practitioners.businessId, businessId))
    .groupBy(practitioners.id)
    .having(sql`${practitioners.archivedAt} is null or ${practitionerBookings} > 0`)
    .orderBy(asc(practitioners.position), asc(practitioners.id));

  const visits = totals?.visits ?? 0;
  const noShows = totals?.noShows ?? 0;
  const byWeekday = new Map(weekdayRows.map((row) => [row.weekday, row.count]));
  const byHour = new Map(hourRows.map((row) => [row.hour, row.count]));

  return {
    newPatients: created?.count ?? 0,
    returningPatients: returning?.count ?? 0,
    visits,
    noShows,
    cancellations: totals?.cancellations ?? 0,
    noShowRate: visits + noShows === 0 ? null : noShows / (visits + noShows),
    bookings: totals?.bookings ?? 0,
    months: monthResult.rows.map((row) => ({ month: row.month, newPatients: row.new_patients, visits: row.visits })),
    // isodow is 1 (Monday) .. 7 (Sunday).
    weekdays: Array.from({ length: 7 }, (_, index) => byWeekday.get(index + 1) ?? 0),
    hours: Array.from({ length: 24 }, (_, index) => ({ hour: index, count: byHour.get(index) ?? 0 })),
    practitioners: practitionerRows.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archived,
      bookings: row.bookings,
      attended: row.attended,
      noShows: row.noShows,
    })),
    online: totals?.online ?? 0,
    clinic: totals?.clinic ?? 0,
  };
}
