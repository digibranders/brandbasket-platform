import type { ClosureRow, Database, ScopedTransaction } from "@brandbasket/db";
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
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull, PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { CHECK_VIOLATION_MESSAGE, GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import {
  addClosureAction,
  clearAnnouncementAction,
  deleteClosureAction,
  saveAnnouncementAction,
  saveHoursAction,
} from "./actions";
import { CLOSURE_NOT_FOUND_MESSAGE, CLOSURE_PAST_MESSAGE } from "./errors";

/*
 * "Real logic, mocked dependency": paidCustomerOrNull, withTenantScope and every packages/db query are hand-built
 * doubles, but the actions' own control flow — which error wins, when a write happens, when the page revalidates —
 * runs for real. Same shape as content/blog/actions.test.ts's mocking pattern, adapted for this page's db-backed
 * writes rather than Payload's.
 */
vi.mock("@/lib/server/report-panel-error", () => ({ reportUnexpectedPanelError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
// These tests are about the closure logic, not who may add one (lib/server/holiday-access.test.ts): holiday access
// here is the paid-plan check they already drive.
vi.mock("@/lib/server/holiday-access", async () => {
  const { paidCustomerOrNull } = await import("@/lib/server/blog-access");
  return { holidayAccessOrNull: () => paidCustomerOrNull() };
});
vi.mock("@/lib/server/blog-access", () => ({
  paidCustomerOrNull: vi.fn(),
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));
vi.mock("@brandbasket/db", async (importOriginal) => {
  // hasPostgresCode/CHECK_VIOLATION are real: errors.ts uses them for its own check-violation detection, and that
  // walk is exactly what the "23514 nested inside a wrapper" test below is exercising.
  const actual = await importOriginal<typeof import("@brandbasket/db")>();
  return {
    hasPostgresCode: actual.hasPostgresCode,
    CHECK_VIOLATION: actual.CHECK_VIOLATION,
    addClosure: vi.fn(),
    clearAnnouncement: vi.fn(),
    deleteClosure: vi.fn(),
    findBusinessTimeZone: vi.fn(),
    listAppointmentsForDates: vi.fn(),
    listEnabledModules: vi.fn(),
    replaceOpeningHours: vi.fn(),
    saveAnnouncement: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const CLOSURE_ID = "0192f3c4-2222-7000-8000-000000000002";
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;

function tenant() {
  return {
    user: { id: "user-1", email: "ana@example.com", name: "Ana Diaz" },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" },
    billing: { hasAccess: true },
  } as never;
}

function form(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** A driver error carrying a Postgres error code, the shape errors.ts's postgresCodeOf looks for. */
class FakePgError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("db exploded");
    this.code = code;
  }
}

const IDLE: PanelFormState = { status: "idle" };

const mockedPaidCustomerOrNull = vi.mocked(paidCustomerOrNull);
const mockedWithTenantScope = vi.mocked(withTenantScope);
const mockedGetAppDb = vi.mocked(getAppDb);
const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedAddClosure = vi.mocked(addClosure);
const mockedDeleteClosure = vi.mocked(deleteClosure);
const mockedFindBusinessTimeZone = vi.mocked(findBusinessTimeZone);
const mockedListAppointmentsForDates = vi.mocked(listAppointmentsForDates);
const mockedListEnabledModules = vi.mocked(listEnabledModules);
const mockedReplaceOpeningHours = vi.mocked(replaceOpeningHours);
const mockedSaveAnnouncement = vi.mocked(saveAnnouncement);
const mockedClearAnnouncement = vi.mocked(clearAnnouncement);

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetAppDb.mockReturnValue(appDb);
  mockedWithTenantScope.mockImplementation(async (_db, _scope, work) => work(appTx));
  mockedPaidCustomerOrNull.mockResolvedValue(tenant());
  mockedFindBusinessTimeZone.mockResolvedValue("UTC");
  mockedReplaceOpeningHours.mockResolvedValue([]);
  mockedListEnabledModules.mockResolvedValue([]);
  mockedListAppointmentsForDates.mockResolvedValue([]);
});

describe("every action, for a business that has not paid", () => {
  beforeEach(() => {
    mockedPaidCustomerOrNull.mockResolvedValue(null);
  });

  it("refuses to save hours, echoing what was submitted and touching nothing", async () => {
    const result = await saveHoursAction(IDLE, form({ "hours.0.mode": "closed" }));
    expect(result).toEqual({
      status: "error",
      message: PAID_PLAN_REQUIRED_MESSAGE,
      field: null,
      values: { "hours.0.mode": "closed" },
    });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("refuses to save the announcement", async () => {
    const result = await saveAnnouncementAction(IDLE, form({ message: "Closed" }));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedSaveAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses to clear the announcement", async () => {
    const result = await clearAnnouncementAction(IDLE, form());
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedClearAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses to add a closure", async () => {
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedAddClosure).not.toHaveBeenCalled();
  });

  it("refuses to remove a closure", async () => {
    const result = await deleteClosureAction(IDLE, form({ closureId: CLOSURE_ID }));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedDeleteClosure).not.toHaveBeenCalled();
  });

  it("still lets any other failure through, so a real outage is not reported as unpaid", async () => {
    mockedPaidCustomerOrNull.mockRejectedValue(new Error("database is down"));
    await expect(saveHoursAction(IDLE, form())).rejects.toThrow("database is down");
  });
});

describe("a parser error", () => {
  it("passes a closure form's error straight through, echoing what was typed", async () => {
    const result = await addClosureAction(IDLE, form({ startsOn: "not-a-date", endsOn: "not-a-date", note: "Diwali" }));
    expect(result).toEqual({
      status: "error",
      message: "Choose the first closed day.",
      field: "startsOn",
      values: { startsOn: "not-a-date", endsOn: "not-a-date", note: "Diwali" },
    });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("passes an hours form's error straight through", async () => {
    const result = await saveHoursAction(IDLE, form({ "hours.0.mode": "sometimes" }));
    expect(result).toMatchObject({ status: "error", field: "hours.0.mode" });
    expect(mockedReplaceOpeningHours).not.toHaveBeenCalled();
  });
});

describe("deleteClosureAction", () => {
  it("refuses an id that isn't a UUID, without touching the database or revalidating", async () => {
    const result = await deleteClosureAction(IDLE, form({ closureId: "not-a-uuid" }));
    expect(result).toEqual({
      status: "error",
      message: CLOSURE_NOT_FOUND_MESSAGE,
      field: null,
      values: { closureId: "not-a-uuid" },
    });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("still revalidates when a valid id names no row of this business's — the list may just be stale", async () => {
    mockedDeleteClosure.mockResolvedValue(false);
    const result = await deleteClosureAction(IDLE, form({ closureId: CLOSURE_ID }));
    expect(result).toMatchObject({ status: "error", message: CLOSURE_NOT_FOUND_MESSAGE });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });

  it("removes the row and revalidates on success", async () => {
    mockedDeleteClosure.mockResolvedValue(true);
    const result = await deleteClosureAction(IDLE, form({ closureId: CLOSURE_ID }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedDeleteClosure).toHaveBeenCalledWith(appTx, CLOSURE_ID);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });
});

describe("addClosureAction", () => {
  it("refuses a closure whose last day has already passed, without writing or revalidating", async () => {
    const result = await addClosureAction(IDLE, form({ startsOn: "2000-01-01", endsOn: "2000-01-02" }));
    expect(result).toEqual({
      status: "error",
      message: CLOSURE_PAST_MESSAGE,
      field: "endsOn",
      values: { startsOn: "2000-01-01", endsOn: "2000-01-02" },
    });
    expect(mockedAddClosure).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("turns a check_violation nested inside a wrapper into the friendly message", async () => {
    mockedAddClosure.mockRejectedValue(new Error("wrapped", { cause: new FakePgError("23514") }));
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toMatchObject({ status: "error", message: CHECK_VIOLATION_MESSAGE });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("turns any other unexpected error into the generic message", async () => {
    mockedAddClosure.mockRejectedValue(new Error("connection reset"));
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toMatchObject({ status: "error", message: GENERIC_ERROR_MESSAGE });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("adds the closure and revalidates on success", async () => {
    mockedAddClosure.mockResolvedValue({ id: CLOSURE_ID, startsOn: "2030-01-01", endsOn: "2030-01-02", note: null } as ClosureRow);
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });
});

describe("addClosureAction over bookings", () => {
  const booking = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "appt-1",
      practitionerId: "doc-1",
      patientName: "Priya Shah",
      localDate: "2030-01-01",
      localStart: "10:00",
      localEnd: "10:30",
      status: "booked",
      ...overrides,
    }) as never;

  beforeEach(() => {
    mockedAddClosure.mockResolvedValue({ id: CLOSURE_ID, startsOn: "2030-01-01", endsOn: "2030-01-02", note: null } as ClosureRow);
  });

  it("saves the closure and hands back the bookings it falls on, so the clinic can deal with them", async () => {
    mockedListEnabledModules.mockResolvedValue(["appointments"]);
    mockedListAppointmentsForDates.mockResolvedValue([booking(), booking({ id: "appt-2", status: "cancelled" })]);
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(mockedAddClosure).toHaveBeenCalledOnce();
    expect(mockedListAppointmentsForDates).toHaveBeenCalledWith(appTx, "2030-01-01", "2030-01-02");
    expect(result).toEqual({
      status: "saved",
      clashes: [{ appointmentId: "appt-1", patientName: "Priya Shah", localDate: "2030-01-01", localStart: "10:00", localEnd: "10:30" }],
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });

  it("is a plain save when nothing is booked on those days", async () => {
    mockedListEnabledModules.mockResolvedValue(["appointments"]);
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toEqual({ status: "saved" });
  });

  it("does not look at appointments for a business that has not got the module", async () => {
    mockedListEnabledModules.mockResolvedValue([]);
    const result = await addClosureAction(IDLE, form({ startsOn: "2030-01-01", endsOn: "2030-01-02" }));
    expect(result).toEqual({ status: "saved" });
    expect(mockedListAppointmentsForDates).not.toHaveBeenCalled();
  });
});

describe("revalidatePath only on success", () => {
  it("saves hours and revalidates exactly once", async () => {
    const result = await saveHoursAction(IDLE, form());
    expect(result).toEqual({ status: "saved" });
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(1);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });

  it("never revalidates when saving hours fails unexpectedly", async () => {
    mockedReplaceOpeningHours.mockRejectedValue(new Error("connection reset"));
    const result = await saveHoursAction(IDLE, form());
    expect(result).toMatchObject({ status: "error", message: GENERIC_ERROR_MESSAGE });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("saves the announcement and revalidates", async () => {
    mockedSaveAnnouncement.mockResolvedValue(undefined);
    const result = await saveAnnouncementAction(
      IDLE,
      form({ message: "Closed for Diwali", startsOn: "2030-01-01", endsOn: "2030-01-02" }),
    );
    expect(result).toEqual({ status: "saved" });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });

  it("clears the announcement and revalidates", async () => {
    mockedClearAnnouncement.mockResolvedValue(undefined);
    const result = await clearAnnouncementAction(IDLE, form());
    expect(result).toEqual({ status: "saved" });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/details");
  });
});
