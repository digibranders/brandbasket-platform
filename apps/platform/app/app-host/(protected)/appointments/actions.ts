"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { findAppointment, listEnabledModules, reassignAppointment, transitionAppointment, withTenantScope } from "@brandbasket/db";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { canRecordOutcome } from "@/lib/appointments/booking-actions";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { loadFreeDoctorIds } from "@/lib/server/free-doctors";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { parseReassignCommand, parseTransitionCommand, runReassignCommand } from "./commands";
import { alreadyUpdatedState, doctorNotFreeState, moduleOffState, notFoundState, notStartedState } from "./errors";

/**
 * Cancel, Attended and No-show all post here, the details panel's hidden `action` field telling
 * `parseTransitionCommand` which. The module check and the transition run in one tenant-scoped transaction, so a
 * business whose Appointments module was switched off between page load and submit gets the same friendly refusal
 * a stale booking would.
 *
 * `transitionAppointment`'s own `done` and `no_show` edges also refuse a booking whose slot hasn't started yet
 * (`starts_at <= now`), returning null exactly as they would for any other disallowed transition --
 * indistinguishable, on its own, from a booking a teammate already moved on. For those two outcomes, this re-reads
 * the booking first and checks `canRecordOutcome` before attempting the transition, so that specific case gets its
 * own clear message instead of the generic "already updated". Cancel needs no such check: it is allowed before the
 * slot starts.
 */
export async function transitionAppointmentAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseTransitionCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;

      if (parsed.data.transition.action !== "cancel") {
        const current = await findAppointment(tx, parsed.data.appointmentId);
        if (current === null) return null;
        if (!canRecordOutcome(current, now)) return "not-started" as const;
      }

      return transitionAppointment(tx, parsed.data.appointmentId, parsed.data.transition, access.tenant.userId, now);
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (outcome === "not-started") return notStartedState(formData);
    if (outcome === null) return alreadyUpdatedState(formData);
  } catch (error) {
    console.error("[appointments] transitionAppointmentAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/appointments");
  return panelFormSavedState;
}

/**
 * Moves an upcoming booking to another doctor, from the details panel's Reassign select. The whole check-then-move
 * runs in one tenant-scoped transaction through runReassignCommand (./commands.ts): the booking is re-read, the
 * submitted doctor is re-checked against who is actually free for that slot right now (never trusted because the
 * select offered it), and only then does reassignAppointment take the booking lock and move it.
 */
export async function reassignAppointmentAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseReassignCommand(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();
  const { businessId } = access.tenant;

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return runReassignCommand(parsed.data, now, {
        findBooking: (appointmentId) => findAppointment(tx, appointmentId),
        freeDoctorIds: (booking) => loadFreeDoctorIds(tx, businessId, booking, now),
        reassign: (appointmentId, practitionerId) => reassignAppointment(tx, appointmentId, practitionerId, now),
      });
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (outcome === "not_free" || outcome === "taken") return doctorNotFreeState(formData);
    if (outcome === "not_found") return notFoundState(formData);
  } catch (error) {
    console.error("[appointments] reassignAppointmentAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/appointments");
  return panelFormSavedState;
}
