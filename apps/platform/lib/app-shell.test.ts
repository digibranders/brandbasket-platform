import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/v2/app-shell";
import type { RailSection } from "@/lib/rail";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadTodo } from "@/lib/server/todo";

vi.mock("server-only", () => ({}));
vi.mock("@/components/v2/rail", () => ({ Rail: () => null }));
vi.mock("@/components/v2/phone-bars", () => ({ PhoneBars: () => null }));
vi.mock("@/lib/brand", () => ({ logoOf: () => ({ name: "Brandbasket", siteUrl: null, email: null }) }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/account-panel", () => ({ getAccountPanel: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/listing", () => ({ getClientListingState: vi.fn(async () => ({ ownListing: false, claim: false })) }));
vi.mock("@/lib/server/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("@/lib/server/setup-call", () => ({ getSetupCallState: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const NOW = Date.parse("2026-10-27T10:00:00Z");
const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });

function grant(hasAccess: boolean): void {
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha" }, tenant, billing: { hasAccess, hasWebsite: true } } as never);
}

/** The first look is over once staff mark the call held. */
function callHeld(held: boolean): void {
  const booking = held ? { bookedAtIso: "", startsAtIso: null, endsAtIso: null, heldAtIso: "2026-10-26T10:00:00.000Z" } : null;
  vi.mocked(getSetupCallState).mockResolvedValue({ url: null, booking, readAtMs: NOW });
}

async function railSections(): Promise<readonly RailSection[]> {
  const shell = await AppShell({ userName: "Asha", userEmail: "asha@example.com", businessId: null, children: null });
  const [rail] = (shell.props as { children: ReactElement<{ sections: readonly RailSection[] }>[] }).children;
  return rail?.props.sections ?? [];
}

const todoLink = (sections: readonly RailSection[]) => sections.flatMap((section) => section.links).find((link) => link.label === "To do");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  grant(true);
  callHeld(true);
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] });
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
  vi.mocked(loadTodo).mockResolvedValue({ services: [], items: [], open: 3, answers: { social: undefined, search: undefined } });
});

describe("AppShell's To do count", () => {
  it("shows the number of open items once the first look is over", async () => {
    expect(todoLink(await railSections())?.count).toBe(3);
  });

  it("does not read the To do for the quiet rail", async () => {
    callHeld(false);
    expect(todoLink(await railSections())).toBeUndefined();
    expect(loadTodo).not.toHaveBeenCalled();
  });

  it("does not read the To do for an account with no access, and gives it no To do link", async () => {
    grant(false);
    expect(todoLink(await railSections())).toBeUndefined();
    expect(loadTodo).not.toHaveBeenCalled();
  });

  it("leaves the number out, and logs, when the To do cannot be read", async () => {
    vi.mocked(loadTodo).mockRejectedValue(new Error("db down"));
    const link = todoLink(await railSections());
    expect(link).toBeDefined();
    expect(link?.count).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[app-shell] could not read the To do count", expect.anything());
  });

  it("passes on a redirect thrown while reading the To do", async () => {
    vi.mocked(loadTodo).mockRejectedValue(redirect);
    await expect(railSections()).rejects.toBe(redirect);
  });
});
