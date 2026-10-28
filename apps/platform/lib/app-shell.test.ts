import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/v2/app-shell";
import type { RailSection } from "@/lib/rail";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { loadTodo } from "@/lib/server/todo";

vi.mock("server-only", () => ({}));
vi.mock("@/components/v2/rail", () => ({ Rail: () => null }));
vi.mock("@/components/v2/phone-bars", () => ({ PhoneBars: () => null }));
vi.mock("@/lib/brand", () => ({ logoOf: () => ({ name: "Brandbasket", siteUrl: null, email: null }) }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/account-panel", () => ({ getAccountPanel: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });

function grant(hasAccess: boolean): void {
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha" }, tenant, billing: { hasAccess, hasWebsite: true } } as never);
}

async function railSections(): Promise<readonly RailSection[]> {
  const shell = await AppShell({ userName: "Asha", userEmail: "asha@example.com", children: null });
  const [rail] = (shell.props as { children: ReactElement<{ sections: readonly RailSection[] }>[] }).children;
  return rail?.props.sections ?? [];
}

const todoLink = (sections: readonly RailSection[]) => sections.flatMap((section) => section.links).find((link) => link.label === "To do");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  grant(true);
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] });
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
  vi.mocked(loadTodo).mockResolvedValue({ services: [], items: [], open: 3, answers: { social: undefined, search: undefined } });
});

describe("AppShell's service links", () => {
  const serviceLabels = (sections: readonly RailSection[]) => sections.find((section) => section.label === "Services")?.links.map((link) => link.label);

  it("adds Social & Ads and Search for the services bought, from the one To do read", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ services: ["website", "social", "search"], items: [], open: 0, answers: { social: undefined, search: undefined } });
    expect(serviceLabels(await railSections())).toEqual(["Website", "Social & Ads", "Search"]);
    expect(loadTodo).toHaveBeenCalledTimes(1);
  });

  it("adds only the one bought", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ services: ["website", "search"], items: [], open: 0, answers: { social: undefined, search: undefined } });
    expect(serviceLabels(await railSections())).toEqual(["Website", "Search"]);
  });

  it("adds none for an account with no access", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ services: ["social", "search"], items: [], open: 0, answers: { social: undefined, search: undefined } });
    grant(false);
    expect(serviceLabels(await railSections())).not.toContain("Social & Ads");
  });
});

describe("AppShell's To do count", () => {
  it("shows the number of open items for a paid account, before or after the kickoff call", async () => {
    expect(todoLink(await railSections())?.count).toBe(3);
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

describe("AppShell's access", () => {
  it("lets a free listing account in, so Settings and Billing are not sent to a page that no longer exists", async () => {
    vi.mocked(loadTodo).mockResolvedValue({ services: ["website"], items: [], open: 0, answers: { social: undefined, search: undefined } });
    await railSections();
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
  });
});
