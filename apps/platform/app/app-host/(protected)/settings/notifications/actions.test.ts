import { setNotificationPreference, withTenantScope, type Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { reportServerError } from "@/lib/server/error-report";
import { setNotificationAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  setNotificationPreference: vi.fn(async () => undefined),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({ tx: true })),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({}) as Database) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn(async () => null) }));

const tenant = { userId: "user-asha", businessId: "business-1", businessName: "Asha Dental" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-asha" }, tenant } as never);
});

describe("setNotificationAction", () => {
  it("stores the choice for the session's person and business", async () => {
    expect(await setNotificationAction("product_news", true)).toEqual({ status: "saved" });
    expect(withTenantScope).toHaveBeenCalledWith(expect.anything(), tenant, expect.any(Function));
    expect(setNotificationPreference).toHaveBeenCalledWith({ tx: true }, "user-asha", "product_news", true);
  });

  it("refuses an unknown topic or a non-boolean without writing", async () => {
    expect(await setNotificationAction("sms", true)).toEqual({ status: "error", message: "That setting does not exist." });
    expect(await setNotificationAction("billing", "yes" as never)).toMatchObject({ status: "error" });
    expect(setNotificationPreference).not.toHaveBeenCalled();
  });

  it("says so, and reports it, when the write fails", async () => {
    vi.mocked(setNotificationPreference).mockRejectedValueOnce(new Error("db down"));
    expect(await setNotificationAction("billing", false)).toEqual({ status: "error", message: "We could not save that. Try again in a moment." });
    expect(reportServerError).toHaveBeenCalled();
  });
});
