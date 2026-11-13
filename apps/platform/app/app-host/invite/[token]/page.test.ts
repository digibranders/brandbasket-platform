import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@brandbasket/shared/ui/panel/sign-out-button", () => ({ SignOutButton: "sign-out" }));
vi.mock("@/components/panel/entry-screen", () => ({ EntryScreen: "entry-screen" }));
vi.mock("@/components/panel/team/accept-invite", () => ({ AcceptInvite: "accept-invite" }));
vi.mock("@/lib/server/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/server/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/server/account-label", () => ({ accountLabel: (user: { email: string }) => user.email }));
vi.mock("./actions", () => ({ acceptInviteAction: vi.fn() }));

const { getSessionUser } = await import("@/lib/server/session");
const { default: InvitePage } = await import("./page");

const TOKEN = "T".repeat(43);
const USER = { id: "u1", email: "front@apex.in", name: "Front", emailConfirmed: true, phone: null };

async function render(token: string): Promise<ReactElement<{ title: string; lede: string; children: unknown }>> {
  return (await InvitePage({ params: Promise.resolve({ token }) })) as ReactElement<{ title: string; lede: string; children: unknown }>;
}

/** Every string anywhere in the element tree, props included: enough to see which view was drawn. */
function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  const element = node as ReactElement<Record<string, unknown>>;
  return Object.values(element.props).map(text).join(" ");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the invitation page", () => {
  it("says a link that is not shaped like ours is not valid, without reading the session", async () => {
    const page = await render("short");
    expect(page.props.title).toBe("This invitation link is not valid.");
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("sends someone signed out to sign in, back to this link, and offers no way to create an account", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const body = text(await render(TOKEN));
    expect(body).toContain(`/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    expect(body).not.toContain("Create an account");
    expect(body).not.toContain("create an account");
    expect(body).not.toContain("accept-invite");
  });

  it("offers the signed-in person the join button and a way to switch address, using nothing by opening the page", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(USER);
    const page = await render(TOKEN);
    expect(page.props.lede).toContain("front@apex.in");
    const body = JSON.stringify(page.props.children, (_key, value: unknown) => (typeof value === "function" ? "fn" : value));
    expect(body).toContain("accept-invite");
    expect(body).toContain("sign-out");
  });
});
