import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactElement } from "react";
import {
  countUnseenBookings,
  findAppointment,
  findAppointmentSettings,
  findBusinessTimeZone,
  getBusinessHours,
  listAppointmentsForDates,
  listClosures,
  listPractitioners,
  markAppointmentSeen,
  withTenantScope,
  type AppointmentRow,
} from "@firstfold/db";
import { slotLabel } from "@firstfold/shared/lib/appointments/slots";
import { addDays, localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { displayPhoneText } from "@firstfold/shared/server/phone-display";
import { cn } from "@firstfold/shared/lib/cn";
import { AppointmentsDayColumns } from "@/components/panel/appointments/appointments-day-columns";
import { AppointmentsGrid } from "@/components/panel/appointments/appointments-grid";
import { AppointmentsList } from "@/components/panel/appointments/appointments-list";
import { BookingDetailsPanel } from "@/components/panel/appointments/booking-details-panel";
import { CancelledRedirectFocus } from "@/components/panel/appointments/cancelled-redirect-focus";
import { CustomRangeForm } from "@/components/panel/appointments/custom-range-form";
import { canRecordOutcome } from "@/lib/appointments/booking-actions";
import { formatLongDate, formatMonthTitle, formatWeekRangeLabel } from "@/lib/appointments/date-format";
import { bookingDoctorName, buildDayColumns, filterByPractitioner, resolveDoctorFilter, type DoctorRef } from "@/lib/appointments/doctors-view";
import { buildWeekGrid } from "@/lib/appointments/grid";
import { APPOINTMENTS_VIEWS, parseAppointmentsViewParams, type AppointmentsView, type AppointmentsViewParams } from "@/lib/appointments/view-params";
import { monthRange, shiftMonth } from "@/lib/appointments/view-ranges";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { loadFreeDoctorIds } from "@/lib/server/free-doctors";
import { reassignAppointmentAction, transitionAppointmentAction } from "./actions";

export const metadata: Metadata = { title: "Appointments" };

/** appointment_settings' own default (packages/db/migrations), used only when the settings row somehow hasn't
 * been read back yet -- in practice it's always seeded in the same transaction that first switches the module on
 * (see setBusinessModule), so this is a defensive fallback, not an expected path. */
const DEFAULT_SLOT_MINUTES = 30;

/** Above this, a list view (Today/Month/Custom -- Week's own grid never gets this big) stops rendering more rows,
 * so an ill-considered custom range can't ask the page to lay out thousands of them. */
const LIST_ROW_CAP = 500;

const CANCELLED_HEADING_ID = "cancelled-this-week-heading";

const VIEW_LABELS: Readonly<Record<AppointmentsView, string>> = { today: "Today", week: "Week", month: "Month", custom: "Custom" };

interface AppointmentsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Every view link (the segmented Today/Week/Month/Custom row, and each view's own Previous/Next/"jump back")
 * builds its href from exactly the params that view cares about -- switching views, or moving within one, always
 * drops `booking`: opening a different period isn't a reason to keep an unrelated booking's details open. The doctor
 * filter is the one thing every link carries along (last, so it reads as a filter on the view rather than part of
 * it): choosing a doctor and then paging through weeks, or switching to Month, should keep showing that doctor. */
function viewHref(params: Readonly<Record<string, string>>, doctor: string | null): string {
  const query = new URLSearchParams(params);
  if (doctor !== null) query.set("doctor", doctor);
  return `/appointments?${query.toString()}`;
}

/** The query string identifying the view currently on screen, with no `booking` -- what a list row's own link
 * (AppointmentsList's `baseHref`) and a details panel's `closeHref` both build on. */
function currentViewHref(viewParams: AppointmentsViewParams, doctor: string | null): string {
  if (viewParams.view === "today") return viewHref({ view: "today", day: viewParams.day }, doctor);
  if (viewParams.view === "month") return viewHref({ view: "month", month: viewParams.month }, doctor);
  if (viewParams.view === "custom") return viewHref({ view: "custom", from: viewParams.from, to: viewParams.to }, doctor);
  return viewHref({ view: "week", week: viewParams.week }, doctor);
}

/** How a clinic with several doctors narrows the page, and what each view needs to say which doctor a booking is
 * with. Built once by the page from its practitioner reads and handed to each view. */
interface DoctorContext {
  /** The chosen doctor's id, or null for All doctors (always null below two active doctors). */
  readonly filter: string | null;
  /** Active doctors, in display order: the doctor row's choices and the Today view's columns. */
  readonly active: readonly DoctorRef[];
  /** Every doctor, archived included, in display order -- for naming one an older booking is still with. */
  readonly all: readonly DoctorRef[];
  /** Names by id when bookings should carry their doctor's initials (All doctors, two or more active), else null. */
  readonly names: ReadonlyMap<string, string> | null;
}

/** The clinic's own appointments browser: Week is the Calendly-style grid (unchanged); Today, Month and Custom are
 * hairline-separated lists, for looking back through past records rather than laying out a schedule. The big "new"
 * number and marking a booking seen work the same in every view -- see the transaction below. There is no email
 * for a new booking; the count above is how a clinic notices one arrived. */
export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const sp = await searchParams;
  const rawBooking = typeof sp.booking === "string" ? sp.booking : undefined;
  const rawDoctor = typeof sp.doctor === "string" ? sp.doctor : undefined;
  const justCancelled = sp.closed === "cancelled";

  const now = new Date();

  const data = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const timeZone = await findBusinessTimeZone(tx, tenant.businessId);
    const settings = await findAppointmentSettings(tx);
    const today = localDateIn(timeZone ?? "UTC", now);
    const viewParams = parseAppointmentsViewParams(sp, today);

    // Opening a booking's details marks that one booking seen -- before the unseen count is read, so it already
    // reflects it on this same render (the big number counts one fewer, and the row/cell it came from loses its
    // "New" mark) rather than waiting for a later refresh.
    let booking = rawBooking === undefined ? null : await findAppointment(tx, rawBooking);
    if (booking !== null && booking.seenAt === null) {
      await markAppointmentSeen(tx, booking.id, now);
      booking = { ...booking, seenAt: now };
    }

    // Archived doctors too: a past booking can still be with one, and still needs a name. The filter row, the
    // Today columns and the Reassign choices only ever use the active ones.
    const doctors = await listPractitioners(tx, { includeArchived: true });
    const activeCount = doctors.filter((doctor) => doctor.archivedAt === null).length;
    // Reassign is only offered where reassignAppointment could accept it -- a booked booking that hasn't started --
    // and only with someone to move it to. Null hides the control; an empty list shows "No other doctor is free".
    const canReassign = booking !== null && booking.status === "booked" && booking.startsAt.getTime() > now.getTime() && activeCount >= 2;
    const reassignIds = booking !== null && canReassign ? await loadFreeDoctorIds(tx, tenant.businessId, booking, now) : null;

    if (viewParams.view === "week") {
      const weekEnd = addDays(viewParams.week, 6);
      const hours = await getBusinessHours(tx);
      const closures = await listClosures(tx);
      const appointments = await listAppointmentsForDates(tx, viewParams.week, weekEnd);
      const newCount = await countUnseenBookings(tx);
      return { timeZone, settings, today, viewParams, booking, doctors, reassignIds, newCount, week: { hours, closures, appointments }, list: null };
    }

    const range =
      viewParams.view === "today"
        ? { from: viewParams.day, to: viewParams.day }
        : viewParams.view === "month"
          ? monthRange(viewParams.month)
          : viewParams.rangeError === null
            ? { from: viewParams.from, to: viewParams.to }
            : null;
    const appointments = range === null ? [] : await listAppointmentsForDates(tx, range.from, range.to);
    const newCount = await countUnseenBookings(tx);
    return { timeZone, settings, today, viewParams, booking, doctors, reassignIds, newCount, week: null, list: { appointments } };
  });

  const timeZone = data.timeZone ?? "UTC";
  const currentYear = Number(data.today.slice(0, 4));
  const { viewParams } = data;

  const allDoctors: readonly DoctorRef[] = data.doctors.map((doctor) => ({ id: doctor.id, name: doctor.name }));
  const activeDoctors: readonly DoctorRef[] = data.doctors
    .filter((doctor) => doctor.archivedAt === null)
    .map((doctor) => ({ id: doctor.id, name: doctor.name }));
  const nameById = new Map(allDoctors.map((doctor) => [doctor.id, doctor.name]));
  const doctorFilter = resolveDoctorFilter(rawDoctor, activeDoctors);
  const doctors: DoctorContext = {
    filter: doctorFilter,
    active: activeDoctors,
    all: allDoctors,
    names: activeDoctors.length >= 2 && doctorFilter === null ? nameById : null,
  };
  // Narrowed once here, so every view (and the week's "Cancelled this week", and each list's count line) agrees on
  // which bookings are in scope. The big "new" number above stays clinic-wide on purpose: it's the same count as
  // the nav badge, and a new booking with another doctor is still news.
  const weekAppointments = filterByPractitioner(data.week?.appointments ?? [], doctorFilter);
  const listAppointments = filterByPractitioner(data.list?.appointments ?? [], doctorFilter);
  const reassignOptions =
    data.reassignIds === null ? null : activeDoctors.filter((doctor) => data.reassignIds?.includes(doctor.id) === true);

  const closeHref = currentViewHref(viewParams, doctorFilter);
  const isWeekView = viewParams.view === "week";
  const cancelledHref = isWeekView ? `${closeHref}&closed=cancelled` : closeHref;

  return (
    <>
      <h1 className="panel-title">Appointments</h1>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="heading-display text-5xl tabular-nums text-ink">{data.newCount}</span>
        <span className="text-sm text-ink-soft">new</span>
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <nav aria-label="View" className="flex gap-1">
          {APPOINTMENTS_VIEWS.map((candidate) => (
            <Link
              key={candidate}
              href={viewHref({ view: candidate }, doctorFilter)}
              aria-current={candidate === viewParams.view ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm",
                candidate === viewParams.view ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
              )}
            >
              {VIEW_LABELS[candidate]}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-x-6">
          <Link href="/appointments/new" className="link-underline text-sm font-medium text-ink">
            Add booking
          </Link>
          <Link href="/appointments/settings" className="link-underline text-sm font-medium text-ink">
            Settings
          </Link>
        </div>
      </div>

      {activeDoctors.length >= 2 ? (
        <nav aria-label="Doctor" className="mt-4 flex flex-wrap gap-1">
          {[{ id: null, name: "All doctors" } as const, ...activeDoctors].map((doctor) => {
            const current = doctor.id === doctorFilter;
            return (
              <Link
                key={doctor.id ?? "all"}
                href={currentViewHref(viewParams, doctor.id)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm",
                  current ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
                )}
              >
                {doctor.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {rawBooking === undefined ? null : data.booking === null ? (
        <p className="mt-8 border-t border-line pt-6 text-sm text-ink-soft">Booking not found.</p>
      ) : (
        <BookingDetailsPanel
          key={data.booking.id}
          appointment={data.booking}
          phoneText={displayPhoneText(data.booking.phone)}
          closeHref={closeHref}
          cancelledHref={cancelledHref}
          currentYear={currentYear}
          timeZone={timeZone}
          canRecordOutcome={canRecordOutcome(data.booking, now)}
          now={now}
          transitionAction={transitionAppointmentAction}
          doctorName={bookingDoctorName(data.booking.practitionerId, activeDoctors, allDoctors)}
          reassignOptions={reassignOptions}
          reassignAction={reassignAppointmentAction}
        />
      )}

      {viewParams.view === "today" ? (
        <TodayView day={viewParams.day} appointments={listAppointments} currentYear={currentYear} doctors={doctors} />
      ) : viewParams.view === "month" ? (
        <MonthView month={viewParams.month} appointments={listAppointments} currentYear={currentYear} doctors={doctors} />
      ) : viewParams.view === "custom" ? (
        <CustomView
          from={viewParams.from}
          to={viewParams.to}
          rangeError={viewParams.rangeError}
          appointments={listAppointments}
          currentYear={currentYear}
          doctors={doctors}
        />
      ) : (
        <WeekView
          week={viewParams.week}
          today={data.today}
          timeZone={timeZone}
          slotMinutes={data.settings?.slotMinutes ?? DEFAULT_SLOT_MINUTES}
          hours={data.week?.hours ?? []}
          closures={data.week?.closures ?? []}
          appointments={weekAppointments}
          currentYear={currentYear}
          justCancelled={justCancelled}
          doctors={doctors}
        />
      )}

      <Suspense fallback={null}>
        <CancelledRedirectFocus headingId={CANCELLED_HEADING_ID} />
      </Suspense>
    </>
  );
}

interface WeekViewProps {
  readonly week: string;
  readonly today: string;
  readonly timeZone: string;
  readonly slotMinutes: number;
  readonly hours: Parameters<typeof buildWeekGrid>[0]["hours"];
  readonly closures: Parameters<typeof buildWeekGrid>[0]["closures"];
  readonly appointments: readonly AppointmentRow[];
  readonly currentYear: number;
  readonly justCancelled: boolean;
  readonly doctors: DoctorContext;
}

/** The Calendly-style week grid -- unchanged from before the Today/Month/Custom views existed, just extracted out
 * of the page's default export so the four views read as siblings rather than one long branch. */
function WeekView({ week, today, timeZone, slotMinutes, hours, closures, appointments, currentYear, justCancelled, doctors }: WeekViewProps): ReactElement {
  const weekRangeLabel = formatWeekRangeLabel(week);
  const grid = buildWeekGrid({ weekStart: week, today, timeZone, hours, closures, slotMinutes, appointments });
  const cancelled = appointments.filter((appointment) => appointment.status === "cancelled");

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <h2 className="panel-section tabular-nums">{weekRangeLabel}</h2>
        <nav aria-label="Week" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href={viewHref({ view: "week", week: addDays(week, -7) }, doctors.filter)} className="link-underline text-ink">
            Previous
          </Link>
          <Link href={viewHref({ view: "week", week: today }, doctors.filter)} className="link-underline text-ink">
            This week
          </Link>
          <Link href={viewHref({ view: "week", week: addDays(week, 7) }, doctors.filter)} className="link-underline text-ink">
            Next
          </Link>
        </nav>
      </div>

      <AppointmentsGrid
        rows={grid.rows}
        days={grid.days}
        appointments={appointments}
        baseHref={viewHref({ view: "week", week }, doctors.filter)}
        currentYear={currentYear}
        weekRangeLabel={weekRangeLabel}
        doctorNames={doctors.names}
      />

      <section className="mt-10 border-t border-line pt-6">
        <h2 id={CANCELLED_HEADING_ID} tabIndex={-1} className="panel-section outline-none">
          Cancelled this week
        </h2>
        {justCancelled ? (
          <p role="status" aria-live="polite" className="mt-2 text-sm text-ink">
            Booking cancelled. The slot is free again.
          </p>
        ) : null}
        {cancelled.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {cancelled.map((appointment) => (
              <li key={appointment.id} className="py-3 text-sm">
                <p className="font-medium text-ink">{appointment.patientName}</p>
                <p className="mt-0.5 tabular-nums text-ink-soft">
                  {formatLongDate(appointment.localDate, currentYear)}, {slotLabel(appointment.localStart, appointment.localEnd)}
                  {appointment.cancelReason === null ? "" : ` · ${appointment.cancelReason}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** "12 bookings · 3 cancelled" (or just "12 bookings" when none are), above every list view's own rows. */
function countLine(total: number, cancelledCount: number): string {
  const base = `${String(total)} booking${total === 1 ? "" : "s"}`;
  return cancelledCount === 0 ? base : `${base} · ${String(cancelledCount)} cancelled`;
}

interface ListViewBodyProps {
  readonly appointments: readonly AppointmentRow[];
  readonly baseHref: string;
  readonly currentYear: number;
  readonly groupByDay: boolean;
  readonly emptyLabel: string;
  readonly doctorNames: ReadonlyMap<string, string> | null;
}

/** Shared by Today, Month and Custom: the row cap, the count line, the empty state, and the list itself. */
function ListViewBody({ appointments, baseHref, currentYear, groupByDay, emptyLabel, doctorNames }: ListViewBodyProps): ReactElement {
  if (appointments.length === 0) return <p className="mt-4 text-sm text-ink-soft">{emptyLabel}</p>;

  const capped = appointments.length > LIST_ROW_CAP;
  const cancelledCount = appointments.filter((appointment) => appointment.status === "cancelled").length;
  const shown = capped ? appointments.slice(0, LIST_ROW_CAP) : appointments;

  return (
    <>
      <p className="mt-4 text-sm tabular-nums text-ink-soft">{countLine(appointments.length, cancelledCount)}</p>
      {capped ? <p className="mt-1 text-sm text-ink-soft">Showing the first {LIST_ROW_CAP}. Narrow the range to see the rest.</p> : null}
      <AppointmentsList appointments={shown} baseHref={baseHref} currentYear={currentYear} groupByDay={groupByDay} doctorNames={doctorNames} />
    </>
  );
}

interface ListViewProps {
  readonly appointments: readonly AppointmentRow[];
  readonly currentYear: number;
  readonly doctors: DoctorContext;
}

/**
 * One day's bookings. With every doctor of a multi-doctor clinic in view, wide screens get a column per doctor
 * (AppointmentsDayColumns) and phones keep the plain list, each row with its doctor's initials; otherwise it is the
 * plain list alone, exactly as before doctors existed. Both layouts are rendered and CSS picks one, so there's no
 * client-side width check and no flash of the wrong one.
 */
function TodayView({ day, appointments, currentYear, doctors }: ListViewProps & { readonly day: string }): ReactElement {
  const baseHref = viewHref({ view: "today", day }, doctors.filter);
  const dayLabel = formatLongDate(day, currentYear);
  const byDoctor = doctors.names !== null && appointments.length > 0 && appointments.length <= LIST_ROW_CAP;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <h2 className="panel-section tabular-nums">{dayLabel}</h2>
        <nav aria-label="Day" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href={viewHref({ view: "today", day: addDays(day, -1) }, doctors.filter)} className="link-underline text-ink">
            Previous
          </Link>
          <Link href={viewHref({ view: "today" }, doctors.filter)} className="link-underline text-ink">
            Today
          </Link>
          <Link href={viewHref({ view: "today", day: addDays(day, 1) }, doctors.filter)} className="link-underline text-ink">
            Next
          </Link>
        </nav>
      </div>
      {byDoctor ? (
        <>
          <p className="mt-4 text-sm text-ink-soft">
            {countLine(appointments.length, appointments.filter((appointment) => appointment.status === "cancelled").length)}
          </p>
          <div className="hidden md:block">
            <AppointmentsDayColumns columns={buildDayColumns(appointments, doctors.active, doctors.all)} baseHref={baseHref} dayLabel={dayLabel} />
          </div>
          <div className="md:hidden">
            <AppointmentsList appointments={appointments} baseHref={baseHref} currentYear={currentYear} groupByDay={false} doctorNames={doctors.names} />
          </div>
        </>
      ) : (
        <ListViewBody
          appointments={appointments}
          baseHref={baseHref}
          currentYear={currentYear}
          groupByDay={false}
          emptyLabel="No bookings on this day."
          doctorNames={doctors.names}
        />
      )}
    </>
  );
}

function MonthView({ month, appointments, currentYear, doctors }: ListViewProps & { readonly month: string }): ReactElement {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <h2 className="panel-section">{formatMonthTitle(month)}</h2>
        <nav aria-label="Month" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href={viewHref({ view: "month", month: shiftMonth(month, -1) }, doctors.filter)} className="link-underline text-ink">
            Previous
          </Link>
          <Link href={viewHref({ view: "month" }, doctors.filter)} className="link-underline text-ink">
            This month
          </Link>
          <Link href={viewHref({ view: "month", month: shiftMonth(month, 1) }, doctors.filter)} className="link-underline text-ink">
            Next
          </Link>
        </nav>
      </div>
      <ListViewBody
        appointments={appointments}
        baseHref={viewHref({ view: "month", month }, doctors.filter)}
        currentYear={currentYear}
        groupByDay
        emptyLabel="No bookings this month."
        doctorNames={doctors.names}
      />
    </>
  );
}

function CustomView({
  from,
  to,
  rangeError,
  appointments,
  currentYear,
  doctors,
}: ListViewProps & {
  readonly from: string;
  readonly to: string;
  readonly rangeError: string | null;
}): ReactElement {
  return (
    <>
      <div className="mt-6 border-b border-line pb-4">
        <h2 className="panel-section">Custom range</h2>
        <CustomRangeForm from={from} to={to} rangeError={rangeError} doctor={doctors.filter} />
      </div>
      {rangeError === null ? (
        <ListViewBody
          appointments={appointments}
          baseHref={viewHref({ view: "custom", from, to }, doctors.filter)}
          currentYear={currentYear}
          groupByDay
          emptyLabel="No bookings in this range."
          doctorNames={doctors.names}
        />
      ) : null}
    </>
  );
}
