import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/v2/app-shell";
import type { RailSection } from "@/lib/rail";
import { loadActiveServices } from "@/lib/server/active-services";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadTodo } from "@/lib/server/todo";

vi.mock("server-only", () => ({}));
vi.mock("@/components/v2/rail", () => ({ Rail: () => null }));
vi.mock("@/components/v2/phone-bars", () => ({ PhoneBars: () => null }));
vi.mock("@/lib/brand", () => ({ logoOf: () => ({ name: "Brandbasket", siteUrl: null, email: null }) }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/account-panel", () => ({ getAccountPanel: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/active-services", () => ({ loadActiveServices: vi.fn() }));
vi.mock("@/lib/server/requests", () => ({ loadRequestsBadge: vi.fn(async () => 2) }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };

function grant(hasAccess: boolean): void {
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha" }, tenant, billing: { hasAccess, hasWebsite: true } } as never);
}

async function rail(): Promise<{ readonly sections: readonly RailSection[]; readonly businessName: string }> {
  const shell = await AppShell({ userName: "Asha", userEmail: "asha@example.com", children: null });
  const [first] = (shell.props as { children: ReactElement<{ sections: readonly RailSection[]; businessName: string }>[] }).children;
  return { sections: first?.props.sections ?? [], businessName: first?.props.businessName ?? "" };
}

const labels = (sections: readonly RailSection[], section: string) => sections.find((entry) => entry.label === section)?.links.map((link) => link.label);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadActiveServices).mockResolvedValue(["website"]);
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha" }, tenant, billing: { hasAccess: true, hasWebsite: true } } as never);
});

describe("AppShell's service links", () => {
  it("adds Social & Ads and Local SEO + AEO for the services bought, from the one active-services read", async () => {
    vi.mocked(loadActiveServices).mockResolvedValue(["website", "social", "search"]);
    expect(labels((await rail()).sections, "Services")).toEqual(["Website", "Social & Ads", "Local SEO + AEO"]);
    expect(loadActiveServices).toHaveBeenCalledTimes(1);
    expect(loadActiveServices).toHaveBeenCalledWith(tenant);
  });

  it("adds only the one bought", async () => {
    vi.mocked(loadActiveServices).mockResolvedValue(["website", "search"]);
    expect(labels((await rail()).sections, "Services")).toEqual(["Website", "Local SEO + AEO"]);
  });

  it("adds none when no service could be read, so the sidebar still draws", async () => {
    vi.mocked(loadActiveServices).mockResolvedValue([]);
    expect(labels((await rail()).sections, "Services")).toEqual(["Website"]);
  });
});

describe("AppShell no longer waits on the To do", () => {
  it("never reads it, and has no To do link", async () => {
    const { sections } = await rail();
    expect(loadTodo).not.toHaveBeenCalled();
    expect(sections.flatMap((section) => section.links.map((link) => link.label))).not.toContain("To do");
  });
});

describe("AppShell's sidebar", () => {
  it("shows the number of things waiting beside Requests, and names the business", async () => {
    const { sections, businessName } = await rail();
    expect(sections.flatMap((section) => section.links).find((link) => link.label === "Requests")?.count).toBe(2);
    expect(businessName).toBe("Cafe");
  });

  it("lets a free listing account in, so Settings and Billing are not sent to a page that no longer exists", async () => {
    grant(false);
    await rail();
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow" });
  });
});
