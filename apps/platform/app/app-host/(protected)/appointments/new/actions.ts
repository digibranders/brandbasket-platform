"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { redirect } from "next/navigation";
import { bookSlot, findPatient, listAppointmentServices, listEnabledModules, withTenantScope, type ScopedTransaction } from "@brandbasket/db";
import { parseManualBooking, type ManualBookingCommand } from "@brandbasket/shared/lib/patients/patient-form";
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { loadClinicSlot } from "@/lib/server/clinic-booking";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { bookedHref } from "./add-booking-params";
import { addBookingRefusalState, runAddBooking, type AddBookingOutcome, type BookingPerson, type TenantCheck } from "./add-booking-outcome";

/** What the customer's own tenant scope must confirm before anything is booked. Row-level security scopes both reads
 * to the session's business, so another clinic's patient or service id reads exactly like one that never existed. */
async function checkTenant(tx: ScopedTransaction, businessId: string, command: ManualBookingCommand): Promise<TenantCheck> {
  const modules = await listEnabledModules(tx, businessId);
  if (!modules.includes("appointments")) return { kind: "module_off" };

  let person: BookingPerson;
  if (command.patient.kind === "existing") {
    const patient = await findPatient(tx, command.patient.patientId);
    if (patient === null) return { kind: "patient_not_found" };
    person = { name: patient.name, phone: patient.phone };
  } else {
    person = { name: command.patient.name, phone: command.patient.phone };
  }

  if (command.serviceId === null) return { kind: "ok", serviceName: null, person };
  const services = await listAppointmentServices(tx, { includeArchived: false });
  const service = services.find((candidate) => candidate.id === command.serviceId);
  if (service === undefined) return { kind: "service_not_found" };
  return { kind: "ok", serviceName: service.name, person };
}

/**
 * Reception's Add booking. The customer's own tenant scope checks what the customer may see (the module is on, Book
 * again's patient and the chosen service are this clinic's); the slot is then re-resolved from fresh calendars
 * (lib/server/clinic-booking.ts: no minimum notice, a 180-day window) and booked through bookSlot on the staff
 * connection, so the same advisory lock and overlap rules as an online booking apply. The staff connection is a
 * sanctioned exception (see getStaffDb in lib/server/db.ts): the business id it writes for is only ever the
 * session's own, never anything in the form.
 *
 * Succeeds by redirecting to the booking's day with its details open; `redirect` throws, so it runs after the
 * try/catch rather than inside it.
 */
export async function addBookingAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseManualBooking(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  const now = new Date();
  const { businessId } = access.tenant;

  let outcome: AddBookingOutcome;
  try {
    outcome = await runAddBooking(parsed.data, {
      checkTenant: (command) => withTenantScope(getAppDb(), access.tenant, (tx) => checkTenant(tx, businessId, command)),
      resolveSlot: (command) => loadClinicSlot(businessId, command.date, command.start, command.practitionerId, now),
      book: (appointment) => bookSlot(getStaffDb(), businessId, appointment, { ignorePause: true }),
    });
  } catch (error) {
    console.error("[appointments] addBookingAction failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/appointments/new", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  if (outcome.kind !== "booked") return addBookingRefusalState(outcome, formData);

  revalidatePath("/appointments");
  revalidatePath("/patients");
  redirect(bookedHref(outcome.date, outcome.appointmentId));
}
