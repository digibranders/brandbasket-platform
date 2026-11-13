import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvitePage from "./page";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/features/team/actions", () => ({ acceptInviteAction: vi.fn() }));
vi.mock("@/features/entry/actions", () => ({ signOutAction: vi.fn() }));

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
    await renderPage(TOKEN);
    const back = encodeURIComponent(`/invite/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(`/login?next=${back}`);
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(`/signup?next=${back}`);
    expect(screen.queryByRole("button", { name: "Join the dashboard" })).toBeNull();
  });

  it("offers the signed-in person the one button, and does not use the invitation by opening the page", async () => {
    mocks.session.mockResolvedValue({ id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null });
    await renderPage(TOKEN);
    expect(screen.getByText(/You are signed in as front@apex.in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join the dashboard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
