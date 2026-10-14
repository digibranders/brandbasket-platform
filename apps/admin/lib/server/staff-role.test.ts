import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffCan } from "./staff-role";
import { requireStaffAccess } from "./staff-access";
import { logStaffAccess } from "./staff-access-log";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("./staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("./staff-access-log", () => ({ logStaffAccess: vi.fn() }));

function signedInAs(role: "support" | "finance" | "admin"): void {
  vi.mocked(requireStaffAccess).mockResolvedValue({ user: { id: "staff-1" }, staff: { userId: "staff-1", role } } as never);
}

beforeEach(() => vi.resetAllMocks());

describe("requireStaffCan", () => {
  it("lets finance and admin handle money", async () => {
    signedInAs("finance");
    await expect(requireStaffCan("money")).resolves.toMatchObject({ staff: { role: "finance" } });
    signedInAs("admin");
    await expect(requireStaffCan("money")).resolves.toMatchObject({ staff: { role: "admin" } });
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("sends support to the no-access page and records the refusal, without doing the work", async () => {
    signedInAs("support");
    await expect(requireStaffCan("money")).rejects.toThrow("NEXT_REDIRECT /no-access");
    expect(logStaffAccess).toHaveBeenCalledWith({
      staffUserId: "staff-1",
      action: "access.denied",
      targetType: "money",
      result: "denied",
    });
  });

  it("keeps the access log to admins", async () => {
    signedInAs("finance");
    await expect(requireStaffCan("oversight")).rejects.toThrow("NEXT_REDIRECT /no-access");
    signedInAs("admin");
    await expect(requireStaffCan("oversight")).resolves.toBeDefined();
  });
});
