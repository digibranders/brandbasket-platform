"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { redirect } from "next/navigation";
import {
  erasePatient,
  findPatient,
  findPatientByPhone,
  listEnabledModules,
  mergePatients,
  updatePatient,
  withTenantScope,
} from "@fynix/db";
import { parseErasePatient, parseMergeConfirm, parseMergeLookup, parsePatientEdit } from "@fynix/shared/lib/patients/patient-form";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import {
  editOutcomeProblem,
  eraseOutcomeProblem,
  mergeLookupProblem,
  mergeOutcomeProblem,
  runMergeLookupCommand,
  runPatientEditCommand,
} from "./commands";
import { moduleOffState } from "./errors";

/*
 * Every action here follows appointments/actions.ts: an unpaid business gets the pay-first refusal, the form is
 * parsed before anything is read, and the module check and the command run in one tenant-scoped transaction -- so a
 * business whose Appointments module was switched off between page load and submit gets a friendly refusal rather
 * than the empty result row-level security would give (patients are only visible while the module is on).
 *
 * A patient's name shows on their bookings too (listAppointmentsForDates reads the register's current name), so an
 * edit, merge or delete revalidates Appointments as well as the register.
 *
 * Redirects happen after the try block: `redirect` works by throwing, and the catch below would otherwise swallow it
 * as an unexpected error.
 */

const MODULE_OFF = "module-off";

function revalidateRegister(patientIds: readonly string[]): void {
  revalidatePath("/patients");
  for (const id of patientIds) revalidatePath(`/patients/${id}`);
  revalidatePath("/appointments");
}

/** The profile's Edit form: name, second phone and tags. Saves in place ("Saved."). */
export async function updatePatientAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parsePatientEdit(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return MODULE_OFF;
      return runPatientEditCommand(parsed.data, {
        findPatient: (patientId) => findPatient(tx, patientId),
        updatePatient: (patientId, edit) => updatePatient(tx, patientId, edit, now),
      });
    });
    if (outcome === MODULE_OFF) return moduleOffState(formData);
    const problem = editOutcomeProblem(outcome);
    if (problem !== null) return panelFormErrorState(problem, formData);
  } catch (error) {
    console.error("[patients] updatePatientAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/patients", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateRegister([parsed.data.patientId]);
  return panelFormSavedState;
}

/**
 * Merge, step one: finds the other record by the phone typed and moves the profile on to the confirm step
 * (`?merge=<its id>`), which reads that record's name and bookings afresh. The id rather than the number goes in the
 * address, so no phone number ends up in a URL, a history entry or a log.
 */
export async function lookupMergeAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseMergeLookup(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  let removeId: string;
  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return MODULE_OFF;
      return runMergeLookupCommand(parsed.data, {
        findPatient: (patientId) => findPatient(tx, patientId),
        findPatientByPhone: (phone) => findPatientByPhone(tx, phone),
      });
    });
    if (outcome === MODULE_OFF) return moduleOffState(formData);
    if (outcome.kind !== "found") return panelFormErrorState(mergeLookupProblem(outcome), formData);
    removeId = outcome.removeId;
  } catch (error) {
    console.error("[patients] lookupMergeAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/patients", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  redirect(`/patients/${parsed.data.keepId}?merge=${removeId}`);
}

/** Merge, step two: moves the other record's bookings here and removes it, then shows the kept profile. */
export async function mergePatientsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseMergeConfirm(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();
  const { keepId, removeId } = parsed.data;

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return MODULE_OFF;
      return mergePatients(tx, keepId, removeId, now);
    });
    if (outcome === MODULE_OFF) return moduleOffState(formData);
    const problem = mergeOutcomeProblem(outcome);
    if (problem !== null) return panelFormErrorState(problem, formData);
  } catch (error) {
    console.error("[patients] mergePatientsAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/patients", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateRegister([keepId, removeId]);
  redirect(`/patients/${keepId}?merged=1`);
}

/** Delete patient, after its confirm step: erases them from the register and every booking, then returns to the
 * list, which says so. */
export async function erasePatientAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseErasePatient(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();
  const { patientId } = parsed.data;

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return MODULE_OFF;
      return erasePatient(tx, patientId, now);
    });
    if (outcome === MODULE_OFF) return moduleOffState(formData);
    const problem = eraseOutcomeProblem(outcome);
    if (problem !== null) return panelFormErrorState(problem, formData);
  } catch (error) {
    console.error("[patients] erasePatientAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/patients", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateRegister([patientId]);
  redirect("/patients?deleted=1");
}
