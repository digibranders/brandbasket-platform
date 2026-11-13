import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("@/lib/server/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/server/team", () => ({ acceptInvite: vi.fn() }));

const { getSessionUser } = await import("@/lib/server/session");
const { acceptInvite } = await import("@/lib/server/team");
const { acceptInviteAction } = await import("./actions");

const TOKEN = "T".repeat(43);
const USER = { id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("acceptInviteAction", () => {
  it("sends someone signed out to sign in and back to this link", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(acceptInviteAction(TOKEN)).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("accepts for the session's user only, and goes Home", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(USER);
    vi.mocked(acceptInvite).mockResolvedValue({ ok: true });
    await expect(acceptInviteAction(TOKEN)).rejects.toThrow("NEXT_REDIRECT /");
    expect(acceptInvite).toHaveBeenCalledWith(USER, TOKEN);
  });

  it("says why when the invitation is refused, and stays on the page", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(USER);
    vi.mocked(acceptInvite).mockResolvedValue({ ok: false, message: "This invitation has expired.", field: null });
    expect(await acceptInviteAction(TOKEN)).toEqual({ status: "error", message: "This invitation has expired." });
  });
});
