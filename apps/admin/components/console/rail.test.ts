// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/support/errors" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: vi.fn() }) }));

import { railFor } from "@/lib/console-rail";
import { Rail } from "./rail";

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

async function renderRail(role: "support" | "admin", counts: Record<string, number>): Promise<void> {
  await act(async () =>
    root.render(createElement(Rail, { links: railFor(role), counts, userName: "Riya Kapoor", role, signOut: async () => undefined, logo })),
  );
}

it("marks the item holding the open page, longest address first", async () => {
  mocks.pathname = "/support/errors";
  await renderRail("admin", {});
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Settings");
  mocks.pathname = "/projects";
  await renderRail("admin", {});
  expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe("Clients");
});

it("shows a count only when something is waiting", async () => {
  mocks.pathname = "/";
  await renderRail("admin", { leads: 6, requests: 1, calls: 0 });
  expect(container.querySelector('a[href="/support"]')?.textContent).toBe("Inbox7");
  expect(container.querySelector('a[href="/calls"]')?.textContent).toBe("Calls");
});

it("draws the Settings count in red for failed deliveries", async () => {
  await renderRail("admin", { deliveries: 3 });
  const count = container.querySelector('a[href="/settings"] span:last-child');
  expect(count?.textContent).toBe("3");
  expect(count?.className).toContain("bg-error");
});

it("shows the signed-in person, their role and Sign out", async () => {
  await renderRail("support", {});
  expect(container.textContent).toContain("Riya Kapoor");
  expect(container.textContent).toContain("Support");
  expect(container.querySelector('button[aria-label="Sign out"]')).not.toBeNull();
  expect(container.querySelector('a[href="/staff"]')).toBeNull();
  expect(container.querySelector('a[href="/payments"]')).toBeNull();
  expect(container.querySelectorAll("nav a")).toHaveLength(6);
});
