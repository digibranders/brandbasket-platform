/**
 * Add booking's command runner and its outcome -> form state mapping, pure apart from the injected reads and the
 * write (the same "real logic, injected dependency" shape as ../commands.ts's runReassignCommand), so the order of
 * checks and every refusal message are unit tested without a database. actions.ts supplies the dependencies: the
 * tenant-scoped checks, the staff-connection slot re-check (lib/server/clinic-booking.ts) and bookSlot.
 */
import { BookingClosedError, PatientNotFoundError, PatientOverlapError, SlotTakenError, type AppointmentRow, type NewAppointment } from "@brandbasket/db";
import { BOOKING_SERVICE_FIELD } from "@brandbasket/shared/lib/patients/fields";
import { CHOOSE_SERVICE_MESSAGE, PATIENT_NOT_FOUND_MESSAGE, type ManualBookingCommand } from "@brandbasket/shared/lib/patients/patient-form";
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";
import type { ClinicSlotResolution } from "@/lib/server/clinic-booking";
import { MODULE_OFF_MESSAGE } from "../errors";

export const SLOT_TAKEN_MESSAGE = "That time was just taken. Pick another.";
export const PATIENT_BUSY_MESSAGE = "This patient already has a booking at that time. Pick another time, or cancel the other booking first.";
export const SLOT_PAST_MESSAGE = "That time has passed. Pick another.";
export const SLOT_CLOSED_MESSAGE = "That time is no longer available. Pick another.";
export const DOCTOR_NOT_FOUND_MESSAGE = "That doctor could not be found. Pick another.";

export type AddBookingOutcome =
  | { readonly kind: "booked"; readonly appointmentId: string; readonly date: string }
  | { readonly kind: "module_off" }
  | { readonly kind: "patient_not_found" }
  | { readonly kind: "service_not_found" }
  | { readonly kind: "doctor_not_found" }
  | { readonly kind: "closed" }
  | { readonly kind: "past" }
  | { readonly kind: "taken" }
  /** The same patient (phone and name) already has a booking overlapping this time, with any doctor. */
  | { readonly kind: "patient_busy" };

export type AddBookingRefusal = Exclude<AddBookingOutcome, { readonly kind: "booked" }>;

/** Who the booking is for, as the tenant check read them: Book again's patient as the register has them now, or the
 * name and phone typed for someone new. */
export interface BookingPerson {
  readonly name: string;
  readonly phone: string;
}

export type TenantCheck =
  | { readonly kind: "module_off" }
  | { readonly kind: "patient_not_found" }
  | { readonly kind: "service_not_found" }
  | {
      readonly kind: "ok";
      /** The chosen service's name, snapshotted onto the booking; null for any service. */
      readonly serviceName: string | null;
      readonly person: BookingPerson;
    };

export interface AddBookingDeps {
  /** Run inside the customer's own tenant scope, so a foreign patient or service id simply isn't found: the module
   * is on, Book again's patient is this clinic's, and the service is one of its unarchived ones. */
  readonly checkTenant: (command: ManualBookingCommand) => Promise<TenantCheck>;
  /** The slot re-resolved from fresh calendars (never the page's reading of it). */
  readonly resolveSlot: (command: ManualBookingCommand) => Promise<ClinicSlotResolution>;
  /** bookSlot for the session's own business, ignoring the pause switch. */
  readonly book: (appointment: NewAppointment) => Promise<AppointmentRow>;
}

function newAppointmentFor(
  command: ManualBookingCommand,
  check: Extract<TenantCheck, { readonly kind: "ok" }>,
  slot: Extract<ClinicSlotResolution, { readonly kind: "free" }>,
): NewAppointment {
  return {
    // For Book again, bookSlot re-reads the patient under its lock and books under their name and phone as they are
    // then; these are only what the tenant check read a moment earlier.
    patientName: check.person.name,
    phone: check.person.phone,
    ...(command.patient.kind === "existing" ? { patientId: command.patient.patientId } : {}),
    source: "clinic",
    serviceId: command.serviceId,
    serviceName: check.serviceName,
    localDate: command.date,
    localStart: slot.start,
    localEnd: slot.end,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    practitionerIds: slot.practitionerIds,
  };
}

/**
 * Checks, in order: the tenant (module, patient, service), then the slot, then books. The slot is checked after the
 * tenant so a stale patient or service is reported even when the time is also gone -- the time is the easier of the
 * two to fix. bookSlot's own refusals (a race lost to another booking, the module switched off, the patient merged
 * or deleted) map onto the same outcomes as the pre-checks; anything else propagates for the action to log.
 */
export async function runAddBooking(command: ManualBookingCommand, deps: AddBookingDeps): Promise<AddBookingOutcome> {
  const check = await deps.checkTenant(command);
  if (check.kind !== "ok") return check;

  const slot = await deps.resolveSlot(command);
  if (slot.kind === "unavailable") return { kind: "module_off" };
  if (slot.kind !== "free") return slot;

  try {
    const booked = await deps.book(newAppointmentFor(command, check, slot));
    return { kind: "booked", appointmentId: booked.id, date: booked.localDate };
  } catch (error) {
    if (error instanceof SlotTakenError) return { kind: "taken" };
    if (error instanceof PatientOverlapError) return { kind: "patient_busy" };
    if (error instanceof BookingClosedError) return { kind: "module_off" };
    if (error instanceof PatientNotFoundError) return { kind: "patient_not_found" };
    throw error;
  }
}

const REFUSAL_MESSAGES: Readonly<Record<AddBookingRefusal["kind"], string>> = {
  module_off: MODULE_OFF_MESSAGE,
  // Book again's patient was merged away or deleted since the page loaded, or was never this clinic's.
  patient_not_found: PATIENT_NOT_FOUND_MESSAGE,
  // The service was archived since the page loaded, or was never this clinic's: the parser's own wording.
  service_not_found: CHOOSE_SERVICE_MESSAGE,
  doctor_not_found: DOCTOR_NOT_FOUND_MESSAGE,
  closed: SLOT_CLOSED_MESSAGE,
  past: SLOT_PAST_MESSAGE,
  taken: SLOT_TAKEN_MESSAGE,
  patient_busy: PATIENT_BUSY_MESSAGE,
};

/** The form state for a refusal, echoing back what was typed. Only the service names a field: it is the one refusal
 * whose fix is in the form itself; every other one is fixed by picking again above it. */
export function addBookingRefusalState(refusal: AddBookingRefusal, formData: FormData): PanelFormState {
  return panelFormErrorState(
    { message: REFUSAL_MESSAGES[refusal.kind], field: refusal.kind === "service_not_found" ? BOOKING_SERVICE_FIELD : null },
    formData,
  );
}
