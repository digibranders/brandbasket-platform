// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/support/errors" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/server/staff-notification-actions", () => ({ markStaffNotificationReadAction: vi.fn() }));

import { CONSOLE_RAIL_LINKS } from "@/lib/console-rail";
import { Rail } from "./rail";
import { TopBar } from "./top-bar";

let root: Root;
let container: HTMLDivElement;
const logo = { name: "Brandbasket", onLight: "/brand/brandbasket-logo-light.svg", onDark: "/brand/brandbasket-logo-dark.svg", width: 160, height: 32 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderRail(counts: Record<string, number>): Promise<void> {
  await act(async () => root.render(createElement(Rail, { links: CONSOLE_RAIL_LINKS, counts, userName: "Riya Kapoor", signOut: async () => undefined, logo })));
}

it("marks the item holding the open page, longest address first", async () => {
  mocks.pathname = "/support/errors";
  await renderRail({});
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("System");
  mocks.pathname = "/breaches";
  await renderRail({});
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Compliance");
});

it("shows a count only when something is waiting", async () => {
  mocks.pathname = "/";
  await renderRail({ leads: 6, requests: 1, payments: 0 });
  expect(container.querySelector('a[href="/support"]')?.textContent).toBe("Inbox7");
  expect(container.querySelector('a[href="/payments"]')?.textContent).toBe("Money");
});

it("shows no count on any item when none could be read", async () => {
  await renderRail({});
  for (const link of container.querySelectorAll("nav a")) expect(link.querySelector("span.font-figure")).toBeNull();
});

it("draws the System count in red for failed deliveries", async () => {
  await renderRail({ deliveries: 3 });
  const count = container.querySelector('a[href="/system"] span:last-child');
  expect(count?.textContent).toBe("3");
  expect(count?.className).toContain("bg-error");
});

it("shows the same six items to everyone, and the signed-in person with Sign out", async () => {
  await renderRail({});
  expect(container.textContent).toContain("Riya Kapoor");
  expect(container.textContent).toContain("Signed in");
  expect(container.querySelector('button[aria-label="Sign out"]')).not.toBeNull();
  expect(container.querySelector('a[href="/privacy-requests"]')).not.toBeNull();
  expect(container.querySelector('a[href="/payments"]')).not.toBeNull();
  expect([...container.querySelectorAll("nav a")].map((link) => link.textContent)).toEqual(["Today", "Clients", "Inbox", "Money", "Compliance", "System"]);
});

it("keeps search and the bell out of the rail", async () => {
  await renderRail({});
  expect(container.querySelector('button[aria-label^="Notifications"]')).toBeNull();
  expect(container.textContent).not.toContain("⌘K");
});

it("puts the command bar field and the bell in the top bar, with the new notices counted and listed", async () => {
  const bell = { items: [{ id: "n1", title: "Did the kickoff call with Asha Cafe happen?", body: null, href: "/", when: "17 Nov, 10:00", unread: true }], unread: 1 };
  await act(async () => root.render(createElement(TopBar, { bell })));
  expect(container.textContent).toContain("⌘K");
  expect(container.querySelector('button[aria-label="Notifications, 1 new"]')).not.toBeNull();
  expect(container.textContent).toContain("Did the kickoff call with Asha Cafe happen?");
});
