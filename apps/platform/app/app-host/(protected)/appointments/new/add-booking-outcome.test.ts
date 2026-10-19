import { BookingClosedError, PatientNotFoundError, PatientOverlapError, SlotTakenError, type AppointmentRow } from "@brandbasket/db";
import { describe, expect, it, vi } from "vitest";
import type { ManualBookingCommand } from "@brandbasket/shared/lib/patients/patient-form";
import type { ClinicSlotResolution } from "@/lib/server/clinic-booking";
import { MODULE_OFF_MESSAGE } from "../errors";
import {
  addBookingRefusalState,
  DOCTOR_NOT_FOUND_MESSAGE,
  runAddBooking,
  SLOT_CLOSED_MESSAGE,
  SLOT_PAST_MESSAGE,
  PATIENT_BUSY_MESSAGE,
  SLOT_TAKEN_MESSAGE,
  type AddBookingDeps,
  type AddBookingRefusal,
  type TenantCheck,
} from "./add-booking-outcome";

// patient-form.ts parses phones through a server-only module; only its constants are used here.
vi.mock("server-only", () => ({}));

const PATIENT_ID = "0192f3c4-2222-7000-8000-000000000002";
const SERVICE_ID = "0192f3c4-3333-7000-8000-000000000003";
const APPOINTMENT_ID = "0192f3c4-4444-7000-8000-000000000004";

const NEW_PATIENT: ManualBookingCommand = {
  date: "2026-10-01",
  start: "10:00",
  practitionerId: null,
  serviceId: SERVICE_ID,
  patient: { kind: "new", name: "Asha Rao", phone: "+919820011223" },
};

const BOOK_AGAIN: ManualBookingCommand = { ...NEW_PATIENT, serviceId: null, patient: { kind: "existing", patientId: PATIENT_ID } };

const FREE: ClinicSlotResolution = {
  kind: "free",
  start: "10:00",
  end: "10:30",
  startsAt: new Date("2026-10-01T04:30:00Z"),
  endsAt: new Date("2026-10-01T05:00:00Z"),
  practitionerIds: ["p1", "p2"],
};

const TENANT_OK: TenantCheck = { kind: "ok", serviceName: "Cleaning", person: { name: "Asha Rao", phone: "+919820011223" } };

function booked(): AppointmentRow {
  return { id: APPOINTMENT_ID, localDate: "2026-10-01" } as AppointmentRow;
}

function deps(overrides: Partial<AddBookingDeps> = {}): AddBookingDeps {
  return {
    checkTenant: vi.fn(async () => TENANT_OK),
    resolveSlot: vi.fn(async () => FREE),
    book: vi.fn(async () => booked()),
    ...overrides,
  };
}

describe("runAddBooking", () => {
  it("books a new patient with the free doctors as candidates, as a clinic booking with the service's name", async () => {
    const book = vi.fn<AddBookingDeps["book"]>(async () => booked());
    const outcome = await runAddBooking(NEW_PATIENT, deps({ book }));

    expect(outcome).toEqual({ kind: "booked", appointmentId: APPOINTMENT_ID, date: "2026-10-01" });
    expect(book).toHaveBeenCalledWith({
      patientName: "Asha Rao",
      phone: "+919820011223",
      source: "clinic",
      serviceId: SERVICE_ID,
      serviceName: "Cleaning",
      localDate: "2026-10-01",
      localStart: "10:00",
      localEnd: "10:30",
      startsAt: FREE.startsAt,
      endsAt: FREE.endsAt,
      practitionerIds: ["p1", "p2"],
    });
  });

  it("books Book again's patient by id, under the name and phone the register holds", async () => {
    const book = vi.fn<AddBookingDeps["book"]>(async () => booked());
    const checkTenant = vi.fn(async (): Promise<TenantCheck> => ({ kind: "ok", serviceName: null, person: { name: "Ravi K", phone: "+919800000001" } }));
    await runAddBooking(BOOK_AGAIN, deps({ book, checkTenant }));

    expect(book).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT_ID, patientName: "Ravi K", phone: "+919800000001", serviceId: null, serviceName: null }),
    );
  });

  it("stops at the tenant check before reading the slot", async () => {
    for (const refusal of [{ kind: "module_off" }, { kind: "patient_not_found" }, { kind: "service_not_found" }] as const) {
      const resolveSlot = vi.fn(async () => FREE);
      const book = vi.fn(async () => booked());
      expect(await runAddBooking(BOOK_AGAIN, deps({ checkTenant: vi.fn(async () => refusal), resolveSlot, book }))).toEqual(refusal);
      expect(resolveSlot).not.toHaveBeenCalled();
      expect(book).not.toHaveBeenCalled();
    }
  });

  it("maps every slot refusal without booking", async () => {
    const cases: ReadonlyArray<readonly [ClinicSlotResolution, AddBookingRefusal]> = [
      [{ kind: "unavailable" }, { kind: "module_off" }],
      [{ kind: "doctor_not_found" }, { kind: "doctor_not_found" }],
      [{ kind: "closed" }, { kind: "closed" }],
      [{ kind: "past" }, { kind: "past" }],
      [{ kind: "taken" }, { kind: "taken" }],
    ];
    for (const [resolution, expected] of cases) {
      const book = vi.fn(async () => booked());
      expect(await runAddBooking(NEW_PATIENT, deps({ resolveSlot: vi.fn(async () => resolution), book }))).toEqual(expected);
      expect(book).not.toHaveBeenCalled();
    }
  });

  it("maps bookSlot's own refusals", async () => {
    const failing = (error: Error): AddBookingDeps => deps({ book: vi.fn(async () => Promise.reject(error)) });
    expect(await runAddBooking(NEW_PATIENT, failing(new SlotTakenError()))).toEqual({ kind: "taken" });
    expect(await runAddBooking(NEW_PATIENT, failing(new PatientOverlapError()))).toEqual({ kind: "patient_busy" });
    expect(await runAddBooking(NEW_PATIENT, failing(new BookingClosedError()))).toEqual({ kind: "module_off" });
    expect(await runAddBooking(BOOK_AGAIN, failing(new PatientNotFoundError()))).toEqual({ kind: "patient_not_found" });
  });

  it("lets an unexpected failure through for the action to log", async () => {
    const boom = new Error("connection reset");
    await expect(runAddBooking(NEW_PATIENT, deps({ book: vi.fn(async () => Promise.reject(boom)) }))).rejects.toBe(boom);
  });
});

describe("addBookingRefusalState", () => {
  function formData(): FormData {
    const data = new FormData();
    data.set("name", "Asha Rao");
    data.set("serviceId", SERVICE_ID);
    return data;
  }

  it("echoes what was typed with each refusal's message", () => {
    expect(addBookingRefusalState({ kind: "taken" }, formData())).toEqual({
      status: "error",
      message: SLOT_TAKEN_MESSAGE,
      field: null,
      values: { name: "Asha Rao", serviceId: SERVICE_ID },
    });
    expect(addBookingRefusalState({ kind: "patient_busy" }, formData())).toMatchObject({ message: PATIENT_BUSY_MESSAGE, field: null });
    expect(addBookingRefusalState({ kind: "past" }, formData())).toMatchObject({ message: SLOT_PAST_MESSAGE, field: null });
    expect(addBookingRefusalState({ kind: "closed" }, formData())).toMatchObject({ message: SLOT_CLOSED_MESSAGE, field: null });
    expect(addBookingRefusalState({ kind: "doctor_not_found" }, formData())).toMatchObject({ message: DOCTOR_NOT_FOUND_MESSAGE, field: null });
    expect(addBookingRefusalState({ kind: "module_off" }, formData())).toMatchObject({ message: MODULE_OFF_MESSAGE, field: null });
    expect(addBookingRefusalState({ kind: "patient_not_found" }, formData())).toMatchObject({
      message: "That patient could not be found. Refresh the page and try again.",
      field: null,
    });
  });

  it("points a stale service at the service select", () => {
    expect(addBookingRefusalState({ kind: "service_not_found" }, formData())).toMatchObject({
      message: "Choose a service from the list.",
      field: "serviceId",
    });
  });
});
