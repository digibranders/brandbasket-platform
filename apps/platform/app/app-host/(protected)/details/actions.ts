"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { z } from "zod";
import {
  addClosure,
  clearAnnouncement,
  deleteClosure,
  findBusinessTimeZone,
  listAppointmentsForDates,
  listEnabledModules,
  replaceOpeningHours,
  saveAnnouncement,
  withTenantScope,
} from "@brandbasket/db";
import { parseAnnouncementForm, parseClosureForm } from "@brandbasket/shared/lib/business-facts/forms";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { toStoredHours } from "@brandbasket/shared/lib/onboarding/hours";
import { closureClashes } from "@/lib/appointments/closure-clashes";
import { leaveAddedState, type LeaveClash } from "@/lib/appointments/leave-added-state";
import { parseHoursForm } from "@/lib/onboarding/business-form";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { holidayAccessOrNull } from "@/lib/server/holiday-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { closureInPastState, closureNotFoundState } from "./errors";

/** Thrown inside addClosureAction's transaction when the closure's last day has already passed in the business's
 * own time zone, so the catch block can tell that apart from any other failure. Never leaves this module. */
class ClosureInPastError extends Error {}

/** Saves the week's opening hours on their own, the same shape onboarding's business step writes but without that
 * step's lock — this runs for a paying customer in their panel, not mid-onboarding, so there is no concurrent
 * onboarding-step edit for that lock to guard against. */
export async function saveHoursAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseHoursForm(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    await withTenantScope(getAppDb(), access.tenant, (tx) => replaceOpeningHours(tx, parsed.data.map(toStoredHours)));
  } catch (error) {
    console.error("[details] saveHoursAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/details", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/details");
  return panelFormSavedState;
}

/** Creates or replaces the business's one announcement banner. */
export async function saveAnnouncementAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseAnnouncementForm(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    await withTenantScope(getAppDb(), access.tenant, (tx) => saveAnnouncement(tx, parsed.data, new Date()));
  } catch (error) {
    console.error("[details] saveAnnouncementAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/details", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/details");
  return panelFormSavedState;
}

/** Takes the announcement down. Nothing in the form is read — there's nothing to validate for a removal. */
export async function clearAnnouncementAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  try {
    await withTenantScope(getAppDb(), access.tenant, (tx) => clearAnnouncement(tx));
  } catch (error) {
    console.error("[details] clearAnnouncementAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/details", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/details");
  return panelFormSavedState;
}

/** Adds one closure to the business's list. Refuses one whose last day has already passed, in the business's own
 * time zone — read inside the same transaction that writes the closure, so the two never disagree about "today".
 *
 * A closure still saves over bookings that are already on those days: nothing is cancelled and no patient is told.
 * For a clinic with Appointments those bookings are read in the same transaction and handed back, so the form lists
 * them straight away (as a doctor's leave does) rather than leaving them booked on a closed day, unseen. */
export async function addClosureAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await holidayAccessOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseClosureForm(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  let clashes: readonly LeaveClash[];
  try {
    clashes = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const timeZone = await findBusinessTimeZone(tx, access.tenant.businessId);
      const today = localDateIn(timeZone ?? "UTC", new Date());
      if (parsed.data.endsOn < today) throw new ClosureInPastError();
      await addClosure(tx, parsed.data);
      // Only a clinic with Appointments has any: the table is not readable for one without the module.
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return [];
      return closureClashes(await listAppointmentsForDates(tx, parsed.data.startsOn, parsed.data.endsOn), parsed.data);
    });
  } catch (error) {
    if (error instanceof ClosureInPastError) return closureInPastState(formData);
    console.error("[details] addClosureAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/details", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/details");
  revalidatePath("/business");
  return clashes.length === 0 ? panelFormSavedState : leaveAddedState(clashes);
}

const closureIdSchema = z.uuid();

/** Removes one closure. `closureId` is client-supplied — checked as a UUID here, and again against the tenant's
 * own rows inside `deleteClosure`, which returns false rather than touching another business's row. A closure that
 * is simply gone already (another tab removed it first) still revalidates the page, so the list catches up; a
 * malformed id never reached the database, so there is nothing to catch up on. */
export async function deleteClosureAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await holidayAccessOrNull();
  if (access === null) return paymentRequiredState(formData);

  const rawId = formData.get("closureId");
  const id = closureIdSchema.safeParse(typeof rawId === "string" ? rawId : "");
  if (!id.success) return closureNotFoundState(formData);

  try {
    const removed = await withTenantScope(getAppDb(), access.tenant, (tx) => deleteClosure(tx, id.data));
    if (!removed) {
      revalidatePath("/details");
      revalidatePath("/business");
      return closureNotFoundState(formData);
    }
  } catch (error) {
    console.error("[details] deleteClosureAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/details", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/details");
  revalidatePath("/business");
  return panelFormSavedState;
}
