import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeStaffRole, inviteStaff, resendStaffInvite, switchOffStaff, switchOnStaff } from "@/lib/server/staff-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import type { GrantedStaff } from "@/lib/server/staff-access";
import { changeStaffRoleAction, inviteStaffAction, resendStaffInviteAction, switchOffStaffAction, switchOnStaffAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/staff-admin", () => ({
  inviteStaff: vi.fn(),
  resendStaffInvite: vi.fn(),
  changeStaffRole: vi.fn(),
  switchOffStaff: vi.fn(),
  switchOnStaff: vi.fn(),
}));

const ADMIN = { user: { id: "riya" }, staff: { userId: "riya", role: "admin" } } as unknown as GrantedStaff;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffCan).mockResolvedValue(ADMIN);
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("staff actions", () => {
  it("need an admin (oversight) before anything else", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(new Error("redirect:/no-access"));
    await expect(inviteStaffAction(form({ email: "a@b.in", role: "support" }))).rejects.toThrow("redirect:/no-access");
    expect(requireStaffCan).toHaveBeenCalledWith("oversight");
    expect(inviteStaff).not.toHaveBeenCalled();
  });

  it("invite: a bad form says so without sending anything", async () => {
    await expect(inviteStaffAction(form({ email: "nope", role: "support" }))).rejects.toThrow("redirect:/staff?notice=bad-invite");
    expect(inviteStaff).not.toHaveBeenCalled();
  });

  it("invite: a good form invites and reports the notice", async () => {
    vi.mocked(inviteStaff).mockResolvedValue("invited");
    await expect(inviteStaffAction(form({ email: "Nikhil@BrandBasket.in", role: "support" }))).rejects.toThrow("redirect:/staff?notice=invited");
    expect(inviteStaff).toHaveBeenCalledWith(ADMIN, { email: "nikhil@brandbasket.in", role: "support" });
  });

  it("resend, role, switch off and switch on pass the ids through", async () => {
    vi.mocked(resendStaffInvite).mockResolvedValue("resent");
    vi.mocked(changeStaffRole).mockResolvedValue("role-changed");
    vi.mocked(switchOffStaff).mockResolvedValue("switched-off");
    vi.mocked(switchOnStaff).mockResolvedValue("switched-on");
    await expect(resendStaffInviteAction(form({ inviteId: "inv-1" }))).rejects.toThrow("notice=resent");
    await expect(changeStaffRoleAction(form({ userId: "rohit", role: "finance" }))).rejects.toThrow("notice=role-changed");
    await expect(switchOffStaffAction(form({ userId: "rohit" }))).rejects.toThrow("notice=switched-off");
    await expect(switchOnStaffAction(form({ userId: "rohit" }))).rejects.toThrow("notice=switched-on");
    expect(resendStaffInvite).toHaveBeenCalledWith(ADMIN, "inv-1");
    expect(changeStaffRole).toHaveBeenCalledWith(ADMIN, "rohit", "finance");
    expect(switchOffStaff).toHaveBeenCalledWith(ADMIN, "rohit");
    expect(switchOnStaff).toHaveBeenCalledWith(ADMIN, "rohit");
  });

  it("refuses a missing id or an unknown role", async () => {
    await expect(switchOffStaffAction(form({}))).rejects.toThrow("notice=not-found");
    await expect(changeStaffRoleAction(form({ userId: "rohit", role: "root" }))).rejects.toThrow("notice=not-found");
    expect(switchOffStaff).not.toHaveBeenCalled();
    expect(changeStaffRole).not.toHaveBeenCalled();
  });
});
