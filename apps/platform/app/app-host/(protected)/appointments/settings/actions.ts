"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { z } from "zod";
import {
  addAppointmentService,
  listEnabledModules,
  renameAppointmentService,
  setAppointmentServiceArchived,
  updateAppointmentSettings,
  withTenantScope,
} from "@brandbasket/db";
import { parsePausedMessage, parseServiceName, parseSlotSettings } from "@brandbasket/shared/lib/appointments/settings-form";
import { textField } from "@brandbasket/shared/lib/form-result";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { moduleOffState, notFoundState } from "../errors";

/** Every action here revalidates both settings (what the clinic just changed) and the week grid (whose booked
 * cells show each appointment's service name, and whose slot rows are rebuilt from the current slot length the
 * next time it loads). */
function revalidateAppointments(): void {
  revalidatePath("/appointments/settings");
  revalidatePath("/appointments");
}

/** Switches online booking on or off, and saves the message shown to patients while it's paused. */
export async function saveBookingSettingsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const accepting = textField(formData, "accepting") === "on";
  const parsedMessage = parsePausedMessage(textField(formData, "pausedMessage"));
  if (!parsedMessage.success) return panelFormErrorState(parsedMessage, formData);

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return updateAppointmentSettings(tx, { accepting, pausedMessage: parsedMessage.data }, new Date());
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return notFoundState(formData);
  } catch (error) {
    console.error("[appointments] saveBookingSettingsAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/settings", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateAppointments();
  return panelFormSavedState;
}

/** Saves the week grid's own shape: how long each slot is, how much notice a booking needs, and how far ahead
 * patients can book. Kept as its own action (and its own Save button) rather than folded into
 * saveBookingSettingsAction: pausing booking and reshaping the grid are unrelated decisions a clinic makes at
 * different times, and mixing them into one form would mean a slot-length typo also blocks a paused-message
 * change, or the reverse. */
export async function saveSlotSettingsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseSlotSettings(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return updateAppointmentSettings(tx, parsed.data, new Date());
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return notFoundState(formData);
  } catch (error) {
    console.error("[appointments] saveSlotSettingsAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/settings", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateAppointments();
  return panelFormSavedState;
}

/** Adds a new service to the end of the booking form's list. */
export async function addServiceAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsedName = parseServiceName(textField(formData, "name"));
  if (!parsedName.success) return panelFormErrorState(parsedName, formData);

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return addAppointmentService(tx, parsedName.data);
    });
    if (outcome === "module-off") return moduleOffState(formData);
  } catch (error) {
    console.error("[appointments] addServiceAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/settings", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateAppointments();
  return panelFormSavedState;
}

const serviceIdSchema = z.uuid();

/** Renames one existing service. `serviceId` is client-supplied -- checked as a UUID here, and again against the
 * tenant's own rows inside `renameAppointmentService`, which returns false rather than touching another
 * business's row. */
export async function renameServiceAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const id = serviceIdSchema.safeParse(textField(formData, "serviceId"));
  if (!id.success) return notFoundState(formData);

  const parsedName = parseServiceName(textField(formData, "name"));
  if (!parsedName.success) return panelFormErrorState(parsedName, formData);

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return renameAppointmentService(tx, id.data, parsedName.data);
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return notFoundState(formData);
  } catch (error) {
    console.error("[appointments] renameServiceAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/settings", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateAppointments();
  return panelFormSavedState;
}

/** Archives or restores one service. The hidden `archived` field carries which: "true" from an Archive button,
 * "false" from a Restore one. */
export async function setServiceArchivedAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const id = serviceIdSchema.safeParse(textField(formData, "serviceId"));
  if (!id.success) return notFoundState(formData);
  const archived = textField(formData, "archived") === "true";

  try {
    const outcome = await withTenantScope(getAppDb(), access.tenant, async (tx) => {
      const modules = await listEnabledModules(tx, access.tenant.businessId);
      if (!modules.includes("appointments")) return "module-off" as const;
      return setAppointmentServiceArchived(tx, id.data, archived, new Date());
    });
    if (outcome === "module-off") return moduleOffState(formData);
    if (!outcome) return notFoundState(formData);
  } catch (error) {
    console.error("[appointments] setServiceArchivedAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/settings", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidateAppointments();
  return panelFormSavedState;
}
