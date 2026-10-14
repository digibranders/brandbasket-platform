import type { AppointmentRow, Database, ScopedTransaction } from "@firstfold/db";
import { findAppointment, listEnabledModules, reassignAppointment, transitionAppointment, withTenantScope } from "@firstfold/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull, PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { loadFreeDoctorIds } from "@/lib/server/free-doctors";
import { reassignAppointmentAction, transitionAppointmentAction } from "./actions";
import { ALREADY_UPDATED_MESSAGE, DOCTOR_NOT_FREE_MESSAGE, MODULE_OFF_MESSAGE, NOT_FOUND_MESSAGE, NOT_STARTED_MESSAGE } from "./errors";

/*
 * "Real logic, mocked dependency", same shape as details/actions.test.ts: paidCustomerOrNull, withTenantScope and
 * every packages/db query are hand-built doubles, but the actions' own control flow -- which error wins, when a
 * write happens, when the page revalidates -- runs for real, including the pure canRecordOutcome helper the
 * Attended and No-show branch calls (not mocked; it's plain logic, not an I/O boundary).
 */
vi.mock("@/lib/server/report-panel-error", () => ({ reportUnexpectedPanelError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/free-doctors", () => ({ loadFreeDoctorIds: vi.fn() }));
vi.mock("@/lib/server/blog-access", () => ({
  paidCustomerOrNull: vi.fn(),
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));
vi.mock("@firstfold/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firstfold/db")>();
  return {
    hasPostgresCode: actual.hasPostgresCode,
    CHECK_VIOLATION: actual.CHECK_VIOLATION,
    findAppointment: vi.fn(),
    listEnabledModules: vi.fn(),
    reassignAppointment: vi.fn(),
    transitionAppointment: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const APPOINTMENT_ID = "0192f3c4-2222-7000-8000-000000000002";
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

function tenant() {
  return {
    user: { id: "user-1", email: "ana@example.com", name: "Ana Diaz" },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Aster Physio", role: "owner" },
    billing: { hasAccess: true },
  } as never;
}

function form(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function appointment(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: APPOINTMENT_ID,
    practitionerId: "33333333-3333-3333-3333-33333333333a",
    patientId: "44444444-4444-4444-4444-44444444444a",
    patientName: "Arjun Menon",
    phone: "+919876543210",
    email: null,
    serviceId: null,
    serviceName: "Sports injury rehab",
    patientNote: null,
    localDate: "2026-09-28",
    localStart: "09:00",
    localEnd: "09:30",
    startsAt: new Date("2026-09-28T03:30:00Z"),
    endsAt: new Date("2026-09-28T04:00:00Z"),
    status: "booked",
    cancelReason: null,
    clinicNote: null,
    cancelledAt: null,
    doneAt: null,
    noShowAt: null,
    source: "online",
    createdAt: new Date("2026-09-20T00:00:00Z"),
    handledByUserId: null,
    seenAt: null,
    ...overrides,
  };
}

const IDLE: PanelFormState = { status: "idle" };

const mockedPaidCustomerOrNull = vi.mocked(paidCustomerOrNull);
const mockedWithTenantScope = vi.mocked(withTenantScope);
const mockedGetAppDb = vi.mocked(getAppDb);
const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedListEnabledModules = vi.mocked(listEnabledModules);
const mockedFindAppointment = vi.mocked(findAppointment);
const mockedTransitionAppointment = vi.mocked(transitionAppointment);
const mockedReassignAppointment = vi.mocked(reassignAppointment);
const mockedLoadFreeDoctorIds = vi.mocked(loadFreeDoctorIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetAppDb.mockReturnValue(appDb);
  mockedWithTenantScope.mockImplementation(async (_db, _scope, work) => work(appTx));
  mockedPaidCustomerOrNull.mockResolvedValue(tenant());
  mockedListEnabledModules.mockResolvedValue(["appointments"]);
});

describe("module switched off between page load and submit", () => {
  beforeEach(() => {
    mockedListEnabledModules.mockResolvedValue([]);
  });

  it("refuses to cancel", async () => {
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "cancel" }));
    expect(result).toMatchObject({ status: "error", message: MODULE_OFF_MESSAGE });
    expect(mockedTransitionAppointment).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("refuses to mark done, without even checking whether the slot has started", async () => {
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "done" }));
    expect(result).toMatchObject({ status: "error", message: MODULE_OFF_MESSAGE });
    expect(mockedFindAppointment).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a no-show, without even checking whether the slot has started", async () => {
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "no_show" }));
    expect(result).toMatchObject({ status: "error", message: MODULE_OFF_MESSAGE });
    expect(mockedFindAppointment).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("a transition that no longer applies", () => {
  it("reports a cancel of a booking someone else already moved on as already updated", async () => {
    mockedTransitionAppointment.mockResolvedValue(null);
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "cancel" }));
    expect(result).toMatchObject({ status: "error", message: ALREADY_UPDATED_MESSAGE });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("reports marking done a booking that's gone (or not this business's) as already updated", async () => {
    mockedFindAppointment.mockResolvedValue(null);
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "done" }));
    expect(result).toMatchObject({ status: "error", message: ALREADY_UPDATED_MESSAGE });
    expect(mockedTransitionAppointment).not.toHaveBeenCalled();
  });

  it("reports a no-show for a booking that's gone as already updated", async () => {
    mockedFindAppointment.mockResolvedValue(null);
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "no_show" }));
    expect(result).toMatchObject({ status: "error", message: ALREADY_UPDATED_MESSAGE });
    expect(mockedTransitionAppointment).not.toHaveBeenCalled();
  });

  it("reports a no-show the database refused after the check as already updated", async () => {
    mockedFindAppointment.mockResolvedValue(appointment({ status: "booked", startsAt: new Date("2000-01-01T00:00:00Z") }));
    mockedTransitionAppointment.mockResolvedValue(null);
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "no_show" }));
    expect(result).toMatchObject({ status: "error", message: ALREADY_UPDATED_MESSAGE });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});

describe.each(["done", "no_show"] as const)("recording %s before the slot has started", (action) => {
  it("refuses with its own message, distinct from already-updated, and never calls transitionAppointment", async () => {
    // A day from whenever the test runs, not a fixed date: the action reads the real clock, and a fixed "future" date
    // turns into a past one (and fails this test) as soon as the calendar reaches it.
    mockedFindAppointment.mockResolvedValue(
      appointment({ status: "booked", startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
    );
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action }));
    expect(result).toMatchObject({ status: "error", message: NOT_STARTED_MESSAGE });
    expect(mockedTransitionAppointment).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("also refuses for a booking that's no longer in booked status, even if its slot has started", async () => {
    mockedFindAppointment.mockResolvedValue(appointment({ status: "cancelled", startsAt: new Date("2000-01-01T00:00:00Z") }));
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action }));
    expect(result).toMatchObject({ status: "error", message: NOT_STARTED_MESSAGE });
    expect(mockedTransitionAppointment).not.toHaveBeenCalled();
  });

  it("proceeds to transitionAppointment once the slot has started", async () => {
    mockedFindAppointment.mockResolvedValue(appointment({ status: "booked", startsAt: new Date("2000-01-01T00:00:00Z") }));
    mockedTransitionAppointment.mockResolvedValue(appointment({ status: action }));
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedTransitionAppointment).toHaveBeenCalledTimes(1);
    expect(mockedTransitionAppointment).toHaveBeenCalledWith(appTx, APPOINTMENT_ID, { action }, "user-1", expect.any(Date));
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/appointments");
  });
});

describe("payment required", () => {
  beforeEach(() => {
    mockedPaidCustomerOrNull.mockResolvedValue(null);
  });

  it("refuses to cancel", async () => {
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "cancel" }));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
  });

  it("refuses a no-show", async () => {
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "no_show" }));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("cancels and revalidates exactly once", async () => {
    mockedTransitionAppointment.mockResolvedValue(appointment({ status: "cancelled" }));
    const result = await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "cancel", reason: "Feeling better" }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(1);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/appointments");
  });

  it("cancels without re-reading the booking first: cancel is allowed before the slot starts", async () => {
    mockedTransitionAppointment.mockResolvedValue(appointment({ status: "cancelled" }));
    await transitionAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, action: "cancel" }));
    expect(mockedFindAppointment).not.toHaveBeenCalled();
  });
});

describe("reassignAppointmentAction", () => {
  const RAHUL_ID = "0192f3c4-3333-7000-8000-00000000000b";
  const future = (): AppointmentRow => appointment({ startsAt: new Date("2100-01-01T09:00:00Z"), endsAt: new Date("2100-01-01T09:30:00Z") });

  it("moves the booking to a free doctor and revalidates", async () => {
    mockedFindAppointment.mockResolvedValue(future());
    mockedLoadFreeDoctorIds.mockResolvedValue([RAHUL_ID]);
    mockedReassignAppointment.mockResolvedValue("reassigned");
    const result = await reassignAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedReassignAppointment).toHaveBeenCalledWith(appTx, APPOINTMENT_ID, RAHUL_ID, expect.any(Date));
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/appointments");
  });

  it("re-checks the submitted doctor and refuses one who isn't free, without moving anything", async () => {
    mockedFindAppointment.mockResolvedValue(future());
    mockedLoadFreeDoctorIds.mockResolvedValue([]);
    const result = await reassignAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toMatchObject({ status: "error", message: DOCTOR_NOT_FREE_MESSAGE });
    expect(mockedReassignAppointment).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("reports taken as not free", async () => {
    mockedFindAppointment.mockResolvedValue(future());
    mockedLoadFreeDoctorIds.mockResolvedValue([RAHUL_ID]);
    mockedReassignAppointment.mockResolvedValue("taken");
    const result = await reassignAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toMatchObject({ status: "error", message: DOCTOR_NOT_FREE_MESSAGE });
  });

  it("reports a booking that's gone as not found", async () => {
    mockedFindAppointment.mockResolvedValue(null);
    const result = await reassignAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toMatchObject({ status: "error", message: NOT_FOUND_MESSAGE });
    expect(mockedLoadFreeDoctorIds).not.toHaveBeenCalled();
  });

  it("refuses when the module is off", async () => {
    mockedListEnabledModules.mockResolvedValue([]);
    const result = await reassignAppointmentAction(IDLE, form({ appointmentId: APPOINTMENT_ID, practitionerId: RAHUL_ID }));
    expect(result).toMatchObject({ status: "error", message: MODULE_OFF_MESSAGE });
    expect(mockedFindAppointment).not.toHaveBeenCalled();
  });
});
