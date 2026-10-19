import type { Database, PatientRow, ScopedTransaction } from "@brandbasket/db";
import {
  erasePatient,
  findPatient,
  findPatientByPhone,
  listEnabledModules,
  mergePatients,
  updatePatient,
  withTenantScope,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull, PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import { erasePatientAction, lookupMergeAction, mergePatientsAction, updatePatientAction } from "./actions";
import { HAS_UPCOMING_MESSAGE, MODULE_OFF_MESSAGE, NO_MATCH_MESSAGE, OWN_PHONE_MESSAGE, PHONE_IN_USE_MESSAGE } from "./errors";

/*
 * "Real logic, mocked dependency", the same shape as appointments/actions.test.ts: paidCustomerOrNull,
 * withTenantScope and every packages/db query are doubles, while the actions' own control flow -- which refusal
 * wins, when a write happens, when the pages revalidate, where a success redirects -- runs for real, along with the
 * real shared parsers and ./commands.ts.
 *
 * `redirect` is mocked to throw, as the real one does, so a redirect accidentally moved inside an action's try block
 * would be caught and turned into "Something went wrong" -- and these tests would fail.
 */
const { RedirectSignal } = vi.hoisted(() => ({
  RedirectSignal: class RedirectSignal extends Error {
    constructor(readonly url: string) {
      super(`NEXT_REDIRECT ${url}`);
    }
  },
}));

vi.mock("@/lib/server/report-panel-error", () => ({ reportUnexpectedPanelError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/blog-access", () => ({
  paidCustomerOrNull: vi.fn(),
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));
vi.mock("@brandbasket/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@brandbasket/db")>();
  return {
    hasPostgresCode: actual.hasPostgresCode,
    CHECK_VIOLATION: actual.CHECK_VIOLATION,
    erasePatient: vi.fn(),
    findPatient: vi.fn(),
    findPatientByPhone: vi.fn(),
    listEnabledModules: vi.fn(),
    mergePatients: vi.fn(),
    updatePatient: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const ARJUN_ID = "0192f3c4-4444-7000-8000-000000000001";
const MEERA_ID = "0192f3c4-4444-7000-8000-000000000002";
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;
const IDLE: PanelFormState = { status: "idle" };

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

function patient(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: ARJUN_ID,
    name: "Arjun Menon",
    phone: "+919876543210",
    altPhone: null,
    tags: [],
    createdAt: new Date("2026-03-01T04:30:00Z"),
    updatedAt: new Date("2026-03-01T04:30:00Z"),
    ...overrides,
  };
}

const EDIT = { patientId: ARJUN_ID, name: "Arjun Menon", altPhone: "98200 11223", altPhoneCountry: "IN", tags: "VIP, vip, Wheelchair" };

const mockedPaidCustomerOrNull = vi.mocked(paidCustomerOrNull);
const mockedWithTenantScope = vi.mocked(withTenantScope);
const mockedGetAppDb = vi.mocked(getAppDb);
const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedRedirect = vi.mocked(redirect);
const mockedListEnabledModules = vi.mocked(listEnabledModules);
const mockedFindPatient = vi.mocked(findPatient);
const mockedFindPatientByPhone = vi.mocked(findPatientByPhone);
const mockedUpdatePatient = vi.mocked(updatePatient);
const mockedMergePatients = vi.mocked(mergePatients);
const mockedErasePatient = vi.mocked(erasePatient);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAppDb.mockReturnValue(appDb);
  mockedWithTenantScope.mockImplementation(async (_db, _scope, work) => work(appTx));
  mockedPaidCustomerOrNull.mockResolvedValue(tenant());
  mockedListEnabledModules.mockResolvedValue(["appointments"]);
  mockedFindPatient.mockResolvedValue(patient());
});

describe("before anything is read", () => {
  it("asks an unpaid business to pay first", async () => {
    mockedPaidCustomerOrNull.mockResolvedValue(null);
    const result = await updatePatientAction(IDLE, form(EDIT));
    expect(result).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
  });

  it("returns a parse refusal without opening a transaction, echoing what was typed", async () => {
    const result = await updatePatientAction(IDLE, form({ ...EDIT, name: "  " }));
    expect(result).toEqual({
      status: "error",
      message: "Enter the patient's name.",
      field: "name",
      values: { ...EDIT, name: "  " },
    });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
  });
});

describe("module switched off between page load and submit", () => {
  beforeEach(() => {
    mockedListEnabledModules.mockResolvedValue([]);
  });

  it("refuses every action without touching the register", async () => {
    const results = await Promise.all([
      updatePatientAction(IDLE, form(EDIT)),
      lookupMergeAction(IDLE, form({ keepId: ARJUN_ID, phone: "98200 11223", phoneCountry: "IN" })),
      mergePatientsAction(IDLE, form({ keepId: ARJUN_ID, removeId: MEERA_ID })),
      erasePatientAction(IDLE, form({ patientId: ARJUN_ID })),
    ]);
    for (const result of results) expect(result).toMatchObject({ status: "error", message: MODULE_OFF_MESSAGE });
    expect(mockedUpdatePatient).not.toHaveBeenCalled();
    expect(mockedFindPatientByPhone).not.toHaveBeenCalled();
    expect(mockedMergePatients).not.toHaveBeenCalled();
    expect(mockedErasePatient).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("updatePatientAction", () => {
  it("saves the cleaned edit and revalidates the register, the profile and Appointments", async () => {
    mockedUpdatePatient.mockResolvedValue("updated");
    const result = await updatePatientAction(IDLE, form(EDIT));
    expect(result).toEqual({ status: "saved" });
    expect(mockedUpdatePatient).toHaveBeenCalledWith(
      appTx,
      ARJUN_ID,
      { name: "Arjun Menon", altPhone: "+919820011223", tags: ["VIP", "Wheelchair"] },
      expect.any(Date),
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/patients");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/patients/${ARJUN_ID}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/appointments");
  });

  it("refuses another patient's number on the second phone", async () => {
    mockedUpdatePatient.mockResolvedValue("phone_in_use");
    const result = await updatePatientAction(IDLE, form(EDIT));
    expect(result).toMatchObject({ status: "error", message: PHONE_IN_USE_MESSAGE, field: "altPhone" });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("refuses the patient's own main number on the second phone", async () => {
    mockedFindPatient.mockResolvedValue(patient({ phone: "+919820011223" }));
    const result = await updatePatientAction(IDLE, form(EDIT));
    expect(result).toMatchObject({ status: "error", message: OWN_PHONE_MESSAGE, field: "altPhone" });
    expect(mockedUpdatePatient).not.toHaveBeenCalled();
  });

  it("logs and answers generically when the database fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedUpdatePatient.mockRejectedValue(new Error("connection reset"));
    const result = await updatePatientAction(IDLE, form(EDIT));
    expect(result).toMatchObject({ status: "error", message: GENERIC_ERROR_MESSAGE });
    expect(consoleError).toHaveBeenCalledWith("[patients] updatePatientAction failed", expect.anything());
    consoleError.mockRestore();
  });
});

describe("lookupMergeAction", () => {
  const LOOKUP = { keepId: ARJUN_ID, phone: "98200 11223", phoneCountry: "IN" };

  it("moves on to the confirm step with the other record's id, not its number", async () => {
    mockedFindPatientByPhone.mockResolvedValue(patient({ id: MEERA_ID, name: "Meera", phone: "+919820011223" }));
    await expect(lookupMergeAction(IDLE, form(LOOKUP))).rejects.toThrow(RedirectSignal);
    expect(mockedFindPatientByPhone).toHaveBeenCalledWith(appTx, "+919820011223");
    expect(mockedRedirect).toHaveBeenCalledWith(`/patients/${ARJUN_ID}?merge=${MEERA_ID}`);
  });

  it("says so when no patient has the number", async () => {
    mockedFindPatientByPhone.mockResolvedValue(null);
    const result = await lookupMergeAction(IDLE, form(LOOKUP));
    expect(result).toMatchObject({ status: "error", message: NO_MATCH_MESSAGE, field: "phone" });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("asks for a number when none was typed", async () => {
    const result = await lookupMergeAction(IDLE, form({ ...LOOKUP, phone: "" }));
    expect(result).toMatchObject({ status: "error", field: "phone" });
    expect(mockedWithTenantScope).not.toHaveBeenCalled();
  });
});

describe("mergePatientsAction", () => {
  it("merges, revalidates both profiles and shows the kept one", async () => {
    mockedMergePatients.mockResolvedValue("merged");
    await expect(mergePatientsAction(IDLE, form({ keepId: ARJUN_ID, removeId: MEERA_ID }))).rejects.toThrow(RedirectSignal);
    expect(mockedMergePatients).toHaveBeenCalledWith(appTx, ARJUN_ID, MEERA_ID, expect.any(Date));
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/patients/${MEERA_ID}`);
    expect(mockedRedirect).toHaveBeenCalledWith(`/patients/${ARJUN_ID}?merged=1`);
  });

  it("refuses merging a record into itself before reaching the database", async () => {
    const result = await mergePatientsAction(IDLE, form({ keepId: ARJUN_ID, removeId: ARJUN_ID }));
    expect(result).toMatchObject({ status: "error" });
    expect(mockedMergePatients).not.toHaveBeenCalled();
  });
});

describe("erasePatientAction", () => {
  it("erases and returns to the list with its status line", async () => {
    mockedErasePatient.mockResolvedValue("erased");
    await expect(erasePatientAction(IDLE, form({ patientId: ARJUN_ID }))).rejects.toThrow(RedirectSignal);
    expect(mockedErasePatient).toHaveBeenCalledWith(appTx, ARJUN_ID, expect.any(Date));
    expect(mockedRedirect).toHaveBeenCalledWith("/patients?deleted=1");
  });

  it("refuses while an upcoming booking remains, without redirecting", async () => {
    mockedErasePatient.mockResolvedValue("has_upcoming");
    const result = await erasePatientAction(IDLE, form({ patientId: ARJUN_ID }));
    expect(result).toMatchObject({ status: "error", message: HAS_UPCOMING_MESSAGE });
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
