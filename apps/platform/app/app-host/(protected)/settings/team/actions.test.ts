import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/team", () => ({ inviteMember: vi.fn(), removeMember: vi.fn(), revokeInvite: vi.fn() }));

const { revalidatePath } = await import("next/cache");
const { requireCustomerAccess } = await import("@/lib/server/customer-access");
const { inviteMember, removeMember, revokeInvite } = await import("@/lib/server/team");
const { inviteAction, removeMemberAction, revokeInviteAction } = await import("./actions");

const CUSTOMER = {
  user: { id: "owner-1", email: "o@example.com", name: "Olu", emailConfirmed: true, phone: null },
  tenant: { userId: "owner-1", businessId: "biz-1", businessName: "Riverside", role: "owner" },
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue(CUSTOMER as never);
});

describe("every team action", () => {
  it("asks for the owner first, and runs nothing when the guard sends the caller away", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("NEXT_REDIRECT /"));
    await expect(inviteAction({ status: "idle" }, form({ email: "a@example.com", role: "editor" }))).rejects.toThrow("NEXT_REDIRECT");
    await expect(revokeInviteAction("0192f3c4-1111-7000-8000-000000000001")).rejects.toThrow("NEXT_REDIRECT");
    await expect(removeMemberAction("user-2")).rejects.toThrow("NEXT_REDIRECT");
    expect(requireCustomerAccess).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(requireCustomerAccess).mock.calls) expect(call).toEqual([{ access: "owner" }]);
    expect(inviteMember).not.toHaveBeenCalled();
    expect(revokeInvite).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe("inviteAction", () => {
  it("invites the address as the role chosen, from the session's own business, and reports it saved", async () => {
    vi.mocked(inviteMember).mockResolvedValue({ ok: true });
    expect(await inviteAction({ status: "idle" }, form({ email: " Front@Example.com ", role: "viewer" }))).toEqual({ status: "saved" });
    expect(inviteMember).toHaveBeenCalledWith(CUSTOMER, { email: "front@example.com", role: "viewer" });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/team");
  });

  it("ignores a business or inviter named in the form", async () => {
    vi.mocked(inviteMember).mockResolvedValue({ ok: true });
    await inviteAction({ status: "idle" }, form({ email: "a@example.com", role: "editor", businessId: "other", invitedBy: "someone" }));
    expect(inviteMember).toHaveBeenCalledWith(CUSTOMER, { email: "a@example.com", role: "editor" });
  });

  it("refuses owner as a role and a bad address, beside the field", async () => {
    expect(await inviteAction({ status: "idle" }, form({ email: "a@example.com", role: "owner" }))).toMatchObject({ status: "error", field: "role" });
    expect(await inviteAction({ status: "idle" }, form({ email: "nope", role: "editor" }))).toMatchObject({ status: "error", field: "email" });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("shows why an invitation was not sent, and keeps what was typed", async () => {
    vi.mocked(inviteMember).mockResolvedValue({ ok: false, message: "That address already has an invitation.", field: "email" });
    const state = await inviteAction({ status: "idle" }, form({ email: "a@example.com", role: "editor" }));
    expect(state).toMatchObject({ status: "error", message: "That address already has an invitation.", field: "email", values: { email: "a@example.com" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revokeInviteAction and removeMemberAction", () => {
  it("revoke needs an id that is a uuid, and revokes inside the session's business", async () => {
    expect(await revokeInviteAction("nope")).toMatchObject({ ok: false });
    expect(revokeInvite).not.toHaveBeenCalled();
    vi.mocked(revokeInvite).mockResolvedValue({ ok: true });
    expect(await revokeInviteAction("0192f3c4-1111-7000-8000-000000000001")).toEqual({ ok: true });
    expect(revokeInvite).toHaveBeenCalledWith(CUSTOMER.tenant, "0192f3c4-1111-7000-8000-000000000001");
    expect(revalidatePath).toHaveBeenCalledWith("/settings/team");
  });

  it("remove needs a user id, and removes inside the session's business", async () => {
    expect(await removeMemberAction("")).toMatchObject({ ok: false });
    expect(removeMember).not.toHaveBeenCalled();
    vi.mocked(removeMember).mockResolvedValue({ ok: true });
    expect(await removeMemberAction("user-2")).toEqual({ ok: true });
    expect(removeMember).toHaveBeenCalledWith(CUSTOMER, "user-2");
  });

  it("does not refresh the page when nothing changed", async () => {
    vi.mocked(removeMember).mockResolvedValue({ ok: false, message: "No.", field: null });
    await removeMemberAction("user-2");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
