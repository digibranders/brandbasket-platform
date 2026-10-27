import {
  countActiveAdmins,
  createStaffInvite,
  findOpenStaffInvite,
  findStaffMember,
  findStaffMemberByEmail,
  setStaffRole,
  switchOffStaffMember,
  switchOnStaffMember,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "./activity";
import { customerEmailTransport } from "./email";
import { changeStaffRole, inviteStaff, resendStaffInvite, switchOffStaff, switchOnStaff } from "./staff-admin";
import { logStaffAccess } from "./staff-access-log";
import type { GrantedStaff } from "./staff-access";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    countActiveAdmins: vi.fn(),
    createStaffInvite: vi.fn(),
    findOpenStaffInvite: vi.fn(),
    findStaffMember: vi.fn(),
    findStaffMemberByEmail: vi.fn(),
    setStaffRole: vi.fn(),
    switchOffStaffMember: vi.fn(),
    switchOnStaffMember: vi.fn(),
  };
});
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://console.localhost:3199" }) }));
vi.mock("./activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("./staff-access-log", () => ({ logStaffAccess: vi.fn() }));

const ADMIN = { user: { id: "riya", name: "Riya Kapoor", email: "riya@brandbasket.in" }, staff: { userId: "riya", role: "admin" } } as unknown as GrantedStaff;
const send = vi.fn();
const INVITE = { id: "inv-1", email: "nikhil@brandbasket.in", role: "support" as const, expiresAt: new Date(), invitedBy: "riya", createdAt: new Date() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(customerEmailTransport).mockReturnValue({ send } as unknown as ReturnType<typeof customerEmailTransport>);
  vi.mocked(createStaffInvite).mockResolvedValue({ token: "token-123", invite: INVITE });
  vi.mocked(countActiveAdmins).mockResolvedValue(2);
});

describe("inviteStaff", () => {
  it("creates the invite, emails the console link, and records it twice", async () => {
    vi.mocked(findStaffMemberByEmail).mockResolvedValue(null);
    expect(await inviteStaff(ADMIN, { email: "nikhil@brandbasket.in", role: "support" })).toBe("invited");
    expect(createStaffInvite).toHaveBeenCalledWith({ name: "staff-db" }, { email: "nikhil@brandbasket.in", role: "support", invitedBy: "riya", expiresInDays: 3 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "nikhil@brandbasket.in", template: "staff-invite", bodyText: expect.stringContaining("http://console.localhost:3199/staff-invite/token-123") }));
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "riya", action: "staff.invite", targetType: "staff_invite", targetId: "inv-1", detail: "support" });
    expect(recordStaffAction).toHaveBeenCalledWith(ADMIN, { businessId: null, kind: "staff.invited", summary: "Invited someone as Support", data: { inviteId: "inv-1", role: "support" } });
  });

  it("refuses someone already active on the team, but invites someone switched off", async () => {
    vi.mocked(findStaffMemberByEmail).mockResolvedValue({ userId: "rohit", role: "support", active: true });
    expect(await inviteStaff(ADMIN, { email: "rohit@brandbasket.in", role: "support" })).toBe("already-staff");
    expect(createStaffInvite).not.toHaveBeenCalled();
    vi.mocked(findStaffMemberByEmail).mockResolvedValue({ userId: "rohit", role: "support", active: false });
    expect(await inviteStaff(ADMIN, { email: "rohit@brandbasket.in", role: "finance" })).toBe("invited");
  });
});

describe("resendStaffInvite", () => {
  it("sends a fresh invite to the same address and role", async () => {
    vi.mocked(findOpenStaffInvite).mockResolvedValue(INVITE);
    vi.mocked(findStaffMemberByEmail).mockResolvedValue(null);
    expect(await resendStaffInvite(ADMIN, "inv-1")).toBe("resent");
    expect(createStaffInvite).toHaveBeenCalledWith({ name: "staff-db" }, expect.objectContaining({ email: "nikhil@brandbasket.in", role: "support" }));
  });

  it("says so when the invite is gone", async () => {
    vi.mocked(findOpenStaffInvite).mockResolvedValue(null);
    expect(await resendStaffInvite(ADMIN, "inv-1")).toBe("invite-gone");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("changeStaffRole", () => {
  it("changes another person's role and logs from and to", async () => {
    vi.mocked(findStaffMember).mockResolvedValue({ userId: "rohit", role: "support", active: true });
    vi.mocked(setStaffRole).mockResolvedValue(true);
    expect(await changeStaffRole(ADMIN, "rohit", "finance")).toBe("role-changed");
    expect(setStaffRole).toHaveBeenCalledWith({ name: "staff-db" }, "rohit", "finance");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "riya", action: "staff.role_change", targetType: "staff_member", targetId: "rohit", detail: "support to finance" });
  });

  it("refuses your own role and someone not on the team", async () => {
    vi.mocked(findStaffMember).mockResolvedValue({ userId: "riya", role: "admin", active: true });
    expect(await changeStaffRole(ADMIN, "riya", "support")).toBe("self-role");
    vi.mocked(findStaffMember).mockResolvedValue(null);
    expect(await changeStaffRole(ADMIN, "ghost", "support")).toBe("not-found");
    expect(setStaffRole).not.toHaveBeenCalled();
  });
});

describe("switching off and on", () => {
  it("switches someone off and logs it", async () => {
    vi.mocked(findStaffMember).mockResolvedValue({ userId: "rohit", role: "support", active: true });
    vi.mocked(switchOffStaffMember).mockResolvedValue(true);
    expect(await switchOffStaff(ADMIN, "rohit")).toBe("switched-off");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "riya", action: "staff.deactivate", targetType: "staff_member", targetId: "rohit" });
    expect(recordStaffAction).toHaveBeenCalledWith(ADMIN, { businessId: null, kind: "staff.switched_off", summary: "Switched off a Support member", data: { userId: "rohit" } });
  });

  it("refuses to switch off the last active admin", async () => {
    vi.mocked(findStaffMember).mockResolvedValue({ userId: "deepa", role: "admin", active: true });
    vi.mocked(countActiveAdmins).mockResolvedValue(1);
    expect(await switchOffStaff(ADMIN, "deepa")).toBe("last-admin");
    expect(switchOffStaffMember).not.toHaveBeenCalled();
  });

  it("switches someone back on", async () => {
    vi.mocked(findStaffMember).mockResolvedValue({ userId: "rohit", role: "support", active: false });
    vi.mocked(switchOnStaffMember).mockResolvedValue(true);
    expect(await switchOnStaff(ADMIN, "rohit")).toBe("switched-on");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "riya", action: "staff.reactivate", targetType: "staff_member", targetId: "rohit" });
  });
});
