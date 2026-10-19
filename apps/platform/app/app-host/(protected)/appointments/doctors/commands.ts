/** Turns the Doctors page's raw `FormData` into typed commands, and the database's outcomes back into what the
 * clinic reads -- pure and independent of the database and of `"use server"`, same split as ../commands.ts: see
 * actions.ts, whose job is only to check access, run the command against the tenant-scoped transaction, and
 * translate the outcome back into a form state. */
import { z } from "zod";
import {
  MAX_ACTIVE_PRACTITIONERS,
  type AppointmentRow,
  type ArchivePractitionerResult,
  type PractitionerScheduleInput,
} from "@brandbasket/db";
import { parsePractitionerFields, type PractitionerFields } from "@brandbasket/shared/lib/appointments/practitioner-form";
import { parseClosureForm, type ClosureInput } from "@brandbasket/shared/lib/business-facts/forms";
import { textField, type FormParseResult } from "@brandbasket/shared/lib/form-result";
import { dayModeField } from "@brandbasket/shared/lib/onboarding/business-fields";
import { toStoredHours } from "@brandbasket/shared/lib/onboarding/hours";
import type { LeaveClash } from "@/lib/appointments/leave-added-state";
import { parseHoursForm } from "@/lib/onboarding/business-form";

export const DOCTOR_NOT_FOUND_MESSAGE = "That doctor could not be found. Reload the page.";
export const LEAVE_NOT_FOUND_MESSAGE = "That leave could not be found. Reload the page.";
export const DOCTOR_LIMIT_MESSAGE = `You can list up to ${String(MAX_ACTIVE_PRACTITIONERS)} doctors.`;
export const LAST_DOCTOR_MESSAGE = "Keep at least one doctor.";
export const LEAVE_PAST_MESSAGE = "Choose dates from today onwards.";
export const NO_WORKING_DAY_MESSAGE = "Set at least one working day, or choose Clinic hours.";
export const SCHEDULE_CHOICE_MESSAGE = "Choose clinic hours or own hours.";

/** The same refusal whether the id was malformed or simply isn't this business's, so it never reveals which. */
const DOCTOR_NOT_FOUND_RESULT: FormParseResult<never> = { success: false, field: null, message: DOCTOR_NOT_FOUND_MESSAGE };

const practitionerIdSchema = z.uuid();

/** The hidden `practitionerId` every per-doctor form carries, checked as a UUID here and again against the tenant's
 * own rows by each packages/db function, which reports not-found rather than touching another business's row. */
function practitionerIdOf(formData: FormData): string | null {
  const parsed = practitionerIdSchema.safeParse(textField(formData, "practitionerId"));
  return parsed.success ? parsed.data : null;
}

function fieldsOf(formData: FormData): FormParseResult<PractitionerFields> {
  return parsePractitionerFields({ name: textField(formData, "name"), title: textField(formData, "title") });
}

/** "Add a doctor": a name and an optional title. Where the new doctor lands in the list, and the 20-doctor limit,
 * are addPractitioner's to decide under its list lock. */
export function parseAddDoctorCommand(formData: FormData): FormParseResult<PractitionerFields> {
  return fieldsOf(formData);
}

export interface UpdateDoctorCommand {
  readonly practitionerId: string;
  readonly fields: PractitionerFields;
}

/** One doctor's own name-and-title form. The id is checked first: a stale or tampered form has nothing worth
 * pointing at a field for. */
export function parseUpdateDoctorCommand(formData: FormData): FormParseResult<UpdateDoctorCommand> {
  const practitionerId = practitionerIdOf(formData);
  if (practitionerId === null) return DOCTOR_NOT_FOUND_RESULT;
  const fields = fieldsOf(formData);
  if (!fields.success) return fields;
  return { success: true, data: { practitionerId, fields: fields.data } };
}

export interface ScheduleCommand {
  readonly practitionerId: string;
  readonly schedule: PractitionerScheduleInput;
}

/**
 * The schedule form: a `schedule` radio ("clinic" or "own") and, for "own", the same weekly fields the Your details
 * hours editor sends, parsed by the very same parseHoursForm so a doctor's hours can never accept something the
 * clinic's own hours would refuse (or the reverse). With "clinic", any hours fields that came along are ignored --
 * the editor stays in the form, just disabled, so switching back and forth keeps what was typed.
 *
 * Own hours with no day open (every day Not set or Closed) are refused: that doctor could never be booked, which
 * is what archiving or leave is for, and a clinic that meant "same as the clinic" should say so instead.
 */
export function parseScheduleCommand(formData: FormData): FormParseResult<ScheduleCommand> {
  const practitionerId = practitionerIdOf(formData);
  if (practitionerId === null) return DOCTOR_NOT_FOUND_RESULT;

  const choice = textField(formData, "schedule");
  if (choice === "clinic") return { success: true, data: { practitionerId, schedule: { usesClinicHours: true } } };
  if (choice !== "own") return { success: false, field: "schedule", message: SCHEDULE_CHOICE_MESSAGE };

  const hours = parseHoursForm(formData);
  if (!hours.success) return { success: false, field: hours.field, message: hours.message };
  if (!hours.data.some((day) => day.mode === "open" || day.mode === "all-day")) {
    return { success: false, field: dayModeField(0), message: NO_WORKING_DAY_MESSAGE };
  }
  return {
    success: true,
    data: { practitionerId, schedule: { usesClinicHours: false, hours: hours.data.map(toStoredHours) } },
  };
}

export interface AddLeaveCommand {
  readonly practitionerId: string;
  readonly leave: ClosureInput;
}

/** A stretch of leave for one doctor: the clinic closures form's own fields, parsed by the same parseClosureForm,
 * since leave is the same fact about one doctor rather than the whole clinic. Whether its last day has already
 * passed needs the business's time zone, so actions.ts checks that inside its transaction. */
export function parseAddLeaveCommand(formData: FormData): FormParseResult<AddLeaveCommand> {
  const practitionerId = practitionerIdOf(formData);
  if (practitionerId === null) return DOCTOR_NOT_FOUND_RESULT;
  const leave = parseClosureForm(formData);
  if (!leave.success) return leave;
  return { success: true, data: { practitionerId, leave: leave.data } };
}

const leaveIdSchema = z.uuid();

export function parseRemoveLeaveCommand(formData: FormData): FormParseResult<{ readonly leaveId: string }> {
  const parsed = leaveIdSchema.safeParse(textField(formData, "leaveId"));
  if (!parsed.success) return { success: false, field: null, message: LEAVE_NOT_FOUND_MESSAGE };
  return { success: true, data: { leaveId: parsed.data } };
}

export type MoveDirection = "up" | "down";

export interface MoveDoctorCommand {
  readonly practitionerId: string;
  readonly direction: MoveDirection;
}

/** The up and down arrows beside each doctor. Both post here, the hidden `direction` field telling them apart; any
 * other value means a tampered form, answered like a missing doctor. */
export function parseMoveDoctorCommand(formData: FormData): FormParseResult<MoveDoctorCommand> {
  const practitionerId = practitionerIdOf(formData);
  const direction = textField(formData, "direction");
  if (practitionerId === null || (direction !== "up" && direction !== "down")) return DOCTOR_NOT_FOUND_RESULT;
  return { success: true, data: { practitionerId, direction } };
}

export function parseArchiveDoctorCommand(formData: FormData): FormParseResult<{ readonly practitionerId: string }> {
  const practitionerId = practitionerIdOf(formData);
  if (practitionerId === null) return DOCTOR_NOT_FOUND_RESULT;
  return { success: true, data: { practitionerId } };
}

/** Why archivePractitioner refused, in the clinic's words, or null once it went through. `name` is the doctor's
 * name as the page showed it, so the message reads "Dr Rahul Menon has 4 upcoming bookings…" rather than "This
 * doctor…". */
export function archiveRefusalMessage(name: string, result: ArchivePractitionerResult): string | null {
  switch (result.kind) {
    case "archived":
      return null;
    case "has_upcoming":
      return result.count === 1
        ? `${name} has 1 upcoming booking. Reassign or cancel it first.`
        : `${name} has ${String(result.count)} upcoming bookings. Reassign or cancel them first.`;
    case "last":
      return LAST_DOCTOR_MESSAGE;
    case "not_found":
      return DOCTOR_NOT_FOUND_MESSAGE;
  }
}

/** The appointment fields leaveClashes reads -- a subset of AppointmentRow, so the tests need not build a whole
 * row. */
export type ClashCandidate = Pick<
  AppointmentRow,
  "id" | "practitionerId" | "patientName" | "localDate" | "localStart" | "localEnd" | "status"
>;

/**
 * The bookings a clinic now has to deal with after putting `practitionerId` on leave: theirs, still booked (a
 * cancelled one needs nothing, and a done one is already past), on a day inside the leave. Leave still saves over
 * them -- nothing is cancelled automatically -- so reception can reassign or cancel each one knowingly. `rows` is
 * listAppointmentsForDates' result for the leave's own dates, already in date-then-time order, which this keeps.
 */
export function leaveClashes(
  rows: readonly ClashCandidate[],
  practitionerId: string,
  leave: Pick<ClosureInput, "startsOn" | "endsOn">,
): LeaveClash[] {
  return rows
    .filter(
      (row) =>
        row.practitionerId === practitionerId &&
        row.status === "booked" &&
        row.localDate >= leave.startsOn &&
        row.localDate <= leave.endsOn,
    )
    .map((row) => ({
      appointmentId: row.id,
      patientName: row.patientName,
      localDate: row.localDate,
      localStart: row.localStart,
      localEnd: row.localEnd,
    }));
}
