import type { Database, ScopedTransaction } from "@brandbasket/db";
import { saveBusinessContact, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormState } from "@/lib/panel-form-state";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import { saveContactAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/report-panel-error", () => ({ reportUnexpectedPanelError: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/blog-access", () => ({ paidCustomerOrNull: vi.fn(), PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing." }));
vi.mock("@/lib/server/holiday-access", () => ({ holidayAccessOrNull: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@brandbasket/db")>();
  return { hasPostgresCode: actual.hasPostgresCode, CHECK_VIOLATION: actual.CHECK_VIOLATION, saveBusinessContact: vi.fn(), withTenantScope: vi.fn() };
});

const IDLE: PanelFormState = { status: "idle" };
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Riverside Plumbing", role: "owner" };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const GOOD = { displayName: "Riverside Plumbing", email: "hello@riverside.example", city: "Thane", serviceAreas: "Thane, Mumbai" };

function mockAccess(billing: { hasAccess: boolean; hasWebsite: boolean }): void {
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(appTx));
  vi.mocked(saveBusinessContact).mockResolvedValue({} as never);
  mockAccess({ hasAccess: true, hasWebsite: false });
});

describe("saveContactAction", () => {
  it("saves the contact facts for the signed-in business, on a plan without the website too, and refreshes the page", async () => {
    expect(await saveContactAction(IDLE, form(GOOD))).toEqual({ status: "saved" });
    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(saveBusinessContact).toHaveBeenCalledWith(appTx, expect.objectContaining({ displayName: "Riverside Plumbing", email: "hello@riverside.example", city: "Thane", serviceAreas: "Thane, Mumbai", phone: null }));
    expect(revalidatePath).toHaveBeenCalledWith("/details");
  });

  it("takes the business from the session, never from the form", async () => {
    await saveContactAction(IDLE, form({ ...GOOD, businessId: "someone-elses" }));
    expect(withTenantScope).toHaveBeenCalledWith(appDb, expect.objectContaining({ businessId: "business-1" }), expect.any(Function));
  });

  it("refuses an account that has not paid, echoing what was sent and writing nothing", async () => {
    mockAccess({ hasAccess: false, hasWebsite: false });
    expect(await saveContactAction(IDLE, form(GOOD))).toEqual({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE, field: null, values: GOOD });
    expect(saveBusinessContact).not.toHaveBeenCalled();
  });

  it("returns what is wrong with the form, naming the field, and writes nothing", async () => {
    const result = await saveContactAction(IDLE, form({ ...GOOD, email: "not-an-email" }));
    expect(result).toMatchObject({ status: "error", field: "email" });
    expect(saveBusinessContact).not.toHaveBeenCalled();
  });

  it("says something went wrong, and keeps what was typed, when the write fails", async () => {
    vi.mocked(saveBusinessContact).mockRejectedValue(new Error("database is down"));
    expect(await saveContactAction(IDLE, form(GOOD))).toEqual({ status: "error", message: GENERIC_ERROR_MESSAGE, field: null, values: GOOD });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
