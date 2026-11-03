import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import type { TeamMember } from "../loader";
import type { PendingInvite } from "../rules";
import { TeamPanels } from "./team-panels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({ inviteAction: vi.fn(), revokeInviteAction: vi.fn(), removeMemberAction: vi.fn(), acceptInviteAction: vi.fn() }));

const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;
const MEMBERS: TeamMember[] = [{ userId: "u1", name: "Anand Verma", email: "anand@apex.in", role: "owner", joinedAt: new Date("2026-09-01T10:00:00Z"), isYou: true }];
const INVITES: PendingInvite[] = [{ id: "i1", email: "front@apex.in", role: "viewer", status: "open", expiresAt: new Date("2026-11-08T10:00:00Z"), sentAt: new Date("2026-11-01T10:00:00Z") }];

const show = (props: Parameters<typeof TeamPanels>[0]) =>
  render(
    <ToastProvider>
      <TeamPanels {...props} />
    </ToastProvider>,
  );

describe("Team: one failed panel", () => {
  it("failed members show their own error and the invitations still draw", () => {
    show({ members: FAILED, invites: { ok: true, data: INVITES } });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your team.");
    expect(screen.getByRole("heading", { name: "People with access" })).toBeTruthy();
    expect(screen.getByText("front@apex.in")).toBeTruthy();
  });

  it("failed invitations show their own error, never as if nothing were waiting, and the members still draw", () => {
    show({ members: { ok: true, data: MEMBERS }, invites: FAILED });
    expect(screen.getByRole("alert").textContent).toContain("We could not load your invitations.");
    expect(screen.getByRole("heading", { name: "Waiting for a reply" })).toBeTruthy();
    expect(screen.getByText("Anand Verma (you)")).toBeTruthy();
  });
});

describe("Team: ok but empty", () => {
  it("with no invitations waiting the members still draw without an error, a crash or noise", () => {
    const { container } = show({ members: { ok: true, data: MEMBERS }, invites: { ok: true, data: [] } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Invite someone" })).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
