import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { resendAllFailed, resendEmail } from "@/lib/server/deliveries";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { resendFailedAlert } from "@/lib/server/teams-admin";
import { resendAlertAction, resendAllFailedAction, resendEmailAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/deliveries", () => ({ resendEmail: vi.fn(), resendAllFailed: vi.fn() }));
vi.mock("@/lib/server/teams-admin", () => ({ resendFailedAlert: vi.fn() }));

const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const ID = "0198f2c0-0000-7000-8000-0000000000aa";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
});

describe("resendEmailAction", () => {
  it("resends, logs it, records it and goes back to the list with the result", async () => {
    vi.mocked(resendEmail).mockResolvedValue("sent");
    await resendEmailAction(form({ deliveryId: ID, from: "list" }));
    expect(resendEmail).toHaveBeenCalledWith(ID, expect.any(Date));
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "email.resend", targetType: "email", targetId: ID, result: "ok" });
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "email.resend", summary: "Sent an email again" });
    expect(redirect).toHaveBeenCalledWith("/deliveries?resent=sent");
  });

  it("goes back to the email's own page when asked from there, and logs a failed try as failed", async () => {
    vi.mocked(resendEmail).mockResolvedValue("failed");
    await resendEmailAction(form({ deliveryId: ID, from: "detail" }));
    expect(logStaffAccess).toHaveBeenCalledWith(expect.objectContaining({ result: "failed" }));
    expect(redirect).toHaveBeenCalledWith(`/outbox/${ID}?resent=failed`);
  });

  it("refuses an id that is not one", async () => {
    await expect(resendEmailAction(form({ deliveryId: "nope", from: "list" }))).rejects.toThrow("Missing delivery id");
    expect(resendEmail).not.toHaveBeenCalled();
  });
});

describe("resendAlertAction", () => {
  it("resends an alert and goes back to its page when asked from there", async () => {
    vi.mocked(resendFailedAlert).mockResolvedValue("sent");
    await resendAlertAction(form({ deliveryId: ID, from: "detail" }));
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "alert.resend", targetType: "alert", targetId: ID, result: "ok" });
    expect(redirect).toHaveBeenCalledWith(`/deliveries/${ID}?resent=sent`);
  });
});

describe("resendAllFailedAction", () => {
  it("resends every failed one and says how many went", async () => {
    vi.mocked(resendAllFailed).mockResolvedValue({ sent: 2, failed: 1 });
    await resendAllFailedAction();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "email.resend", targetType: "all-failed", detail: "2 sent, 1 not sent" });
    expect(redirect).toHaveBeenCalledWith("/deliveries?resentAll=2-1");
  });
});
