import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactElement } from "react";
import { findPatient, getBusinessProfile, listAppointmentServices, listPractitioners, withTenantScope } from "@brandbasket/db";
import { slotLabel } from "@brandbasket/shared/lib/appointments/slots";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { cn } from "@brandbasket/shared/lib/cn";
import { ANY_DOCTOR } from "@brandbasket/shared/lib/patients/fields";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { AddBookingDayPicker } from "@/components/panel/appointments/add-booking-day-picker";
import { AddBookingForm, type AddBookingPatient } from "@/components/panel/appointments/add-booking-form";
import { formatLongDate } from "@/lib/appointments/date-format";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { lastReceptionDate, loadClinicDay, RECEPTION_HORIZON_DAYS, type ClinicDaySlot } from "@/lib/server/clinic-booking";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { addBookingHref, dayViewHref, parseAddBookingParams, type AddBookingLink } from "./add-booking-params";
import { addBookingAction } from "./actions";

export const metadata: Metadata = { title: "Add booking" };

const OUT_OF_RANGE_MESSAGES: Readonly<Record<"past" | "too_far", string>> = {
  past: "That day has passed.",
  too_far: `Bookings open up to ${String(RECEPTION_HORIZON_DAYS)} days ahead.`,
};

const CHIP_CLASSES = "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm";
const CHIP_CURRENT = "bg-ink text-paper";
const CHIP_IDLE = "text-ink-soft hover:bg-paper-deep hover:text-ink";

interface AddBookingPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Reception's Add booking: pick a day and (with two or more doctors) a doctor, then a free time, then who it is for.
 * Every step is a link or a GET form, so the page is its own state and Back works; only the last step posts. Free
 * times come from the same engine as the website, without its minimum notice and with a 180-day window (see
 * lib/server/clinic-booking.ts); the action re-checks the time from fresh calendars before booking.
 *
 * `?patient=<id>` is Book again: the patient is read through the customer's own tenant scope, so another clinic's id
 * reads exactly like an unknown one, and either falls back to typing a new patient.
 */
export default async function AddBookingPage({ searchParams }: AddBookingPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const params = parseAddBookingParams(await searchParams);
  const now = new Date();

  const scoped = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const doctors = await listPractitioners(tx, { includeArchived: false });
    const services = await listAppointmentServices(tx, { includeArchived: false });
    const patient = params.patient === null ? null : await findPatient(tx, params.patient);
    // A new patient's phone starts on the clinic's own country: most patients live where the clinic is.
    const profile = patient === null ? await getBusinessProfile(tx) : null;
    return { doctors, services, patient, clinicPhone: profile?.phone ?? null };
  });

  // The business id is the session's own; nothing in the query string can name another business.
  const day = await loadClinicDay(tenant.businessId, params.date, params.doctor, now);

  const header = (closeDate: string | null): ReactElement => (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <h1 className="panel-title">Add booking</h1>
      <Link href={dayViewHref(closeDate)} className="link-underline text-sm text-ink-soft">
        Close
      </Link>
    </div>
  );

  if (day.kind === "unavailable") {
    return (
      <>
        {header(null)}
        <p className="mt-8 text-sm text-ink-soft">Booking isn&apos;t set up yet.</p>
      </>
    );
  }

  const { today, date } = day;
  const currentYear = Number(today.slice(0, 4));
  const lastDate = lastReceptionDate(today);
  const patient = scoped.patient;
  // Links carry only what still means something: a patient or doctor that was not found is dropped, so the message
  // about it shows once rather than on every step after.
  const doctorLink = day.kind === "doctor_not_found" ? null : params.doctor;
  const base: AddBookingLink = { date, doctor: doctorLink, patient: patient?.id ?? null, slot: null };
  const link = (overrides: Partial<AddBookingLink>): string => addBookingHref({ ...base, ...overrides });

  const freeSlots = day.kind === "ready" ? day.slots.filter((slot) => slot.state === "free") : [];
  const chosen = params.slot === null ? undefined : freeSlots.find((slot) => slot.start === params.slot);

  const formPatient: AddBookingPatient | null =
    patient === null ? null : { id: patient.id, name: patient.name, phoneText: displayPhoneText(patient.phone) ?? patient.phone };
  const defaultPhoneCountry = savedPhoneStart(scoped.clinicPhone).country ?? visitorPhoneCountry(await headers());

  return (
    <>
      {header(date)}
      {params.patient !== null && patient === null ? (
        <p role="status" className="mt-2 text-sm text-accent-deep">
          Patient not found.
        </p>
      ) : null}
      {patient === null ? null : <p className="mt-2 text-sm text-ink-soft">For {patient.name}</p>}

      {scoped.doctors.length >= 2 ? (
        <nav aria-label="Doctor" className="mt-6 flex flex-wrap gap-1">
          {[{ id: null, name: "Any doctor" } as const, ...scoped.doctors].map((doctor) => {
            const current = doctor.id === params.doctor;
            return (
              <Link
                key={doctor.id ?? ANY_DOCTOR}
                href={link({ doctor: doctor.id })}
                aria-current={current ? "page" : undefined}
                className={cn(CHIP_CLASSES, current ? CHIP_CURRENT : CHIP_IDLE)}
              >
                {doctor.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <AddBookingDayPicker
        date={date}
        dateLabel={formatLongDate(date, currentYear)}
        minDate={today}
        maxDate={lastDate}
        previousHref={date > today ? link({ date: addDays(date, -1) }) : null}
        todayHref={link({ date: today })}
        nextHref={date < lastDate ? link({ date: addDays(date, 1) }) : null}
        isToday={date === today}
        doctor={doctorLink}
        patient={patient?.id ?? null}
      />

      {day.kind === "out_of_range" ? (
        <p className="mt-6 text-sm text-ink-soft">{OUT_OF_RANGE_MESSAGES[day.reason]}</p>
      ) : day.kind === "doctor_not_found" ? (
        <p className="mt-6 text-sm text-ink-soft">Doctor not found.</p>
      ) : (
        <FreeTimes slots={freeSlots} chosen={params.slot} hrefFor={(start) => link({ slot: start })} />
      )}

      {day.kind === "ready" && params.slot !== null && chosen === undefined ? (
        <p role="status" className="mt-4 text-sm text-accent-deep">
          That time is no longer free.
        </p>
      ) : null}

      {chosen === undefined ? null : (
        <AddBookingForm
          key={`${date}T${chosen.start}`}
          action={addBookingAction}
          date={date}
          start={chosen.start}
          slotText={slotLabel(chosen.start, chosen.end)}
          doctor={doctorLink ?? ANY_DOCTOR}
          services={scoped.services.map((service) => ({ id: service.id, name: service.name }))}
          patient={formPatient}
          phoneCountries={phoneCountryOptions()}
          defaultPhoneCountry={defaultPhoneCountry}
        />
      )}
    </>
  );
}

interface FreeTimesProps {
  readonly slots: readonly ClinicDaySlot[];
  /** The time in the query string, whether or not it is still free. */
  readonly chosen: string | null;
  readonly hrefFor: (start: string) => string;
}

/** The day's free times as a wrap of small links; the picked one is marked current. */
function FreeTimes({ slots, chosen, hrefFor }: FreeTimesProps): ReactElement {
  if (slots.length === 0) return <p className="mt-6 text-sm text-ink-soft">No free times.</p>;
  return (
    <ul aria-label="Free times" className="mt-6 flex flex-wrap gap-2">
      {slots.map((slot) => {
        const current = slot.start === chosen;
        return (
          <li key={slot.start}>
            <Link
              href={hrefFor(slot.start)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "block rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors duration-300 ease-calm",
                current ? "border-ink bg-ink text-paper" : "border-line text-ink hover:bg-paper-deep",
              )}
            >
              {slotLabel(slot.start, slot.end)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
