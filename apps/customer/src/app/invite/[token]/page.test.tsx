import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvitePage from "./page";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  loadInvite: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/features/team/actions", () => ({ acceptInviteAction: vi.fn() }));
vi.mock("@/features/entry/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/features/team/loader", () => ({ loadInviteForToken: mocks.loadInvite }));

const TOKEN = "T".repeat(43);

async function renderPage(token: string) {
  render(await InvitePage({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the invitation page", () => {
  it("says a link that is not shaped like ours is not valid, without reading the session", async () => {
    await renderPage("short");
    expect(screen.getByText("This invitation link is not valid.")).toBeTruthy();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("sends someone signed out to sign in or sign up and back to this link", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.loadInvite.mockResolvedValue({
      kind: "valid",
      invite: { businessId: "b1", businessName: "Apex Dental", email: "front@apex.in", role: "viewer" },
    });
    await renderPage(TOKEN);
    const back = encodeURIComponent(`/invite/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(`/login?next=${back}`);
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(`/signup?next=${back}`);
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
  });

  it("explains that an invitation has expired when signed out", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "expired" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation has expired.")).toBeTruthy();
    expect(screen.getByText("This invitation has expired. Ask the owner to send a new one.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
  });

  it("explains that an invitation has already been used when signed out", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "used" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation has already been used.")).toBeTruthy();
    expect(screen.getByText("This invitation has already been used. Ask the owner to send a new one.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
  });

  it("offers the signed-in person the one button, and does not use the invitation by opening the page", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null });
    mocks.loadInvite.mockResolvedValue({
      kind: "valid",
      invite: { businessId: "b1", businessName: "Apex Dental", email: "front@apex.in", role: "viewer" },
    });
    await renderPage(TOKEN);
    expect(screen.getByText(/You are signed in as front@apex.in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join the dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("explains that an invitation has expired before showing the Join button", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null });
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "expired" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation has expired.")).toBeTruthy();
    expect(screen.getByText("This invitation has expired. Ask the owner to send a new one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeTruthy();
  });

  it("explains that an invitation has already been used before showing the Join button", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null });
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "used" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation has already been used.")).toBeTruthy();
    expect(screen.getByText("This invitation has already been used. Ask the owner to send a new one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeTruthy();
  });

  it("explains that the invitation is for a different address before showing the Join button", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "wrong@apex.in", name: "Wrong", emailConfirmed: true, phone: null });
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "wrong_email" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation is for a different email address.")).toBeTruthy();
    expect(screen.getByText("This invitation was sent to a different email address. Sign in with that address to accept it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("explains that the invitation link is not valid when token is not found in database", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null });
    mocks.loadInvite.mockResolvedValue({ kind: "refused", reason: "not_found" });
    await renderPage(TOKEN);
    expect(screen.getByText("This invitation link is not valid.")).toBeTruthy();
    expect(screen.getByText("This invitation link is not valid. Ask the owner to send a new one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
  });
});
