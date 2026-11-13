import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { inviteAction, removeMemberAction, revokeInviteAction } from "../actions";
import type { PendingInvite } from "../rules";
import type { TeamMember } from "../loader";
import { RemoveMemberButton } from "./remove-member-button";
import { RevokeInviteButton } from "./revoke-invite-button";
import { TeamPanels } from "./team-panels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({ inviteAction: vi.fn(), revokeInviteAction: vi.fn(), removeMemberAction: vi.fn(), acceptInviteAction: vi.fn() }));

const MEMBERS: TeamMember[] = [
  { userId: "u1", name: "Anand Verma", email: "anand@apex.in", role: "owner", joinedAt: new Date("2026-09-01T10:00:00Z"), isYou: true },
  { userId: "u2", name: "Dr. Shalini Verma", email: "shalini@apex.in", role: "editor", joinedAt: new Date("2026-10-01T10:00:00Z"), isYou: false },
];
const INVITES: PendingInvite[] = [
  { id: "i1", email: "front@apex.in", role: "viewer", status: "open", expiresAt: new Date("2026-11-08T10:00:00Z"), sentAt: new Date("2026-11-01T10:00:00Z") },
  { id: "i2", email: "old@apex.in", role: "editor", status: "expired", expiresAt: new Date("2026-10-01T10:00:00Z"), sentAt: new Date("2026-09-24T10:00:00Z") },
];
const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;

function renderWithToasts(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("TeamPanels", () => {
  it("lists the people with their role, marks the owner as you, and explains the roles", () => {
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: [] }} />);
    expect(screen.getByText("Anand Verma (you)")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(screen.getByText(/Viewers can see everything but change nothing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite someone" })).toBeTruthy();
  });

  it("shows no invitations panel when none is waiting", () => {
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: [] }} />);
    expect(screen.queryByText("Waiting for a reply")).toBeNull();
  });

  it("lists open and expired invitations, each with a Revoke", () => {
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: INVITES }} />);
    expect(screen.getByText("front@apex.in")).toBeTruthy();
    expect(screen.getByText(/Expires/)).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke the invitation to old@apex.in" })).toBeTruthy();
  });

  it("says each panel could not load, on its own", () => {
    renderWithToasts(<TeamPanels members={FAILED} invites={FAILED} />);
    expect(screen.getByText(/We could not load your team/)).toBeTruthy();
    expect(screen.getByText(/We could not load your invitations/)).toBeTruthy();
  });

  it("sends the invitation with the address and the role chosen", async () => {
    vi.mocked(inviteAction).mockResolvedValue({ ok: true });
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: [] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Invite someone" }));
    await userEvent.type(await screen.findByLabelText("Email"), "front@apex.in");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    const formData = vi.mocked(inviteAction).mock.calls[0]?.[0];
    expect(formData?.get("email")).toBe("front@apex.in");
    expect(formData?.get("role")).toBe("editor");
  });

  it("keeps the dialog open and shows the refusal under the field", async () => {
    vi.mocked(inviteAction).mockResolvedValue({ ok: false, message: "Check the fields marked below.", fieldErrors: { email: "Enter a valid email address." } });
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: [] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Invite someone" }));
    await userEvent.type(await screen.findByLabelText("Email"), "nobody");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeTruthy();
  });
});

describe("RevokeInviteButton", () => {
  it("revokes the invitation it is for", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({ ok: true });
    renderWithToasts(<RevokeInviteButton inviteId="i1" email="front@apex.in" />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke the invitation to front@apex.in" }));
    expect(revokeInviteAction).toHaveBeenCalledWith("i1");
  });

  it("says so when it could not", async () => {
    vi.mocked(revokeInviteAction).mockResolvedValue({ ok: false, message: "That invitation was already used or taken back." });
    renderWithToasts(<RevokeInviteButton inviteId="i1" email="front@apex.in" />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke the invitation to front@apex.in" }));
    expect(await screen.findByText("That invitation was already used or taken back.")).toBeTruthy();
  });
});

describe("RemoveMemberButton", () => {
  it("shows Remove for each member who is not the owner, never on the owner's row", () => {
    renderWithToasts(<TeamPanels members={{ ok: true, data: MEMBERS }} invites={{ ok: true, data: [] }} />);
    expect(screen.getByRole("button", { name: "Remove Dr. Shalini Verma" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Anand Verma" })).toBeNull();
  });

  it("removes only after the confirmation", async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({ ok: true });
    renderWithToasts(<RemoveMemberButton userId="u2" name="Dr. Shalini Verma" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Dr. Shalini Verma" }));
    expect(await screen.findByText("Remove Dr. Shalini Verma?")).toBeTruthy();
    expect(removeMemberAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeMemberAction).toHaveBeenCalledWith("u2");
  });

  it("keeps the dialog open and says why when it could not", async () => {
    vi.mocked(removeMemberAction).mockResolvedValue({ ok: false, message: "That person can’t be removed. Reload the page to see who has access." });
    renderWithToasts(<RemoveMemberButton userId="u2" name="Dr. Shalini Verma" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Dr. Shalini Verma" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect((await screen.findByRole("alert")).textContent).toContain("can’t be removed");
  });
});
