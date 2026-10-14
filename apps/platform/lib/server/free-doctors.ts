import "server-only";
import {
  findAppointmentSettings,
  findBusinessTimeZone,
  getBusinessHours,
  listAppointmentsForDates,
  listClosures,
  listPractitionerHours,
  listPractitionerLeave,
  listPractitioners,
  type AppointmentRow,
  type PractitionerScheduleRow,
  type ScopedTransaction,
} from "@firstfold/db";
import { freeDoctorsForBooking } from "@/lib/appointments/free-doctors";

/**
 * Reads, through the customer's own tenant-scoped transaction, everything `freeDoctorsForBooking`
 * (lib/appointments/free-doctors.ts) needs for one booking, and asks it. Deliberately not loadClinicCalendars
 * (./clinic-calendars.ts): that one is a staff-connection read for the public site, and the dashboard must never
 * see more than row-level security lets this customer see. Shared by the appointments page (which doctors to offer)
 * and the reassign action (re-checking the one submitted), so both answer from exactly the same reads.
 *
 * Reads run one after another, not in parallel: they share one transaction, and so one connection. A clinic has
 * at most MAX_ACTIVE_PRACTITIONERS (20) doctors, and only those on their own hours need an hours read.
 */
export async function loadFreeDoctorIds(
  tx: ScopedTransaction,
  businessId: string,
  booking: AppointmentRow,
  now: Date,
): Promise<readonly string[]> {
  if (booking.status !== "booked" || booking.startsAt.getTime() <= now.getTime()) return [];

  const timeZone = await findBusinessTimeZone(tx, businessId);
  const settings = await findAppointmentSettings(tx);
  if (timeZone === null || settings === null) return [];

  const practitioners = await listPractitioners(tx, { includeArchived: false });
  if (practitioners.length < 2) return [];

  const schedules: PractitionerScheduleRow[] = [];
  for (const practitioner of practitioners) {
    const hours = practitioner.usesClinicHours ? [] : await listPractitionerHours(tx, practitioner.id);
    const leave = await listPractitionerLeave(tx, practitioner.id);
    schedules.push({
      id: practitioner.id,
      name: practitioner.name,
      title: practitioner.title,
      photoMediaId: practitioner.photoMediaId,
      usesClinicHours: practitioner.usesClinicHours,
      hours,
      leave,
    });
  }

  const clinicHours = await getBusinessHours(tx);
  const closures = await listClosures(tx);
  const bookingsThatDay = await listAppointmentsForDates(tx, booking.localDate, booking.localDate);

  return freeDoctorsForBooking({
    booking,
    schedules,
    clinicHours,
    closures,
    bookingsThatDay,
    timeZone,
    slotMinutes: settings.slotMinutes,
    now,
  });
}
