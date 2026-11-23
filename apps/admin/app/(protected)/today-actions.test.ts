import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { resendAllFailed } from "@/lib/server/deliveries";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendAllFailedFromTodayAction } from "./today-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/deliveries", () => ({ resendAllFailed: vi.fn() }));

const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "admin" } } as unknown as GrantedStaff;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
});

describe("resendAllFailedFromTodayAction", () => {
  it("sends again, logs and records it as the Deliveries page does, and returns the counts without redirecting", async () => {
    vi.mocked(resendAllFailed).mockResolvedValue({ sent: 3, failed: 1 });
    await expect(resendAllFailedFromTodayAction()).resolves.toEqual({ sent: 3, failed: 1 });
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "email.resend", targetType: "all-failed", detail: "3 sent, 1 not sent" });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "delivery.resend_all", summary: "Sent failed deliveries again: 3 went, 1 did not" });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/deliveries");
  });

  it("does nothing without staff access", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("no staff"));
    await expect(resendAllFailedFromTodayAction()).rejects.toThrow("no staff");
    expect(resendAllFailed).not.toHaveBeenCalled();
  });
});
