import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/ui/test-axe";
import type { ShellView } from "../loader";
import { bellView } from "../rules";
import { AppShell } from "./app-shell";
import { DeploymentUpdate } from "./deployment-update";

const navigation = vi.hoisted(() => ({ pathname: "/requests", push: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({ markNotificationsSeenAction: vi.fn(), signOutAction: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
}));
vi.mock("../actions", () => actions);

// Sample shell for the tests only.
const VIEW: ShellView = {
  business: { name: "Apex Diagnostics", services: ["website", "social"] },
  person: { name: "Anand Verma", contact: "anand@example.com", role: "owner" },
  kickoffOver: true,
  enquiries: { ok: true, data: 4 },
  requests: { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } },
  reports: { ok: true, data: true },
  banner: { kind: "lapsed" },
  notifications: {
    ok: true,
    data: bellView({
      needs: [{ ticketId: "t1", subject: "New home collection page", state: "quoted", updatedAt: new Date("2026-11-02T06:00:00Z") }],
      waiting: [],
      replies: [],
      activity: [{ id: "a1", title: "Published 3 posts", service: "social", occurredAt: new Date("2026-11-03T04:00:00Z") }],
      seenAt: null,
    }),
  },
};

const shell = (view: ShellView = VIEW, children: ReactNode = <h1>Requests</h1>) =>
  render(
    <NuqsTestingAdapter>
      <AppShell view={view}>{children}</AppShell>
    </NuqsTestingAdapter>,
  );

beforeEach(() => {
  navigation.pathname = "/requests";
  navigation.push.mockReset();
  actions.markNotificationsSeenAction.mockReset().mockResolvedValue({ ok: true });
  actions.signOutAction.mockReset().mockResolvedValue({ ok: false, message: "We could not sign you out. Try again." });
});

describe("AppShell", () => {
  it("draws the sidebar of the mock with the current page, counts and a service not bought", async () => {
    const { container } = shell();
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
    expect(within(main).getByRole("link", { name: /^Enquiries\s*, 4 new$/ })).toBeTruthy();
    // The Requests count failed to load: the link stays, only its number is gone.
    expect(within(main).getByRole("link", { name: "Requests" })).toBeTruthy();
    expect(within(main).getByRole("link", { name: /^Local SEO \+ AEO\s*, not on your plan$/ }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("navigation", { name: "Main tabs" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("folds the sidebar to an icon rail and remembers it", async () => {
    window.localStorage.removeItem("bb.sidebar.collapsed");
    shell();
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const main = screen.getByRole("navigation", { name: "Main" });
    // Labels stay for screen readers and hover titles.
    expect(within(main).getByRole("link", { name: "Requests" }).getAttribute("title")).toBe("Requests");
    expect(screen.getByRole("button", { name: "Expand sidebar" }).getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem("bb.sidebar.collapsed")).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(window.localStorage.getItem("bb.sidebar.collapsed")).toBe("0");
  });

  it("shows the billing banner on every page but Home", () => {
    shell();
    expect(screen.getByText("Your plan has ended.")).toBeTruthy();
    navigation.pathname = "/";
    shell();
    expect(screen.getAllByText("Your plan has ended.")).toHaveLength(1);
  });

  it("opens search with Control K and goes to the highlighted page on Enter", async () => {
    shell();
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    const box = await screen.findByRole("combobox", { name: "Search pages" });
    await userEvent.type(box, "pages");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Website: Pages"]);
    await userEvent.keyboard("{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/website/pages");
  });

  it("opens search ready to type, with focus in the search box", async () => {
    shell();
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const box = await screen.findByRole("combobox", { name: "Search pages" });
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it("says when nothing matches", async () => {
    shell();
    await userEvent.click(screen.getAllByRole("button", { name: /Search/ })[0] as HTMLElement);
    await userEvent.type(await screen.findByRole("combobox", { name: "Search pages" }), "zzz");
    expect(screen.getByText("Nothing matches that.")).toBeTruthy();
  });

  it("marks the bell read when opened, keeping what waits on the customer", async () => {
    shell();
    await userEvent.click(screen.getByRole("button", { name: "Notifications, 2 new" }));
    expect(await screen.findByRole("link", { name: /Quote waiting: New home collection page/ })).toBeTruthy();
    expect(actions.markNotificationsSeenAction).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Notifications, 1 new" })).toBeTruthy();
  });

  it("shows the bell's error state instead of hiding it", async () => {
    shell({ ...VIEW, notifications: { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } });
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your notifications.");
  });

  it("tells the person when signing out failed", async () => {
    shell();
    await userEvent.click(screen.getByRole("button", { name: /Anand Verma/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(actions.signOutAction).toHaveBeenCalledOnce();
    expect((await screen.findByRole("alert")).textContent).toBe("We could not sign you out. Try again.");
  });

  it("is reduced before the kickoff call", () => {
    shell({ ...VIEW, kickoffOver: false });
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Requests", "Business profile", "Plan & billing", "Settings", "Help & calls"]);
  });
});

describe("DeploymentUpdate", () => {
  it("takes focus and offers a reload", () => {
    render(<DeploymentUpdate />);
    const heading = screen.getByRole("heading", { name: "Brandbasket was updated. Reload to continue." });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
  });
});
