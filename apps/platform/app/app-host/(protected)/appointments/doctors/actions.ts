"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import {
  addPractitioner,
  addPractitionerLeave,
  archivePractitioner,
  findBusinessTimeZone,
  listAppointmentsForDates,
  listEnabledModules,
  listPractitioners,
  movePractitioner,
  removePractitionerLeave,
  setPractitionerSchedule,
  updatePractitioner,
  withTenantScope,
  type ScopedTransaction,
} from "@firstfold/db";
import { localDateIn } from "@firstfold/shared/lib/calendar/local-date";
import { leaveAddedState, type LeaveClash } from "@/lib/appointments/leave-added-state";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { moduleOffState } from "../errors";
import {
  archiveRefusalMessage,
  DOCTOR_LIMIT_MESSAGE,
  DOCTOR_NOT_FOUND_MESSAGE,
  LEAVE_NOT_FOUND_MESSAGE,
  LEAVE_PAST_MESSAGE,
  leaveClashes,
  parseAddDoctorCommand,
  parseAddLeaveCommand,
  parseArchiveDoctorCommand,
  parseMoveDoctorCommand,
  parseRemoveLeaveCommand,
  parseScheduleCommand,
  parseUpdateDoctorCommand,
} from "./commands";

/** Every change here shows on the Doctors page itself and on the week grid, whose bookable rows and (with two or
 * more doctors) doctor filter are built from the list of doctors and each one's hours and leave. Appointments
 * settings only links here, so it has nothing to refresh. */
function revalidateDoctors(): void {
  revalidatePath("/appointments/doctors");
  revalidatePath("/appointments");
}

/** Runs `work` in the customer's tenant-scoped transaction, but only while the Appointments module is on -- read in
 * that same transaction, so a module switched off between page load and submit gets the friendly refusal rather
 * than the empty reads and not-found writes row-level security would otherwise hand back. */
async function inAppointmentsScope<T>(
  access: GrantedCustomer,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T | "module-off"> {
  return withTenantScope(getAppDb(), access.tenant, async (tx) => {
    const modules = await listEnabledModules(tx, access.tenant.businessId);
    if (!modules.includes("appointments")) return "module-off" as const;
    return work(tx);
  });
}

function doctorNotFoundState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: DOCTOR_NOT_FOUND_MESSAGE, field: null }, formData);
}

/** Adds a doctor to the end of the list. Refused once 20 are active, a limit addPractitioner enforces under its
 * list lock so two adds racing at 19 cannot both land. */
export async function addDoctorAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseAddDoctorCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, (tx) => addPractitioner(tx, parsed.data));
    if (outcome === "module-off") return moduleOffState(formData);
    if (outcome.kind === "limit") return panelFormErrorState({ message: DOCTOR_LIMIT_MESSAGE, field: "name" }, formData);
  } catch (error) {
    console.error("[appointments] addDoctorAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}

/** Renames and retitles one doctor. */
export async function updateDoctorAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseUpdateDoctorCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, (tx) =>
      updatePractitioner(tx, parsed.data.practitionerId, parsed.data.fields),
    );
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return doctorNotFoundState(formData);
  } catch (error) {
    console.error("[appointments] updateDoctorAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}

/** Switches one doctor between the clinic's hours and their own, replacing their own hours wholesale. */
export async function saveDoctorScheduleAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseScheduleCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, (tx) =>
      setPractitionerSchedule(tx, parsed.data.practitionerId, parsed.data.schedule),
    );
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return doctorNotFoundState(formData);
  } catch (error) {
    console.error("[appointments] saveDoctorScheduleAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}

/** Swaps one doctor with their neighbour above or below. False from movePractitioner means they were already at
 * that edge (another tab moved them first) or are gone; either way the page just needs to catch up, so it
 * revalidates rather than showing an error for a move that has, in effect, already happened. */
export async function moveDoctorAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseMoveDoctorCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, (tx) =>
      movePractitioner(tx, parsed.data.practitionerId, parsed.data.direction),
    );
    if (outcome === "module-off") return moduleOffState(formData);
  } catch (error) {
    console.error("[appointments] moveDoctorAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}

/**
 * Takes a doctor off every new booking. archivePractitioner refuses the last active doctor, and one who still has
 * upcoming bookings (with the count, so the message can say how many to deal with first). The doctor's name for
 * that message is read in the same transaction rather than taken from the form, so it is the name as saved.
 */
export async function archiveDoctorAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseArchiveDoctorCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, async (tx) => {
      const doctors = await listPractitioners(tx, { includeArchived: false });
      const name = doctors.find((doctor) => doctor.id === parsed.data.practitionerId)?.name ?? "This doctor";
      return archiveRefusalMessage(name, await archivePractitioner(tx, parsed.data.practitionerId, new Date()));
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (outcome !== null) return panelFormErrorState({ message: outcome, field: null }, formData);
  } catch (error) {
    console.error("[appointments] archiveDoctorAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}

/**
 * Adds leave for one doctor, then answers with the bookings that fall on it (see LeaveAddedState). Refuses leave
 * whose last day has already passed in the business's own time zone -- read inside the same transaction that
 * writes it, like addClosureAction on Your details, so the two never disagree about "today". The clashing
 * bookings are read in that transaction too, so the list matches exactly what the leave was saved over.
 */
export async function addDoctorLeaveAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseAddLeaveCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);
  const { practitionerId, leave } = parsed.data;

  let clashes: readonly LeaveClash[];
  try {
    const outcome = await inAppointmentsScope(access, async (tx) => {
      const timeZone = await findBusinessTimeZone(tx, access.tenant.businessId);
      if (leave.endsOn < localDateIn(timeZone ?? "UTC", new Date())) return "past" as const;
      const added = await addPractitionerLeave(tx, practitionerId, leave);
      if (added === null) return "not-found" as const;
      return leaveClashes(await listAppointmentsForDates(tx, leave.startsOn, leave.endsOn), practitionerId, leave);
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (outcome === "past") return panelFormErrorState({ message: LEAVE_PAST_MESSAGE, field: "endsOn" }, formData);
    if (outcome === "not-found") return doctorNotFoundState(formData);
    clashes = outcome;
  } catch (error) {
    console.error("[appointments] addDoctorLeaveAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return leaveAddedState(clashes);
}

/** Removes one stretch of leave. Leave that is simply gone already (another tab removed it first) still
 * revalidates, so the list catches up. */
export async function removeDoctorLeaveAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseRemoveLeaveCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await inAppointmentsScope(access, (tx) => removePractitionerLeave(tx, parsed.data.leaveId));
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) {
      revalidateDoctors();
      return panelFormErrorState({ message: LEAVE_NOT_FOUND_MESSAGE, field: null }, formData);
    }
  } catch (error) {
    console.error("[appointments] removeDoctorLeaveAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/doctors", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateDoctors();
  return panelFormSavedState;
}
